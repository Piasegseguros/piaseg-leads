"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Lead,
  AdminStats,
  getLeads,
  getFranqueados,
  getAdminStats,
  adminLogin,
  reatribuirLead,
  getAdminPassword,
  setAdminPassword,
  clearAdminPassword,
  syncNow,
} from "../lib/api";
import { formatDuration, formatDateTime } from "../lib/format";

const STATUS_COLOR: Record<string, string> = {
  "Negócio Fechado": "#0ca30c",
  "Negócio Agendado": "#fab219",
  "Sem interesse": "#ec835a",
  "Não responde": "#d03b3b",
  "Sem retorno": "#898781",
};

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    const stored = getAdminPassword();
    if (stored) {
      adminLogin(stored)
        .then(() => setAuthed(true))
        .catch(() => clearAdminPassword())
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    try {
      await adminLogin(password);
      setAdminPassword(password);
      setAuthed(true);
    } catch {
      setLoginError("Senha incorreta");
    }
  }

  if (checking) return null;

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center px-4">
        <form
          onSubmit={handleLogin}
          className="bg-white rounded-lg shadow-sm border p-6 w-full max-w-sm space-y-4"
        >
          <h1 className="text-lg font-semibold text-[#072a3c]">Admin · Gestor de Leads</h1>
          <input
            type="password"
            autoFocus
            placeholder="Senha de admin"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border rounded px-3 py-2 w-full text-sm"
          />
          {loginError && <p className="text-red-600 text-sm">{loginError}</p>}
          <button className="bg-[#072a3c] text-white px-4 py-2 rounded text-sm w-full">
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [franqueados, setFranqueados] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reatribuirSelecao, setReatribuirSelecao] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);

  async function loadAll() {
    setSincronizando(true);
    try {
      await syncNow().catch(() => {});
      const [l, s, f] = await Promise.all([getLeads(), getAdminStats(), getFranqueados()]);
      setLeads(l);
      setStats(s);
      setFranqueados(f);
      setError(null);
      setUltimaAtualizacao(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar dados");
    } finally {
      setSincronizando(false);
    }
  }

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, []);

  const maxBar = useMemo(() => {
    if (!stats) return 1;
    return Math.max(1, ...Object.values(stats.por_resposta));
  }, [stats]);

  const negociosFechados = useMemo(
    () => (leads ?? []).filter((l) => l.response === "Negócio Fechado"),
    [leads]
  );

  const reservasPorFranqueado = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const lead of leads ?? []) {
      if (!lead.reserved_by) continue;
      contagem.set(lead.reserved_by, (contagem.get(lead.reserved_by) ?? 0) + 1);
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  }, [leads]);

  async function handleReatribuir(lead: Lead) {
    const franqueado = reatribuirSelecao[lead.id];
    if (!franqueado) return;
    setBusyId(lead.id);
    try {
      const updated = await reatribuirLead(lead.id, franqueado);
      setLeads((prev) => prev?.map((l) => (l.id === lead.id ? updated : l)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao reatribuir lead");
    } finally {
      setBusyId(null);
    }
  }

  const mesAtual = new Date().getMonth() + 1;
  const statsMesAtual = stats?.meses.find((m) => m.mes === mesAtual);

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <header className="bg-[#072a3c] text-white px-6 py-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Admin · Gestor de Leads</h1>
          <p className="text-sm text-white/70">Resultados, SLA e reatribuição de leads</p>
        </div>
        <div className="flex items-center gap-4">
          {statsMesAtual && (
            <p className="text-[#c2a360] font-bold text-base sm:text-lg text-right">
              {statsMesAtual.nome}: recebemos {statsMesAtual.total_leads} leads
            </p>
          )}
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={loadAll}
              disabled={sincronizando}
              className="border border-[#c2a360] text-[#c2a360] px-4 py-2 rounded text-sm hover:bg-[#c2a360] hover:text-[#072a3c] transition shrink-0 disabled:opacity-60"
            >
              {sincronizando ? "Buscando leads novas..." : "Atualizar"}
            </button>
            {ultimaAtualizacao && !sincronizando && (
              <span className="text-xs text-white/50">
                Atualizado às {ultimaAtualizacao.toLocaleTimeString("pt-BR")}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {error && (
          <div className="bg-red-100 text-red-800 border border-red-300 rounded px-4 py-2 text-sm">{error}</div>
        )}

        {!stats || !leads ? (
          <p className="text-gray-500">Carregando...</p>
        ) : (
          <>
            <section>
              <h2 className="text-base font-semibold text-[#072a3c] mb-3">
                Média geral de {stats.ano}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatTile label="Total de leads no ano" value={String(stats.total_leads)} />
                <StatTile
                  label="Conversão de vendas no ano"
                  value={
                    stats.total_leads > 0
                      ? `${((stats.por_resposta["Negócio Fechado"] ?? 0) / stats.total_leads * 100).toFixed(1)}%`
                      : "-"
                  }
                />
                <StatTile
                  label="Tempo médio até reservar"
                  value={formatDuration(stats.tempo_medio_reserva_segundos)}
                />
                <StatTile
                  label="Tempo médio até responder"
                  value={formatDuration(stats.tempo_medio_resposta_segundos)}
                />
              </div>
            </section>

            <section className="bg-white rounded-lg shadow-sm border overflow-x-auto">
              <h2 className="text-base font-semibold text-[#072a3c] px-5 pt-5 pb-3">
                Indicadores mês a mês ({stats.ano})
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="p-3">Mês</th>
                    <th className="p-3">Total de leads</th>
                    <th className="p-3">Negócio Fechado</th>
                    <th className="p-3">Conversão</th>
                    <th className="p-3">Tempo médio p/ reservar</th>
                    <th className="p-3">Tempo médio p/ responder</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.meses.map((m) => (
                    <tr key={m.mes} className="border-b last:border-0">
                      <td className="p-3 font-medium">{m.nome}</td>
                      <td className="p-3 tabular-nums">{m.total_leads}</td>
                      <td className="p-3 tabular-nums">{m.por_resposta["Negócio Fechado"] ?? 0}</td>
                      <td className="p-3 tabular-nums">
                        {m.total_leads > 0
                          ? `${((m.por_resposta["Negócio Fechado"] ?? 0) / m.total_leads * 100).toFixed(1)}%`
                          : "-"}
                      </td>
                      <td className="p-3">{formatDuration(m.tempo_medio_reserva_segundos)}</td>
                      <td className="p-3">{formatDuration(m.tempo_medio_resposta_segundos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="bg-white rounded-lg shadow-sm border p-5">
              <h2 className="text-base font-semibold text-[#072a3c] mb-4">
                Leads por resultado ({stats.ano})
              </h2>
              <div className="space-y-3">
                {Object.entries(stats.por_resposta).map(([label, value]) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-36 text-sm text-[#52514e] shrink-0">{label}</span>
                    <div className="flex-1 bg-[#f0efec] rounded h-6 relative overflow-hidden">
                      <div
                        className="h-6 rounded"
                        style={{
                          width: `${(value / maxBar) * 100}%`,
                          backgroundColor: STATUS_COLOR[label] ?? "#898781",
                          minWidth: value > 0 ? "8px" : "0",
                        }}
                      />
                    </div>
                    <span className="w-8 text-sm text-[#0b0b0b] text-right tabular-nums">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
                <h2 className="text-base font-semibold text-[#072a3c] px-5 pt-5 pb-3">
                  Negócios fechados ({negociosFechados.length})
                </h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="p-3">Cliente</th>
                      <th className="p-3">Franqueado</th>
                      <th className="p-3">Fechado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {negociosFechados.length === 0 && (
                      <tr>
                        <td className="p-3 text-gray-400 italic" colSpan={3}>
                          Nenhum negócio fechado ainda.
                        </td>
                      </tr>
                    )}
                    {negociosFechados.map((lead) => (
                      <tr key={lead.id} className="border-b last:border-0">
                        <td className="p-3">
                          <div className="font-medium">{lead.full_name}</div>
                          <div className="text-gray-400 text-xs">{lead.phone_number}</div>
                        </td>
                        <td className="p-3">{lead.reserved_by}</td>
                        <td className="p-3 text-gray-400">
                          {lead.response_at && formatDateTime(lead.response_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
                <h2 className="text-base font-semibold text-[#072a3c] px-5 pt-5 pb-3">
                  Reservas por franqueado
                </h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="p-3">Franqueado</th>
                      <th className="p-3">Leads reservados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservasPorFranqueado.length === 0 && (
                      <tr>
                        <td className="p-3 text-gray-400 italic" colSpan={2}>
                          Nenhuma reserva ainda.
                        </td>
                      </tr>
                    )}
                    {reservasPorFranqueado.map(([franqueado, qtd]) => (
                      <tr key={franqueado} className="border-b last:border-0">
                        <td className="p-3 font-medium">{franqueado}</td>
                        <td className="p-3 tabular-nums">{qtd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white rounded-lg shadow-sm border overflow-x-auto">
              <h2 className="text-base font-semibold text-[#072a3c] px-5 pt-5">SLA por lead</h2>
              <table className="w-full text-sm mt-3">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="p-3">Lead</th>
                    <th className="p-3">Franqueado</th>
                    <th className="p-3">Resposta</th>
                    <th className="p-3">Tempo p/ reservar</th>
                    <th className="p-3">Tempo p/ responder</th>
                    <th className="p-3">Entrou em</th>
                    <th className="p-3">Reatribuir</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} className="border-b last:border-0">
                      <td className="p-3">
                        <div className="font-medium">{lead.full_name}</div>
                        <div className="text-gray-400 text-xs">{lead.phone_number}</div>
                      </td>
                      <td className="p-3">{lead.reserved_by ?? "-"}</td>
                      <td className="p-3">{lead.response ?? "-"}</td>
                      <td className="p-3">{formatDuration(lead.tempo_reserva_segundos)}</td>
                      <td className="p-3">{formatDuration(lead.tempo_resposta_segundos)}</td>
                      <td className="p-3 text-gray-400">{formatDateTime(lead.synced_at)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <select
                            className="border rounded px-2 py-1 text-xs"
                            value={reatribuirSelecao[lead.id] ?? ""}
                            onChange={(e) =>
                              setReatribuirSelecao((prev) => ({ ...prev, [lead.id]: e.target.value }))
                            }
                          >
                            <option value="">Franqueado...</option>
                            {franqueados.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                          <button
                            disabled={!reatribuirSelecao[lead.id] || busyId === lead.id}
                            onClick={() => handleReatribuir(lead)}
                            className="bg-[#072a3c] text-white px-3 py-1 rounded text-xs disabled:opacity-40"
                          >
                            Trocar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border p-5">
      <p className="text-sm text-[#52514e]">{label}</p>
      <p className="text-3xl font-semibold text-[#072a3c] mt-1">{value}</p>
    </div>
  );
}
