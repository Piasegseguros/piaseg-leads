export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Lead = {
  id: string;
  created_time: string;
  synced_at: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  campaign_name: string | null;
  ad_name: string | null;
  reserved_by: string | null;
  reserved_at: string | null;
  response: string | null;
  response_at: string | null;
  tempo_reserva_segundos: number | null;
  tempo_resposta_segundos: number | null;
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Erro ${res.status}`);
  }
  return res.json();
}

export const getLeads = () => api<Lead[]>("/leads");
export const getFranqueados = () => api<string[]>("/franqueados");
export const getRespostas = () => api<string[]>("/respostas");

export const reservarLead = (id: string, franqueado: string) =>
  api<Lead>(`/leads/${encodeURIComponent(id)}/reservar`, {
    method: "POST",
    body: JSON.stringify({ franqueado }),
  });

export const responderLead = (id: string, resposta: string) =>
  api<Lead>(`/leads/${encodeURIComponent(id)}/resposta`, {
    method: "POST",
    body: JSON.stringify({ resposta }),
  });

export type AdminStats = {
  total_leads: number;
  por_resposta: Record<string, number>;
  tempo_medio_reserva_segundos: number | null;
  tempo_medio_resposta_segundos: number | null;
};

const ADMIN_PASSWORD_KEY = "piaseg_leads_admin_password";

export const getAdminPassword = () =>
  typeof window === "undefined" ? null : sessionStorage.getItem(ADMIN_PASSWORD_KEY);

export const setAdminPassword = (password: string) =>
  sessionStorage.setItem(ADMIN_PASSWORD_KEY, password);

export const clearAdminPassword = () => sessionStorage.removeItem(ADMIN_PASSWORD_KEY);

async function adminApi<T>(path: string, options?: RequestInit): Promise<T> {
  const password = getAdminPassword() ?? "";
  return api<T>(path, {
    ...options,
    headers: { "X-Admin-Password": password, ...options?.headers },
  });
}

export const adminLogin = (password: string) =>
  api<{ ok: boolean }>("/admin/login", {
    method: "POST",
    headers: { "X-Admin-Password": password },
  });

export const getAdminStats = () => adminApi<AdminStats>("/admin/stats");

export const reatribuirLead = (id: string, franqueado: string) =>
  adminApi<Lead>(`/admin/leads/${encodeURIComponent(id)}/reatribuir`, {
    method: "POST",
    body: JSON.stringify({ franqueado }),
  });
