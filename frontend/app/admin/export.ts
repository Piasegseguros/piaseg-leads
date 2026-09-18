import * as XLSX from "xlsx";
import { AdminStats, Lead } from "../lib/api";
import { formatDuration } from "../lib/format";

function conversao(porResposta: Record<string, number>, total: number): string {
  if (total === 0) return "-";
  return `${(((porResposta["Negócio Fechado"] ?? 0) / total) * 100).toFixed(1)}%`;
}

export function exportarExcel(stats: AdminStats, leads: Lead[]) {
  const wb = XLSX.utils.book_new();

  const resumo = [
    { Indicador: "Ano", Valor: stats.ano },
    { Indicador: "Total de leads no ano", Valor: stats.total_leads },
    { Indicador: "Conversão de vendas no ano", Valor: conversao(stats.por_resposta, stats.total_leads) },
    { Indicador: "Tempo médio até reservar", Valor: formatDuration(stats.tempo_medio_reserva_segundos) },
    { Indicador: "Tempo médio até responder", Valor: formatDuration(stats.tempo_medio_resposta_segundos) },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo Anual");

  const mesAMes = stats.meses.map((m) => ({
    Mês: m.nome,
    "Total de leads": m.total_leads,
    "Negócio Fechado": m.por_resposta["Negócio Fechado"] ?? 0,
    Conversão: conversao(m.por_resposta, m.total_leads),
    "Tempo médio p/ reservar": formatDuration(m.tempo_medio_reserva_segundos),
    "Tempo médio p/ responder": formatDuration(m.tempo_medio_resposta_segundos),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mesAMes), "Mês a Mês");

  const porResultado = Object.entries(stats.por_resposta).map(([Resultado, Quantidade]) => ({
    Resultado,
    Quantidade,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porResultado), "Leads por Resultado");

  const negociosFechados = leads
    .filter((l) => l.response === "Negócio Fechado")
    .map((l) => ({
      Cliente: l.full_name,
      Telefone: l.phone_number ?? "-",
      Franqueado: l.reserved_by ?? "-",
      "Data do fechamento": l.response_at ? new Date(l.response_at).toLocaleString("pt-BR") : "-",
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(negociosFechados), "Negócios Fechados");

  const contagemPorFranqueado = new Map<string, number>();
  for (const lead of leads) {
    if (!lead.reserved_by) continue;
    contagemPorFranqueado.set(lead.reserved_by, (contagemPorFranqueado.get(lead.reserved_by) ?? 0) + 1);
  }
  const reservasSheet = [...contagemPorFranqueado.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([franqueado, qtd]) => ({ Franqueado: franqueado, "Leads reservados": qtd }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reservasSheet), "Reservas por Franqueado");

  const dataStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `piaseg-leads-indicadores-${dataStr}.xlsx`);
}
