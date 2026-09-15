import json
import os
import urllib.request
from datetime import datetime

import openpyxl
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

SHEET_PATH = os.path.expanduser(
    "~/Library/CloudStorage/GoogleDrive-piaseg@piasegmais.com.br/Meu Drive/"
    "Piaseg Franchising/TI/Lead/CRM SEGURO JÁ.xlsx"
)
BACKEND_URL = "https://piaseg-leads-backend.onrender.com"
INGEST_TOKEN = os.environ.get("PIASEG_LEADS_INGEST_TOKEN", "")

TEST_EMAILS = {"test@meta.com"}


def parse_rows():
    wb = openpyxl.load_workbook(SHEET_PATH, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    idx = {name: i for i, name in enumerate(header)}

    leads = []
    for row in rows:
        if row is None or row[idx["id"]] is None:
            continue
        email = (row[idx.get("email")] or "").strip() if idx.get("email") is not None else ""
        full_name = (row[idx["full_name"]] or "").strip()
        if email in TEST_EMAILS or full_name.startswith("<"):
            continue

        phone = row[idx["phone_number"]] if idx.get("phone_number") is not None else None
        if phone:
            phone = phone.replace("p:", "")

        created_time = row[idx["created_time"]]
        if isinstance(created_time, str):
            created_time = datetime.fromisoformat(created_time)

        leads.append({
            "id": row[idx["id"]],
            "created_time": created_time.isoformat(),
            "full_name": full_name,
            "email": email or None,
            "phone_number": phone,
            "campaign_name": row[idx.get("campaign_name")] if idx.get("campaign_name") is not None else None,
            "ad_name": row[idx.get("ad_name")] if idx.get("ad_name") is not None else None,
        })
    return leads


def main():
    if not INGEST_TOKEN:
        raise SystemExit("Defina a variável de ambiente PIASEG_LEADS_INGEST_TOKEN antes de rodar")

    leads = parse_rows()
    body = json.dumps(leads).encode("utf-8")
    req = urllib.request.Request(
        f"{BACKEND_URL}/admin/ingest-leads",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Ingest-Token": INGEST_TOKEN,
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
        print(f"{len(leads)} leads na planilha, {result['novos']} novos enviados")


if __name__ == "__main__":
    main()
