"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Lead,
  getLeads,
  getFranqueados,
  getRespostas,
  reservarLead,
  responderLead,
  syncNow,
} from "./lib/api";
import { formatDuration, formatDateTime } from "./lib/format";

export default function Home() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [franqueados, setFranqueados] = useState<string[]>([]);
  const [respostas, setRespostas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectFranqueado, setSelectFranqueado] = useState<Record<string, string>>({});
  const [selectResposta, setSelectResposta] = useState<Record<string, string>>({});

  async function loadAll() {
    try {
      await syncNow().catch(() => {});
      const [l, f, r] = await Promise.all([getLeads(), getFranqueados(), getRespostas()]);
      setLeads(l);
      setFranqueados(f);
      setRespostas(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar dados");
    }
  }

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, []);

  const ordemRecebimento = useMemo(() => {
    const map = new Map<string, number>();
    [...(leads ?? [])]
      .sort((a, b) => new Date(a.synced_at).getTime() - new Date(b.synced_at).getTime())
      .forEach((lead, i) => map.set(lead.id, i + 1));
    return map;
  }, [leads]);

  const { pendentes, emAndamento } = useMemo(() => {
    const pendentes: Lead[] = [];
    const emAndamento: Lead[] = [];
    for (const lead of leads ?? []) {
      if (!lead.reserved_by) pendentes.push(lead);
      else if (!lead.response) emAndamento.push(lead);
    }
    return { pendentes, emAndamento };
  }, [leads]);

  const leadsNoMes = useMemo(() => {
    const agora = new Date();
    return (leads ?? []).filter((lead) => {
      const d = new Date(lead.synced_at);
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    }).length;
  }, [leads]);

  const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date());
  const nomeMesCapitalizado = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);


  async function handleReservar(lead: Lead) {
    const franqueado = selectFranqueado[lead.id];
    if (!franqueado) return;
    setBusyId(lead.id);
    try {
      await loadAll();
      const updated = await reservarLead(lead.id, franqueado);
      setLeads((prev) => prev?.map((l) => (l.id === lead.id ? updated : l)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao reservar lead");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResponder(lead: Lead) {
    const resposta = selectResposta[lead.id];
    if (!resposta) return;
    setBusyId(lead.id);
    try {
      const updated = await responderLead(lead.id, resposta);
      setLeads((prev) => prev?.map((l) => (l.id === lead.id ? updated : l)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao registrar resposta");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <header className="bg-[#072a3c] text-white px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Gestor de Leads · Seguro Já</h1>
          <p className="text-sm text-white/70">Reserve um lead para trabalhar e registre o retorno do cliente</p>
        </div>
        <div className="flex items-center gap-4">
          {leads !== null && (
            <p className="text-[#c2a360] font-bold text-base sm:text-lg text-right">
              {nomeMesCapitalizado}: recebemos {leadsNoMes} leads
            </p>
          )}
          <button
            onClick={loadAll}
            className="border border-[#c2a360] text-[#c2a360] px-4 py-2 rounded text-sm hover:bg-[#c2a360] hover:text-[#072a3c] transition shrink-0"
          >
            Atualizar
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {error && (
          <div className="bg-red-100 text-red-800 border border-red-300 rounded px-4 py-2 text-sm">{error}</div>
        )}

        {leads === null && !error && <p className="text-gray-500">Carregando leads...</p>}

        <Section title={`Leads novos (${pendentes.length})`} subtitle="Ainda sem franqueado reservando">
          {pendentes.length === 0 && <EmptyState text="Nenhum lead novo no momento." />}
          <div className="grid gap-3">
            {pendentes.map((lead) => (
              <Card key={lead.id}>
                <LeadInfo lead={lead} ordem={ordemRecebimento.get(lead.id)} />
                <div className="flex items-center gap-2 mt-3">
                  <select
                    className="border rounded px-2 py-1.5 text-sm flex-1"
                    value={selectFranqueado[lead.id] ?? ""}
                    onChange={(e) =>
                      setSelectFranqueado((prev) => ({ ...prev, [lead.id]: e.target.value }))
                    }
                  >
                    <option value="">Selecione seu franqueado...</option>
                    {franqueados.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!selectFranqueado[lead.id] || busyId === lead.id}
                    onClick={() => handleReservar(lead)}
                    className="bg-[#072a3c] text-white px-4 py-1.5 rounded text-sm disabled:opacity-40"
                  >
                    Reservar
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </Section>

        <Section title={`Em andamento (${emAndamento.length})`} subtitle="Reservados, aguardando retorno">
          {emAndamento.length === 0 && <EmptyState text="Nenhum lead em andamento." />}
          <div className="grid gap-3">
            {emAndamento.map((lead) => (
              <Card key={lead.id}>
                <LeadInfo lead={lead} ordem={ordemRecebimento.get(lead.id)} />
                <p className="text-sm text-gray-500 mt-2">
                  Reservado por <span className="font-bold text-lg text-[#0ca30c]">{lead.reserved_by}</span> ·
                  demorou {formatDuration(lead.tempo_reserva_segundos)} para reservar
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <select
                    className="border rounded px-2 py-1.5 text-sm flex-1"
                    value={selectResposta[lead.id] ?? ""}
                    onChange={(e) =>
                      setSelectResposta((prev) => ({ ...prev, [lead.id]: e.target.value }))
                    }
                  >
                    <option value="">Qual foi a resposta do cliente?</option>
                    {respostas.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!selectResposta[lead.id] || busyId === lead.id}
                    onClick={() => handleResponder(lead)}
                    className="bg-[#c2a360] text-[#072a3c] px-4 py-1.5 rounded text-sm font-medium disabled:opacity-40"
                  >
                    Salvar
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      </main>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-[#072a3c]">{title}</h2>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-lg shadow-sm border p-4">{children}</div>;
}

function LeadInfo({ lead, ordem }: { lead: Lead; ordem?: number }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      {ordem && <span className="text-xs text-gray-400 font-mono">#{ordem}</span>}
      <span className="font-medium text-[#072a3c]">{lead.full_name}</span>
      {lead.phone_number && <span className="text-sm text-gray-500">{lead.phone_number}</span>}
      {lead.email && <span className="text-sm text-gray-400">{lead.email}</span>}
      <span className="text-sm text-red-600 font-medium">
        entrou em {formatDateTime(lead.synced_at)}
      </span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-gray-400 italic">{text}</p>;
}
