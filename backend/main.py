import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import desc

from database import Base, engine, SessionLocal
from models import Lead
from franqueados import get_franqueados_ativos

RESPOSTAS_PADRAO = [
    "Não responde",
    "Negócio Fechado",
    "Negócio Agendado",
    "Sem interesse",
    "Demorei para entrar em contato",
    "Já é renovação do Grupo Piaseg",
]

RESERVA_COOLDOWN_SEGUNDOS = 5 * 60

INGEST_TOKEN = os.environ["INGEST_TOKEN"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]


def _checar_admin(x_admin_password: str = Header(None)):
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(401, "Senha de admin inválida")


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Piaseg Leads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


def _serialize(lead: Lead):
    tempo_reserva_s = None
    if lead.reserved_at:
        tempo_reserva_s = (_as_utc(lead.reserved_at) - _as_utc(lead.synced_at)).total_seconds()

    tempo_resposta_s = None
    if lead.response_at and lead.reserved_at:
        tempo_resposta_s = (_as_utc(lead.response_at) - _as_utc(lead.reserved_at)).total_seconds()

    return {
        "id": lead.id,
        "created_time": lead.created_time,
        "synced_at": lead.synced_at,
        "full_name": lead.full_name,
        "email": lead.email,
        "phone_number": lead.phone_number,
        "campaign_name": lead.campaign_name,
        "ad_name": lead.ad_name,
        "reserved_by": lead.reserved_by,
        "reserved_at": lead.reserved_at,
        "response": lead.response,
        "response_at": lead.response_at,
        "tempo_reserva_segundos": tempo_reserva_s,
        "tempo_resposta_segundos": tempo_resposta_s,
    }


@app.get("/leads")
def list_leads():
    db = SessionLocal()
    try:
        leads = db.query(Lead).order_by(desc(Lead.synced_at)).all()
        return [_serialize(l) for l in leads]
    finally:
        db.close()


@app.get("/franqueados")
def franqueados():
    return get_franqueados_ativos()


@app.get("/respostas")
def respostas():
    return RESPOSTAS_PADRAO


class ReservarRequest(BaseModel):
    franqueado: str


@app.post("/leads/{lead_id}/reservar")
def reservar(lead_id: str, body: ReservarRequest):
    ativos = get_franqueados_ativos()
    if body.franqueado not in ativos:
        raise HTTPException(400, "Franqueado não encontrado na lista")

    db = SessionLocal()
    try:
        lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if not lead:
            raise HTTPException(404, "Lead não encontrado")
        if lead.reserved_by:
            raise HTTPException(409, f"Lead já reservado por {lead.reserved_by}")

        ultima_reserva = (
            db.query(Lead.reserved_at)
            .filter(Lead.reserved_by == body.franqueado)
            .order_by(desc(Lead.reserved_at))
            .first()
        )
        if ultima_reserva:
            passado = (datetime.now(timezone.utc) - _as_utc(ultima_reserva[0])).total_seconds()
            if passado < RESERVA_COOLDOWN_SEGUNDOS:
                restante = int(RESERVA_COOLDOWN_SEGUNDOS - passado)
                raise HTTPException(
                    429,
                    f"Aguarde mais {restante // 60}min {restante % 60}s para reservar outro lead",
                )

        lead.reserved_by = body.franqueado
        lead.reserved_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(lead)
        return _serialize(lead)
    finally:
        db.close()


class RespostaRequest(BaseModel):
    resposta: str


@app.post("/leads/{lead_id}/resposta")
def responder(lead_id: str, body: RespostaRequest):
    if body.resposta not in RESPOSTAS_PADRAO:
        raise HTTPException(400, "Resposta inválida")

    db = SessionLocal()
    try:
        lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if not lead:
            raise HTTPException(404, "Lead não encontrado")
        if not lead.reserved_by:
            raise HTTPException(409, "Lead ainda não foi reservado")

        lead.response = body.resposta
        lead.response_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(lead)
        return _serialize(lead)
    finally:
        db.close()


@app.post("/admin/login")
def admin_login(_: None = Depends(_checar_admin)):
    return {"ok": True}


class ReatribuirRequest(BaseModel):
    franqueado: str


@app.post("/admin/leads/{lead_id}/reatribuir")
def reatribuir(lead_id: str, body: ReatribuirRequest, _: None = Depends(_checar_admin)):
    ativos = get_franqueados_ativos()
    if body.franqueado not in ativos:
        raise HTTPException(400, "Franqueado não encontrado na lista")

    db = SessionLocal()
    try:
        lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if not lead:
            raise HTTPException(404, "Lead não encontrado")

        lead.reserved_by = body.franqueado
        lead.reserved_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(lead)
        return _serialize(lead)
    finally:
        db.close()


@app.get("/admin/stats")
def admin_stats(_: None = Depends(_checar_admin)):
    db = SessionLocal()
    try:
        leads = db.query(Lead).all()
        por_resposta = {r: 0 for r in RESPOSTAS_PADRAO}
        por_resposta["Sem retorno"] = 0
        tempos_reserva = []
        tempos_resposta = []

        for lead in leads:
            if lead.response:
                por_resposta[lead.response] = por_resposta.get(lead.response, 0) + 1
            else:
                por_resposta["Sem retorno"] += 1
            if lead.reserved_at:
                tempos_reserva.append((_as_utc(lead.reserved_at) - _as_utc(lead.synced_at)).total_seconds())
            if lead.response_at and lead.reserved_at:
                tempos_resposta.append((_as_utc(lead.response_at) - _as_utc(lead.reserved_at)).total_seconds())

        return {
            "total_leads": len(leads),
            "por_resposta": por_resposta,
            "tempo_medio_reserva_segundos": sum(tempos_reserva) / len(tempos_reserva) if tempos_reserva else None,
            "tempo_medio_resposta_segundos": sum(tempos_resposta) / len(tempos_resposta) if tempos_resposta else None,
        }
    finally:
        db.close()


class LeadIn(BaseModel):
    id: str
    created_time: datetime
    full_name: str
    email: Optional[str] = None
    phone_number: Optional[str] = None
    campaign_name: Optional[str] = None
    ad_name: Optional[str] = None


@app.post("/admin/ingest-leads")
def ingest_leads(leads: list[LeadIn], x_ingest_token: str = Header(None)):
    if x_ingest_token != INGEST_TOKEN:
        raise HTTPException(401, "Token inválido")

    db = SessionLocal()
    try:
        existing_ids = {lid for (lid,) in db.query(Lead.id).all()}
        now = datetime.now(timezone.utc)
        novos = 0
        for data in leads:
            if data.id in existing_ids:
                continue
            db.add(Lead(**data.model_dump(), synced_at=now))
            novos += 1
        db.commit()
        return {"novos": novos}
    finally:
        db.close()
