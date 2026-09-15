# Piaseg Leads

Gestor de leads do Seguro Já para franqueados Piaseg.

## Como funciona

1. O backend sincroniza a planilha "CRM SEGURO JÁ.xlsx" (Google Drive > TI > Lead) a cada 5 minutos via Google Drive API, usando uma conta de serviço.
2. Cada lead novo aparece no dashboard público (sem login) para os franqueados.
3. O franqueado reserva o lead selecionando seu nome (lista vinda de `piaseg-franqueados-backend.onrender.com/franqueados`).
4. Depois de trabalhar o lead, o franqueado registra a resposta do cliente (Não responde, Negócio Fechado, Negócio Agendado, Sem interesse, Achou Caro).
5. O sistema calcula automaticamente o tempo até a reserva e o tempo até a resposta.

## Estrutura

- `backend/` — FastAPI + Postgres (Render)
- `frontend/` — Next.js (Vercel)

## Variáveis de ambiente

Backend (Render):
- `DATABASE_URL` — preenchido automaticamente pelo Render Postgres
- `GOOGLE_SERVICE_ACCOUNT_JSON` — JSON da conta de serviço do Google com acesso de leitura à planilha

Frontend (Vercel):
- `NEXT_PUBLIC_API_URL` — URL do backend no Render
