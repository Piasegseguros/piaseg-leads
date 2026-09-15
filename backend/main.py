import logging
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import desc

from database import Base, engine, SessionLocal
from models import Lead
from franqueados import get_franqueados_ativos
from sync import sync_leads

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("piaseg-leads")

RESPOSTAS_PADRAO = [
    "Não responde",
    "Negócio Fechado",
    "Negócio Agendado",
    "Sem interesse",
    "Achou Caro",
]

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Piaseg Leads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _run_sync():
    try:
        n = sync_leads()
        if n:
            logger.info(f"sync: {n} leads novos")
    except Exception:
        logger.exception("falha ao sincronizar leads")


scheduler = BackgroundScheduler()
scheduler.add_job(_run_sync, "interval", minutes=5, id="sync_leads")


@app.on_event("startup")
def startup():
    scheduler.start()
    _run_sync()


@app.get("/health")
def health():
    return {"status": "ok"}


def _serialize(lead: Lead):
    tempo_reserva_s = None
    if lead.reserved_at:
        tempo_reserva_s = (lead.reserved_at - lead.synced_at).total_seconds()

    tempo_resposta_s = None
    if lead.response_at and lead.reserved_at:
        tempo_resposta_s = (lead.response_at - lead.reserved_at).total_seconds()

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


@app.post("/admin/sync")
def manual_sync():
    n = sync_leads()
    return {"novos": n}
