"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { podeLancarNota } from "@/lib/permissions";
import { EPOCA_LABEL, diasPrazoParaEpoca, calcularNotaFinal, extrairNotasPorEpoca } from "@/lib/avaliacao";
import { isUniqueConstraintViolation } from "@/lib/prisma-errors";
import { getAgora } from "@/lib/tempo";
import type { Epoca } from "@/generated/prisma/client";

export interface LancarNotaState {
  error?: string;
}

const EPOCAS = ["P1", "P2", "EXAME", "RECURSO", "EXAME_ESPECIAL"] as const;

const LancarNotasEmLoteSchema = z
  .array(
    z.object({
      turmaDisciplinaId: z.string().min(1),
      epoca: z.enum(EPOCAS),
      inscricaoCadeiraId: z.string().min(1),
      valor: z.coerce.number().min(0).max(20),
    }),
  )
  .min(1)
  .max(500);

/**
 * Cria a Avaliacao de uma época que ainda não tinha sido formalmente agendada em Horário e Provas
 * — o professor não devia ter de sair da pauta para "agendar" o Recurso antes de poder registar
 * que um aluno já o fez. `data` = hoje (é literalmente quando a nota está a ser lançada); `sala`
 * herda de outra avaliação já existente da disciplina, ou "A confirmar" se for a primeira de todas.
 * Prazo de lançamento calculado com a mesma configuração do DAAC usada em createProvaAction.
 */
async function criarAvaliacaoEmFalta(turmaDisciplinaId: string, epoca: Epoca, salaHerdada: string) {
  const config = await prisma.configuracaoAcademica.upsert({ where: { id: "config" }, update: {}, create: { id: "config" } });
  const agora = getAgora();
  const dias = diasPrazoParaEpoca(config, epoca);
  const prazoLancamento = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + dias);
  try {
    return await prisma.avaliacao.create({
      data: { turmaDisciplinaId, epoca, sala: salaHerdada, data: agora, prazoLancamento },
    });
  } catch (error) {
    // Corrida rara entre dois lançamentos em simultâneo para a mesma época em falta — a que
    // perdeu a corrida do @@unique([turmaDisciplinaId, epoca]) só precisa de reler a que ganhou.
    if (isUniqueConstraintViolation(error)) {
      return prisma.avaliacao.findUniqueOrThrow({ where: { turmaDisciplinaId_epoca: { turmaDisciplinaId, epoca } } });
    }
    throw error;
  }
}

/**
 * Grava várias notas de uma vez (uma coluna da pauta, ou vários alunos/épocas em simultâneo) — o
 * professor edita a grelha inteira e só depois clica "Guardar". Em vez de N chamadas (uma por
 * célula, cada uma repetindo auth + validação + lookup da avaliação), faz os lookups uma única vez
 * para o lote inteiro. Só as células realmente alteradas entram no pedido — gravar uma nota isolada
 * continua a enviar um lote de tamanho 1, sem tocar nas restantes.
 *
 * Identificado por (turmaDisciplinaId, época), não por avaliacaoId — a pauta mostra sempre as 5
 * colunas possíveis, mesmo antes de Recurso/Exame Especial terem sido formalmente agendados; a
 * Avaliacao correspondente é criada aqui, na primeira vez que alguém lança uma nota para essa
 * época (ver criarAvaliacaoEmFalta).
 */
export async function lancarNotasEmLoteAction(entradas: unknown): Promise<LancarNotaState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Sem permissão para esta ação." };
  }

  const parsed = LancarNotasEmLoteSchema.safeParse(entradas);
  if (!parsed.success) {
    return { error: "Dados inválidos (notas devem estar entre 0 e 20)." };
  }
  const entries = parsed.data;

  // A pauta é sempre de uma única turma-disciplina — um lote a apontar para mais do que uma é
  // um pedido forjado, nunca algo que a UI produz.
  const turmaDisciplinaIds = new Set(entries.map((e) => e.turmaDisciplinaId));
  if (turmaDisciplinaIds.size > 1) {
    return { error: "Lote inválido — abrange mais do que uma disciplina." };
  }
  const turmaDisciplinaId = entries[0].turmaDisciplinaId;

  const turmaDisciplina = await prisma.turmaDisciplina.findUnique({ where: { id: turmaDisciplinaId } });
  if (!turmaDisciplina) {
    return { error: "Disciplina não encontrada." };
  }

  const agora = getAgora();
  const avaliacoesExistentes = await prisma.avaliacao.findMany({ where: { turmaDisciplinaId } });
  const avaliacaoPorEpoca = new Map(avaliacoesExistentes.map((a) => [a.epoca, a]));
  const epocasEnvolvidas = [...new Set(entries.map((e) => e.epoca))];

  for (const epoca of epocasEnvolvidas) {
    const avaliacao = avaliacaoPorEpoca.get(epoca);
    // Uma época ainda sem Avaliacao formal nunca está "fora de prazo" — está a nascer agora mesmo.
    const prazoAberto = avaliacao ? avaliacao.prazoLancamento >= agora : true;
    if (!podeLancarNota(session.user, turmaDisciplina, prazoAberto)) {
      return { error: prazoAberto ? "Sem permissão para lançar notas nesta disciplina." : "Prazo de lançamento encerrado. Peça ao DAAC para lançar ou corrigir estas notas." };
    }
  }

  const inscricoesValidas = await prisma.inscricaoCadeira.findMany({
    where: { turmaDisciplinaId, ativa: true },
    select: { id: true },
  });
  const inscricaoIdsValidas = new Set(inscricoesValidas.map((i) => i.id));
  for (const entrada of entries) {
    if (!inscricaoIdsValidas.has(entrada.inscricaoCadeiraId)) {
      return { error: "Aluno não está inscrito nesta disciplina." };
    }
  }

  const salaHerdada = avaliacoesExistentes[0]?.sala ?? "A confirmar";
  for (const epoca of epocasEnvolvidas) {
    if (!avaliacaoPorEpoca.has(epoca)) {
      avaliacaoPorEpoca.set(epoca, await criarAvaliacaoEmFalta(turmaDisciplinaId, epoca, salaHerdada));
    }
  }

  const resolvidas = entries.map((e) => ({
    avaliacaoId: avaliacaoPorEpoca.get(e.epoca)!.id,
    inscricaoCadeiraId: e.inscricaoCadeiraId,
    valor: e.valor,
  }));

  const avaliacaoIdsEnvolvidas = [...new Set(resolvidas.map((e) => e.avaliacaoId))];
  const notasExistentes = await prisma.nota.findMany({ where: { avaliacaoId: { in: avaliacaoIdsEnvolvidas } } });
  const notaExistentePorChave = new Map(notasExistentes.map((n) => [`${n.avaliacaoId}:${n.inscricaoCadeiraId}`, n]));

  const aCriar = resolvidas.filter((e) => !notaExistentePorChave.has(`${e.avaliacaoId}:${e.inscricaoCadeiraId}`));
  const aAtualizar = resolvidas.filter((e) => notaExistentePorChave.has(`${e.avaliacaoId}:${e.inscricaoCadeiraId}`));

  await prisma.$transaction([
    ...(aCriar.length > 0
      ? [prisma.nota.createMany({ data: aCriar.map((e) => ({ avaliacaoId: e.avaliacaoId, inscricaoCadeiraId: e.inscricaoCadeiraId, valor: e.valor })) })]
      : []),
    ...aAtualizar.map((e) =>
      prisma.nota.update({
        where: { avaliacaoId_inscricaoCadeiraId: { avaliacaoId: e.avaliacaoId, inscricaoCadeiraId: e.inscricaoCadeiraId } },
        data: { valor: e.valor },
      }),
    ),
  ]);

  // Uma correção a montante (ex.: o Exame estava errado, subiu e já aprova sozinho) pode deixar
  // para trás notas de épocas posteriores lançadas antes da correção (ex.: um Recurso que já não
  // é preciso) — calcularNotaFinal sabe exatamente quais, porque é a mesma cascata que decide o
  // resultado final. Sem isto, essas notas ficam esquecidas na BD, visíveis e editáveis para sempre.
  const inscricaoIdsTocadas = [...new Set(resolvidas.map((e) => e.inscricaoCadeiraId))];
  const inscricoesComNotas = await prisma.inscricaoCadeira.findMany({
    where: { id: { in: inscricaoIdsTocadas } },
    select: {
      id: true,
      permiteDispensaAplicada: true,
      notaMinimaDispensaAplicada: true,
      notas: { select: { id: true, valor: true, avaliacao: { select: { epoca: true } } } },
    },
  });
  const notaIdsOrfas: string[] = [];
  for (const inscricao of inscricoesComNotas) {
    const notasCadeira = extrairNotasPorEpoca(inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao })));
    const resultado = calcularNotaFinal(notasCadeira, {
      permiteDispensa: inscricao.permiteDispensaAplicada,
      notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
    });
    if (resultado.epocasOrfas.length === 0) continue;
    const orfasSet = new Set(resultado.epocasOrfas);
    for (const nota of inscricao.notas) {
      if (orfasSet.has(nota.avaliacao.epoca)) notaIdsOrfas.push(nota.id);
    }
  }
  if (notaIdsOrfas.length > 0) {
    await prisma.nota.deleteMany({ where: { id: { in: notaIdsOrfas } } });
  }

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Lançou/atualizou ${entries.length} nota(s) em lote (${epocasEnvolvidas.map((e) => EPOCA_LABEL[e]).join(", ")}) em "${turmaDisciplinaId}"`,
    entityType: "Nota",
    entityId: turmaDisciplinaId,
  });

  revalidatePath(`/notas`);
  revalidatePath(`/professor`);
  return {};
}
