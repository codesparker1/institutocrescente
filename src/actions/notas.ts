"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { podeLancarNota, requireGerirCurriculo } from "@/lib/permissions";
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
  const agora = await getAgora();
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
 * Upsert de um lote de notas já resolvido (avaliacaoId+inscricaoCadeiraId+valor) e limpeza das
 * notas órfãs que uma correção a montante possa deixar para trás (ex.: o Exame estava errado,
 * subiu e já aprova sozinho — um Recurso lançado antes da correção deixa de fazer sentido).
 * Partilhado por lancarNotasEmLoteAction (pauta do professor), guardarNotaHistoricaAction
 * (correção do DAAC a uma inscrição antiga/inativa) e creditarCadeiraAction (aproveitamento).
 */
async function gravarNotasEAtualizarOrfas(resolvidas: { avaliacaoId: string; inscricaoCadeiraId: string; valor: number }[]): Promise<void> {
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

  const agora = await getAgora();
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

  await gravarNotasEAtualizarOrfas(resolvidas);

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

const EPOCA_CAMPO: Record<Epoca, string> = {
  P1: "p1",
  P2: "p2",
  EXAME: "exame",
  RECURSO: "recurso",
  EXAME_ESPECIAL: "exameEspecial",
};

export interface GuardarNotaHistoricaState {
  error?: string;
}

/**
 * Corrige/lança notas de UMA InscricaoCadeira específica, sem o filtro `ativa: true` de
 * lancarNotasEmLoteAction — é essa a única barreira real que impedia o DAAC de corrigir uma
 * cadeira de um ano anterior (inativa) fora da pauta corrente do professor. Um campo vazio no
 * formulário não altera a nota dessa época (não confundir "deixei em branco" com "quero apagar").
 */
export async function guardarNotaHistoricaAction(_prevState: GuardarNotaHistoricaState, formData: FormData): Promise<GuardarNotaHistoricaState> {
  const session = await requireGerirCurriculo();

  const inscricaoCadeiraId = String(formData.get("inscricaoCadeiraId") ?? "");
  const inscricao = await prisma.inscricaoCadeira.findUnique({
    where: { id: inscricaoCadeiraId },
    select: { id: true, turmaDisciplinaId: true },
  });
  if (!inscricao) {
    return { error: "Inscrição não encontrada." };
  }

  const entradas: { epoca: Epoca; valor: number }[] = [];
  for (const epoca of EPOCAS) {
    const bruto = formData.get(EPOCA_CAMPO[epoca]);
    if (bruto === null || bruto === "") continue;
    const valor = Number(bruto);
    if (Number.isNaN(valor) || valor < 0 || valor > 20) {
      return { error: "Notas devem estar entre 0 e 20." };
    }
    entradas.push({ epoca, valor });
  }
  if (entradas.length === 0) {
    return { error: "Nenhuma nota indicada." };
  }

  const turmaDisciplinaId = inscricao.turmaDisciplinaId;
  const avaliacoesExistentes = await prisma.avaliacao.findMany({ where: { turmaDisciplinaId } });
  const avaliacaoPorEpoca = new Map(avaliacoesExistentes.map((a) => [a.epoca, a]));
  const salaHerdada = avaliacoesExistentes[0]?.sala ?? "A confirmar";
  for (const entrada of entradas) {
    if (!avaliacaoPorEpoca.has(entrada.epoca)) {
      avaliacaoPorEpoca.set(entrada.epoca, await criarAvaliacaoEmFalta(turmaDisciplinaId, entrada.epoca, salaHerdada));
    }
  }

  const resolvidas = entradas.map((e) => ({
    avaliacaoId: avaliacaoPorEpoca.get(e.epoca)!.id,
    inscricaoCadeiraId: inscricao.id,
    valor: e.valor,
  }));
  await gravarNotasEAtualizarOrfas(resolvidas);

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Corrigiu ${entradas.length} nota(s) histórica(s) (${entradas.map((e) => EPOCA_LABEL[e.epoca]).join(", ")}) da inscrição "${inscricao.id}"`,
    entityType: "Nota",
    entityId: inscricao.id,
  });

  revalidatePath(`/alunos`);
  revalidatePath(`/minhas-notas`);
  return {};
}

export interface CreditarCadeiraState {
  error?: string;
}

/**
 * Aproveitamento de uma cadeira já aprovada noutra instituição (aluno transferido, §pergunta do
 * cliente 2026-08-18) — cria uma InscricaoCadeira nunca frequentada aqui. Sem estado novo no
 * motor de avaliação: grava a mesma nota em P1, P2 e Exame, e a cascata já existente de
 * calcularNotaFinal resolve sozinha para APROVADO/REPROVADO, com a mesma regra de qualquer aluno.
 */
export async function creditarCadeiraAction(_prevState: CreditarCadeiraState, formData: FormData): Promise<CreditarCadeiraState> {
  const session = await requireGerirCurriculo();

  const alunoId = String(formData.get("alunoId") ?? "");
  const cadeiraCurricularId = String(formData.get("cadeiraCurricularId") ?? "");
  const notaCreditada = Number(formData.get("notaCreditada"));
  const instituicaoOrigem = String(formData.get("instituicaoOrigem") ?? "").trim() || null;

  if (Number.isNaN(notaCreditada) || notaCreditada < 0 || notaCreditada > 20) {
    return { error: "Nota deve estar entre 0 e 20." };
  }

  const aluno = await prisma.aluno.findUnique({ where: { id: alunoId }, select: { id: true, curso: true } });
  if (!aluno) {
    return { error: "Aluno não encontrado." };
  }

  const cadeiraCurricular = await prisma.cadeiraCurricular.findUnique({
    where: { id: cadeiraCurricularId },
    include: { curso: true },
  });
  // Mesma classe de IDOR já corrigido em createTurmaDisciplinaAction — nunca confiar só no
  // filtro da UI para garantir que a cadeira pertence ao curso do aluno.
  if (!cadeiraCurricular || cadeiraCurricular.curso.nome !== aluno.curso) {
    return { error: "Esta cadeira não pertence ao curso do aluno." };
  }

  const jaInscrito = await prisma.inscricaoCadeira.findFirst({
    where: { alunoId, cadeiraCurricularId },
    select: { id: true },
  });
  if (jaInscrito) {
    return { error: "Aluno já tem uma inscrição nesta cadeira — corrija a nota existente em vez de creditar de novo." };
  }

  const turmaDisciplina = await prisma.turmaDisciplina.findFirst({
    where: { cadeiraCurricularId },
    orderBy: { turma: { anoLetivo: "desc" } },
  });
  if (!turmaDisciplina) {
    return { error: "Esta cadeira ainda não tem nenhuma turma associada — não é possível creditar até existir pelo menos uma oferta desta disciplina." };
  }

  const inscricao = await prisma.inscricaoCadeira.create({
    data: {
      alunoId,
      cadeiraCurricularId,
      turmaDisciplinaId: turmaDisciplina.id,
      tentativa: 1,
      ativa: false,
      creditada: true,
      instituicaoOrigemCreditado: instituicaoOrigem,
      permiteDispensaAplicada: cadeiraCurricular.permiteDispensa,
      notaMinimaDispensaAplicada: cadeiraCurricular.notaMinimaDispensa,
    },
  });

  const avaliacoesExistentes = await prisma.avaliacao.findMany({ where: { turmaDisciplinaId: turmaDisciplina.id } });
  const avaliacaoPorEpoca = new Map(avaliacoesExistentes.map((a) => [a.epoca, a]));
  const salaHerdada = avaliacoesExistentes[0]?.sala ?? "A confirmar";
  const epocasCreditadas: Epoca[] = ["P1", "P2", "EXAME"];
  for (const epoca of epocasCreditadas) {
    if (!avaliacaoPorEpoca.has(epoca)) {
      avaliacaoPorEpoca.set(epoca, await criarAvaliacaoEmFalta(turmaDisciplina.id, epoca, salaHerdada));
    }
  }

  await gravarNotasEAtualizarOrfas(
    epocasCreditadas.map((epoca) => ({
      avaliacaoId: avaliacaoPorEpoca.get(epoca)!.id,
      inscricaoCadeiraId: inscricao.id,
      valor: notaCreditada,
    })),
  );

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Creditou a cadeira "${cadeiraCurricular.id}" ao aluno "${alunoId}" com nota ${notaCreditada}${instituicaoOrigem ? ` (${instituicaoOrigem})` : ""}`,
    entityType: "InscricaoCadeira",
    entityId: inscricao.id,
  });

  revalidatePath(`/alunos/${alunoId}`);
  revalidatePath(`/minhas-notas`);
  return {};
}
