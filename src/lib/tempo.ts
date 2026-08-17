import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Relógio simulado — usado só pelo harness de simulação de ano letivo (scripts/simulacao/).
 * Fora de simulação (SIMULATION_MODE não definida) `getAgora()` é sempre `new Date()`: zero
 * efeito em produção ou no dia a dia de desenvolvimento.
 *
 * O script Playwright corre como processo Node separado do `next dev`/`next start` e só fala com
 * ele por HTTP — não pode mudar variáveis de ambiente do servidor a meio da simulação. Por isso o
 * relógio vive num ficheiro partilhado no filesystem (não na BD: é infraestrutura de teste, não
 * merece um modelo Prisma nem uma migração): o orquestrador escreve a data simulada antes de cada
 * marco do ano, e qualquer pedido ao servidor a partir daí lê a data nova.
 */
export const SIMULATION_MODE = process.env.SIMULATION_MODE === "true";

export const RELOGIO_PATH = path.join(process.cwd(), "scripts", "simulacao", ".relogio");

export function getAgora(): Date {
  if (!SIMULATION_MODE) return new Date();
  try {
    const data = new Date(readFileSync(RELOGIO_PATH, "utf-8").trim());
    if (!Number.isNaN(data.getTime())) return data;
  } catch {
    // Ficheiro ainda não existe — simulação ainda não definiu um relógio, usa a hora real.
  }
  return new Date();
}
