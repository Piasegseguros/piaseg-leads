import time
import urllib.request
import json

FRANQUEADOS_API = "https://piaseg-franqueados-backend.onrender.com/franqueados"
CACHE_TTL_SECONDS = 300

_cache = {"data": [], "fetched_at": 0}


def get_franqueados_ativos():
    now = time.time()
    if now - _cache["fetched_at"] < CACHE_TTL_SECONDS and _cache["data"]:
        return _cache["data"]

    with urllib.request.urlopen(FRANQUEADOS_API, timeout=15) as resp:
        data = json.loads(resp.read())

    ativos = sorted(
        (f["nome_fantasia"] for f in data if f.get("status") == "ativo"),
        key=str.lower,
    )
    _cache["data"] = ativos
    _cache["fetched_at"] = now
    return ativos
