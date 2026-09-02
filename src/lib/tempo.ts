import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Relógio simulado — a "máquina do tempo" do papel DEV (src/app/(dashboard)/dev/relogio/).
 * Fora de simulação (SIMULATION_MODE não definida) `getAgora()` é sempre `new Date()`: zero
 * efeito em produção ou no dia a dia de desenvolvimento.
 *
 * A data simulada vive na BD (modelo RelogioSimulado, id fixo "config"), não num ficheiro —
 * para funcionar também em deploys serverless/self-hosted, onde o filesystem não é partilhado
 * nem gravável. O DEV avança-a pela página /dev/relogio (src/actions/dev.ts) e o próximo acesso
 * ao dashboard dispara as reacções preguiçosas (garantirCobrancasGeradas, garantirSuspensaoAutomatica,
 * garantirTurmasSincronizadasComPlano) contra a data nova — é assim que "avançar o tempo" tem efeito
 * real. Os zeros por falta já não estão nesta lista: desde §2026-09-02 vêm do fecho do semestre.
 *
 * Só consultado quando SIMULATION_MODE=true. Fora disso, fazer a query por request nem sequer acontece.
 */
export const SIMULATION_MODE = process.env.SIMULATION_MODE === "true";

export async function getAgora(): Promise<Date> {
  if (!SIMULATION_MODE) return new Date();
  try {
    const relogio = await prisma.relogioSimulado.findUnique({ where: { id: "config" } });
    if (relogio) return relogio.agora;
  } catch {
    // Relógio ainda não existe — simulação ainda não definiu a data, usa a hora real.
  }
  return new Date();
}

/** Versão síncrona para sítios que não podem esperar (ex.: render inicial de client components). */
export function getAgoraSincrono(): Date {
  return new Date();
}