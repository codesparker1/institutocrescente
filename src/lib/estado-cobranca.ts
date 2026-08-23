import { ehVencidoAlemDaTolerancia } from "@/lib/divida";

// NOTA: sem "server-only" de propósito — os labels/tones são usados por Client Components
// (MultasPendentes, PropinasMensais). A derivação em si corre sempre no servidor (recebe agora
// da BD), mas o módulo tem de ser importável dos dois lados.

/**
 * Estado VISUAL de uma cobrança (Opção A — derivação, não persistência): PAGO, ou PENDENTE
 * partido em "aguarda vencimento" vs "DEVENDO" pela MESMA função (ehVencidoAlemDaTolerancia)
 * que o portão de bloqueio de notas usa. Assim o que o ecrã chama "Devendo" é, por construção,
 * exatamente o que está a bloquear — sem coluna nova na BD, sem job a mudar estados, sem drift.
 */
export type EstadoCobrancaVisual = "PAGO" | "AGUARDA_VENCIMENTO" | "DEVENDO";

export function estadoCobrancaVisual(
  status: "PENDENTE" | "PAGO",
  dataVencimento: Date,
  toleranciaDias: number,
  agora: Date,
): EstadoCobrancaVisual {
  if (status === "PAGO") return "PAGO";
  return ehVencidoAlemDaTolerancia(dataVencimento, toleranciaDias, agora) ? "DEVENDO" : "AGUARDA_VENCIMENTO";
}

export const ESTADO_COBRANCA_LABEL: Record<EstadoCobrancaVisual, string> = {
  PAGO: "Pago",
  AGUARDA_VENCIMENTO: "Aguarda vencimento",
  DEVENDO: "Devendo",
};

export const ESTADO_COBRANCA_TONE: Record<EstadoCobrancaVisual, "success" | "neutral" | "danger"> = {
  PAGO: "success",
  AGUARDA_VENCIMENTO: "neutral",
  DEVENDO: "danger",
};
