import csv
import io
import urllib.request
from datetime import datetime, timezone

from database import SessionLocal
from models import Lead

SHEET_SOURCES = [
    {"sheet_id": "1m9JVvR2nHgunRGbWjOypmWbZCXAZhNBVbR8CD1qgAss", "gid": "868456836"},
    {"sheet_id": "1RpIeGvgJ11luRevBiAVHIINYIK77bKKPnVhb9IspCeU", "gid": "0"},
]

TEST_EMAILS = {"test@meta.com"}

# Operação começou do zero em 2026-09-16: leads anteriores a isso já
# foram tratados manualmente e não devem voltar a aparecer no painel.
SYNC_CUTOFF = datetime(2026, 9, 16, 17, 0, tzinfo=timezone.utc)


def _fetch_rows(sheet_id: str, gid: str):
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
    with urllib.request.urlopen(url, timeout=30) as resp:
        content = resp.read().decode("utf-8")
    return csv.DictReader(io.StringIO(content))


def _parse_rows():
    for source in SHEET_SOURCES:
        for row in _fetch_rows(source["sheet_id"], source["gid"]):
            lead_id = row.get("id")
            if not lead_id:
                continue

            email = (row.get("email") or "").strip()
            full_name = (row.get("full_name") or "").strip()
            if email in TEST_EMAILS or full_name.startswith("<"):
                continue

            phone = row.get("phone_number") or None
            if phone:
                phone = phone.replace("p:", "")

            created_time = datetime.fromisoformat(row["created_time"])
            if created_time < SYNC_CUTOFF:
                continue

            yield {
                "id": lead_id,
                "created_time": created_time,
                "full_name": full_name,
                "email": email or None,
                "phone_number": phone,
                "campaign_name": row.get("campaign_name") or None,
                "ad_name": row.get("ad_name") or None,
                "tipo_seguro": row.get("escolha_o_tipo_de_seguro") or None,
            }


def sync_leads() -> int:
    db = SessionLocal()
    try:
        existing_ids = {lid for (lid,) in db.query(Lead.id).all()}
        now = datetime.now(timezone.utc)
        novos = 0
        for data in _parse_rows():
            if data["id"] in existing_ids:
                continue
            db.add(Lead(**data, synced_at=now))
            novos += 1
        db.commit()
        return novos
    finally:
        db.close()
