import csv
import io
import urllib.request
from datetime import datetime, timezone

from database import SessionLocal
from models import Lead

SHEET_ID = "1m9JVvR2nHgunRGbWjOypmWbZCXAZhNBVbR8CD1qgAss"
SHEET_GID = "868456836"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={SHEET_GID}"

TEST_EMAILS = {"test@meta.com"}


def _fetch_rows():
    with urllib.request.urlopen(CSV_URL, timeout=30) as resp:
        content = resp.read().decode("utf-8")
    return csv.DictReader(io.StringIO(content))


def _parse_rows():
    for row in _fetch_rows():
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

        yield {
            "id": lead_id,
            "created_time": created_time,
            "full_name": full_name,
            "email": email or None,
            "phone_number": phone,
            "campaign_name": row.get("campaign_name") or None,
            "ad_name": row.get("ad_name") or None,
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
