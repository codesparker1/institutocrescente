/**
 * Lado do orquestrador da telemetria (contraparte de src/lib/telemetria.ts). Escreve SimEvento
 * diretamente na BD — não pode reaproveitar o módulo da app porque esse é `server-only`, e os
 * agentes correm em tsx (mesma barreira documentada em scripts/simulacao/db-helpers.ts).
 *
 * É isto que enche as raias do painel de simulação. Antes disto, o enum SimEventoTipo já tinha
 * `AGENTE_SIMULACAO` mas nada o escrevia: a tabela tinha só jobs, saltos de relógio e acessos ao
 * dashboard — 0 eventos de agentes. Tudo o que os agentes faziam ficava em linhas de texto no
 * relatorio.json, ilegível por qualquer coisa que não fosse um humano.
 *
 * Tudo fire-and-forget, mesmo contrato de registarSimEvento e de registrarAuditoria: uma falha de
 * telemetria NUNCA derruba nem atrasa a ação simulada. Uma simulação que rebenta por causa do seu
 * próprio instrumento de medida não mede nada.
 */
import "dotenv/config";
import dotenv from "dotenv";
import path from "node:path";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { entidadeDaRota } from "../../src/lib/simulacao";

dotenv.config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * A identidade da corrida é o basename do outputDir (ex. "ano-1787003991451"). Reaproveitado de
 * propósito em vez de um parâmetro novo: o outputDir já é passado a TODOS os agentes (é o que
 * instrumentarPagina usa para guardar screenshots), por isso o runId chega a toda a parte sem
 * atravessar 15 assinaturas de função.
 */
export function runIdDe(outputDir: string): string {
  return path.basename(outputDir);
}

/**
 * O papel do agente ("aluno-3", "professor-1", "secretaria") para o User.role correspondente, que
 * é o que raiaDoPapel() usa para escolher a coluna do painel. Os agentes são baptizados em
 * db-helpers.getContextoSimulacao com este prefixo mais um índice.
 */
export function papelParaRole(papel: string): string {
  const base = papel.split("-")[0].toLowerCase();
  if (base === "aluno") return "ALUNO";
  if (base === "professor") return "PROFESSOR";
  if (base === "secretaria") return "SECRETARIA";
  if (base === "daac") return "DAAC";
  if (base === "admin") return "ADMIN";
  return "DESCONHECIDO";
}

export interface EventoAgente {
  /** Carrega o runId — ver runIdDe. */
  outputDir: string;
  /** "aluno-3", "secretaria", "professor-1"… */
  papel: string;
  /** O que o agente fez, em linguagem de quem lê o painel: "Confirma propina de Março". */
  acao: string;
  /** Rota visitada — dela sai a entidade, sem o agente ter de a declarar. */
  rota?: string;
  /** Entidade explícita, para escritas onde o id não está na URL. Vence a derivada da rota. */
  entidade?: string | null;
  /** Id do aluno a que a conta do agente pertence — a entidade das páginas "as minhas coisas". */
  alunoId?: string | null;
  userId?: string | null;
  /** Mudou estado (true) ou só consultou (false, por omissão). */
  escrita?: boolean;
  duracaoMs?: number;
  detalhes?: Record<string, unknown>;
}

/**
 * A data simulada é lida por evento, não guardada em cache. Um salto de relógio é precisamente o
 * momento mais interessante da corrida, e uma cache com TTL erraria os primeiros eventos logo a
 * seguir ao salto — exatamente os que interessam. O custo é uma query minúscula por evento, junto
 * de uma navegação de browser que demora centenas de ms; se alguma vez aparecer no cost-meter, a
 * correção é invalidar a cache a partir de avancarRelogio, não encurtar o TTL.
 */
async function dataSimuladaAgora(): Promise<Date> {
  try {
    const relogio = await prisma.relogioSimulado.findUnique({ where: { id: "config" } });
    return relogio?.agora ?? new Date();
  } catch {
    return new Date();
  }
}

export async function registarEventoAgente(evento: EventoAgente): Promise<void> {
  try {
    const dataSimulada = await dataSimuladaAgora();

    // Precedência: o que o agente declarou, depois o que a rota revela, e por fim o próprio aluno.
    // A última é o que faz "/minhas-notas" correlacionar com "/alunos/<id>/financeiro": sem ela, as
    // páginas "as minhas coisas" não têm id na URL e o fluxo Secretaria → Estudante nunca aparecia,
    // apesar de ser o mais comum do sistema.
    const entidade =
      evento.entidade ??
      (evento.rota ? entidadeDaRota(evento.rota) : null) ??
      (evento.alunoId ? `aluno:${evento.alunoId}` : null);

    await prisma.simEvento.create({
      data: {
        tipo: "AGENTE_SIMULACAO",
        dataSimulada,
        offsetMs: BigInt(dataSimulada.getTime() - Date.now()),
        userId: evento.userId ?? null,
        userRole: papelParaRole(evento.papel),
        etiqueta: evento.acao,
        detalhes: { papel: evento.papel, rota: evento.rota ?? null, ...(evento.detalhes ?? {}) } as never,
        duracaoMs: evento.duracaoMs,
        runId: runIdDe(evento.outputDir),
        entidade,
        escrita: evento.escrita ?? false,
      },
    });
  } catch (error) {
    console.error("[telemetria] falhou a registar evento do agente:", error);
  }
}

export async function desligarTelemetria(): Promise<void> {
  await prisma.$disconnect();
}
