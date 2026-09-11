/**
 * Lado do orquestrador do relógio simulado (contraparte de `getAgora()` em `src/lib/tempo.ts`).
 * Escreve a data simulada diretamente na BD (modelo RelogioSimulado, id fixo "config") — o mesmo
 * canal que getAgora() lê. Antes escrevia um ficheiro `.relogio` que ninguém lia: os saltos da
 * simulação eram silenciosamente ignorados pelo servidor.
 *
 * Regista também cada salto como SimEvento (telemetria), para o relatório reconstruir a linha
 * temporal de saltos fora da aplicação. Falha aqui é fatal de propósito — uma simulação com o
 * relógio a não avançar produz resultados sem valor.
 */
import "dotenv/config";
import dotenv from "dotenv";
import path from "node:path";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * A corrida a que os saltos pertencem. Definida uma vez pelo orquestrador logo a seguir a criar o
 * outputDir, em vez de passada em cada `avancarRelogio(data)`: são 8 chamadas espalhadas por 5
 * orquestradores, e nenhuma delas tem razão nenhuma para falar de telemetria.
 *
 * Sem isto os saltos de relógio ficam sem runId — e no painel são justamente os marcos que
 * separam as fases da corrida, ou seja, o que dá sentido a tudo o que está à volta deles.
 */
let corridaAtual: string | null = null;

export function definirCorrida(outputDir: string): void {
  corridaAtual = path.basename(outputDir);
}

export function avancarRelogio(data: Date): void {
  void avancarRelogioAsync(data);
}

export async function avancarRelogioAsync(data: Date): Promise<void> {
  await prisma.relogioSimulado.upsert({
    where: { id: "config" },
    update: { agora: data },
    create: { id: "config", agora: data },
  });
  await prisma.simEvento.create({
    data: {
      tipo: "SALTO_RELOGIO",
      dataSimulada: data,
      offsetMs: BigInt(data.getTime() - Date.now()),
      etiqueta: "Salto de relógio",
      detalhes: { origem: "orquestrador", para: data.toISOString() },
      runId: corridaAtual,
    },
  });
}
