import "server-only";
import { prisma } from "@/lib/prisma";
import { SIMULATION_MODE } from "@/lib/tempo";

/**
 * Telemetria da simulação — captura maciça de dados sob tempo acelerado, para análise posterior.
 * Tudo é fire-and-forget: uma falha de telemetria NUNCA derruba nem atrasa a ação que a originou
 * (mesmo contrato de registrarAuditoria). Só escreve com SIMULATION_MODE=true — zero custo fora
 * de simulação.
 */

export type SimEventoTipoInput = "SALTO_RELOGIO" | "REPOR_RELOGIO" | "JOB_GARANTIR" | "ACESSO_DASHBOARD" | "AGENTE_SIMULACAO";

interface RegistarSimEventoInput {
  tipo: SimEventoTipoInput;
  dataSimulada: Date;
  etiqueta: string;
  userId?: string | null;
  userRole?: string | null;
  detalhes?: Record<string, unknown>;
  duracaoMs?: number;
}

export async function registarSimEvento(input: RegistarSimEventoInput): Promise<void> {
  if (!SIMULATION_MODE) return;
  try {
    await prisma.simEvento.create({
      data: {
        tipo: input.tipo,
        dataSimulada: input.dataSimulada,
        offsetMs: BigInt(input.dataSimulada.getTime() - Date.now()),
        userId: input.userId ?? null,
        userRole: input.userRole ?? null,
        etiqueta: input.etiqueta,
        detalhes: input.detalhes === undefined ? undefined : (input.detalhes as never),
        duracaoMs: input.duracaoMs,
      },
    });
  } catch (error) {
    console.error("Falha ao registar evento de simulação:", error);
  }
}

/** Versão sem await para hot paths (layout do dashboard) — dispara e esquece. */
export function registarSimEventoFogoEForge(input: RegistarSimEventoInput): void {
  void registarSimEvento(input);
}

/**
 * Mede a duração real de um job preguiçoso (garantir*) e registra o resultado como telemetria.
 * Uso: `await medirJobGarantir("garantirCobrancasGeradas", () => garantirCobrancasGeradas())`.
 */
export async function medirJobGarantir<T>(etiqueta: string, fn: () => Promise<T>): Promise<T> {
  if (!SIMULATION_MODE) return fn();
  const inicio = Date.now();
  try {
    return await fn();
  } finally {
    const duracaoMs = Date.now() - inicio;
    const dataSimulada = await import("@/lib/tempo").then((m) => m.getAgora());
    registarSimEventoFogoEForge({ tipo: "JOB_GARANTIR", dataSimulada, etiqueta, duracaoMs });
  }
}
