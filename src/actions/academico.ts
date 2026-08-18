"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { erroDeValidacao, extrairValores, type FormState } from "@/lib/forms";
import { requireGerirCurriculo, requireRegistarPagamento } from "@/lib/permissions";
import { sincronizarInscricoesTurma, backfillFrequenciasParaInscricoes } from "@/lib/curriculo";
import { getEstadoFinanceiroAluno } from "@/lib/financeiro";
import { calcularNotaFinal, extrairNotasPorEpoca } from "@/lib/avaliacao";
import { formatCurrency } from "@/lib/utils";
import { decidirRematricula, cadeirasARepetir } from "@/lib/academico";
import { getAgora } from "@/lib/tempo";

const ConfiguracaoAcademicaSchema = z.object({
  limiteReprovacoes: z.coerce.number("Indique o limite").int().min(0, "Mínimo 0"),
  regraRetencao: z.enum(["SO_REPROVADAS", "ANO_INTEIRO"], { message: "Regra inválida" }),
  matriculaInicio: z.string().min(1, "Data de início é obrigatória"),
  matriculaFim: z.string().min(1, "Data de fim é obrigatória"),
  anoLetivoInicio: z.string().min(1, "Data de início é obrigatória"),
  anoLetivoFim: z.string().min(1, "Data de fim é obrigatória"),
  diasPrazoP1: z.coerce.number("Indique os dias").int().min(0, "Mínimo 0"),
  diasPrazoP2: z.coerce.number("Indique os dias").int().min(0, "Mínimo 0"),
  diasPrazoExame: z.coerce.number("Indique os dias").int().min(0, "Mínimo 0"),
  diasPrazoRecurso: z.coerce.number("Indique os dias").int().min(0, "Mínimo 0"),
  diasPrazoExameEspecial: z.coerce.number("Indique os dias").int().min(0, "Mínimo 0"),
});

const CAMPOS_CONFIG_ACADEMICA = [
  "limiteReprovacoes",
  "regraRetencao",
  "matriculaInicio",
  "matriculaFim",
  "anoLetivoInicio",
  "anoLetivoFim",
  "diasPrazoP1",
  "diasPrazoP2",
  "diasPrazoExame",
  "diasPrazoRecurso",
  "diasPrazoExameEspecial",
] as const;
export type ConfiguracaoAcademicaState = FormState<Record<(typeof CAMPOS_CONFIG_ACADEMICA)[number], string>> & {
  success?: boolean;
};

export async function atualizarConfiguracaoAcademicaAction(
  _prevState: ConfiguracaoAcademicaState,
  formData: FormData,
): Promise<ConfiguracaoAcademicaState> {
  const session = await requireGerirCurriculo();
  const parsed = ConfiguracaoAcademicaSchema.safeParse({
    limiteReprovacoes: formData.get("limiteReprovacoes"),
    regraRetencao: formData.get("regraRetencao"),
    matriculaInicio: formData.get("matriculaInicio"),
    matriculaFim: formData.get("matriculaFim"),
    anoLetivoInicio: formData.get("anoLetivoInicio"),
    anoLetivoFim: formData.get("anoLetivoFim"),
    diasPrazoP1: formData.get("diasPrazoP1"),
    diasPrazoP2: formData.get("diasPrazoP2"),
    diasPrazoExame: formData.get("diasPrazoExame"),
    diasPrazoRecurso: formData.get("diasPrazoRecurso"),
    diasPrazoExameEspecial: formData.get("diasPrazoExameEspecial"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_CONFIG_ACADEMICA);

  const matriculaInicio = new Date(parsed.data.matriculaInicio);
  const matriculaFim = new Date(parsed.data.matriculaFim);
  if (Number.isNaN(matriculaInicio.getTime()) || Number.isNaN(matriculaFim.getTime()) || matriculaFim < matriculaInicio) {
    return {
      fieldErrors: { matriculaFim: "A data de fim tem de ser depois da data de início" },
      values: extrairValores(formData, CAMPOS_CONFIG_ACADEMICA),
    };
  }

  const anoLetivoInicio = new Date(parsed.data.anoLetivoInicio);
  const anoLetivoFim = new Date(parsed.data.anoLetivoFim);
  if (Number.isNaN(anoLetivoInicio.getTime()) || Number.isNaN(anoLetivoFim.getTime()) || anoLetivoFim < anoLetivoInicio) {
    return {
      fieldErrors: { anoLetivoFim: "A data de fim tem de ser depois da data de início" },
      values: extrairValores(formData, CAMPOS_CONFIG_ACADEMICA),
    };
  }

  const dados = {
    limiteReprovacoes: parsed.data.limiteReprovacoes,
    regraRetencao: parsed.data.regraRetencao,
    matriculaInicio,
    matriculaFim,
    anoLetivoInicio,
    anoLetivoFim,
    diasPrazoP1: parsed.data.diasPrazoP1,
    diasPrazoP2: parsed.data.diasPrazoP2,
    diasPrazoExame: parsed.data.diasPrazoExame,
    diasPrazoRecurso: parsed.data.diasPrazoRecurso,
    diasPrazoExameEspecial: parsed.data.diasPrazoExameEspecial,
    updatedPorId: session.user.id,
  };

  await prisma.configuracaoAcademica.upsert({
    where: { id: "config" },
    update: dados,
    create: { id: "config", ...dados },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Atualizou a configuração académica (limite ${parsed.data.limiteReprovacoes} reprovação(ões), regra de retenção ${parsed.data.regraRetencao})`,
    entityType: "ConfiguracaoAcademica",
    entityId: "config",
  });

  revalidatePath("/admin/academico/configuracao");
  return { success: true };
}

/** Interruptor manual do DAAC entre 1º e 2º semestre — não depende de datas. Volta a 1º sozinho
 * quando um novo ano letivo começa (garantirSuspensaoAutomatica). */
export async function alterarSemestreAction(formData: FormData): Promise<void> {
  const session = await requireGerirCurriculo();
  const novoSemestre = Number(formData.get("semestre"));
  if (novoSemestre !== 1 && novoSemestre !== 2) throw new Error("Semestre inválido.");

  await prisma.configuracaoAcademica.upsert({
    where: { id: "config" },
    update: { semestreAtual: novoSemestre, updatedPorId: session.user.id },
    create: { id: "config", semestreAtual: novoSemestre, updatedPorId: session.user.id },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Mudou o sistema para o ${novoSemestre}º Semestre`,
    entityType: "ConfiguracaoAcademica",
    entityId: "config",
  });

  revalidatePath("/admin/academico/configuracao");
  revalidatePath("/professor");
  revalidatePath("/horario");
}

export interface ProcessarRematriculaState {
  error?: string;
  resultado?: string;
}

/**
 * Rematrícula/retenção (§4.2, Fase 8b) — acionada pela Secretaria, aluno a aluno, dentro da janela
 * de matrícula. Não é promoção automática em lote. Avalia as InscricaoCadeira ativas do aluno,
 * decide avançar ou reter (src/lib/academico.ts), cria as repetições necessárias e sincroniza as
 * cadeiras novas do ano alvo — reaproveita exatamente os mesmos mecanismos de
 * criarTentativaRepeticaoAction e sincronizarInscricoesTurma já usados na repetição manual.
 */
export async function processarRematriculaAction(
  _prevState: ProcessarRematriculaState,
  formData: FormData,
): Promise<ProcessarRematriculaState> {
  const session = await requireRegistarPagamento();
  const alunoId = String(formData.get("alunoId") ?? "");
  if (!alunoId) return { error: "Aluno inválido." };

  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  if (!config?.matriculaInicio || !config.matriculaFim) {
    return { error: "Defina o período de matrícula em Admin > Configuração Académica antes de processar rematrículas." };
  }
  const agora = getAgora();
  if (agora < config.matriculaInicio || agora > config.matriculaFim) {
    return { error: "Fora do período de matrícula — a rematrícula só pode ser processada dentro da janela configurada." };
  }

  const aluno = await prisma.aluno.findUnique({ where: { id: alunoId } });
  if (!aluno) return { error: "Aluno não encontrado." };

  // Rematrícula exige todos os pagamentos em dia (§pedido do cliente 2026-08-18) — mais estrito
  // que verificarBloqueioAluno (que só bloqueia notas quando há mês vencido além da tolerância):
  // aqui basta haver QUALQUER saldo em dívida, vencido ou não, para travar a confirmação.
  const estadoFinanceiro = await getEstadoFinanceiroAluno(alunoId);
  if (estadoFinanceiro.saldoEmDivida > 0) {
    return {
      error: `${aluno.nome} tem um saldo em dívida de ${formatCurrency(estadoFinanceiro.saldoEmDivida)} — confirme todos os pagamentos antes de processar a rematrícula.`,
    };
  }

  const matriculaAtual = await prisma.matricula.findFirst({
    where: { alunoId },
    orderBy: { turma: { anoLetivo: "desc" } },
    include: { turma: { include: { curso: true } } },
  });
  if (!matriculaAtual) return { error: "Aluno sem matrícula anterior — use a Nova Matrícula." };

  const inscricoesAtivas = await prisma.inscricaoCadeira.findMany({
    where: { alunoId, ativa: true },
    include: { notas: { include: { avaliacao: true } }, turmaDisciplina: { include: { disciplina: true } } },
  });

  const avaliadas = inscricoesAtivas.map((inscricao) => {
    const notas = inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao }));
    const resultado = calcularNotaFinal(extrairNotasPorEpoca(notas), {
      permiteDispensa: inscricao.permiteDispensaAplicada,
      notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
    });
    return { inscricao, estado: resultado.estado };
  });
  const pendentes = avaliadas.filter((a) => a.estado === "EM_CURSO" || a.estado === "ADMITIDO_A_EXAME" || a.estado === "EM_RECURSO" || a.estado === "EM_EXAME_ESPECIAL");
  if (pendentes.length > 0) {
    return {
      error: `${aluno.nome} tem cadeiras por avaliar (${pendentes.map((p) => p.inscricao.turmaDisciplina.disciplina.nome).join(", ")}) — a rematrícula só é possível depois do lançamento de notas.`,
    };
  }

  const reprovadas = avaliadas.filter((a) => a.estado === "REPROVADO");
  const aprovadas = avaliadas.filter((a) => a.estado === "APROVADO" || a.estado === "DISPENSADO");

  const decisao = decidirRematricula({
    reprovacoes: reprovadas.length,
    limiteReprovacoes: config.limiteReprovacoes,
    anoCurricular: aluno.anoCurricular,
  });

  const anoLetivoAlvo = matriculaAtual.turma.anoLetivo + 1;
  const turmaAlvo = await prisma.turma.findFirst({
    where: {
      cursoId: matriculaAtual.turma.cursoId,
      anoCurricular: decisao.novoAnoCurricular,
      periodo: matriculaAtual.turma.periodo,
      anoLetivo: anoLetivoAlvo,
    },
  });
  if (!turmaAlvo) {
    return {
      error: `Não existe turma de ${decisao.novoAnoCurricular}º Ano para ${anoLetivoAlvo} neste curso/período — crie-a primeiro em Admin > Turmas.`,
    };
  }

  const aRepetir = cadeirasARepetir(reprovadas, decisao.resultado === "RETIDO" ? aprovadas : [], config.regraRetencao);

  // Localiza, para cada cadeira a repetir, a oferta atual (TurmaDisciplina) no ano letivo alvo —
  // lookup fora da transação (leitura), aplicado dentro dela.
  const repeticoes = await Promise.all(
    aRepetir.map(async (item) => {
      const novaOferta = await prisma.turmaDisciplina.findFirst({
        where: { cadeiraCurricularId: item.inscricao.cadeiraCurricularId, turma: { anoLetivo: anoLetivoAlvo } },
        include: { cadeiraCurricular: { select: { permiteDispensa: true, notaMinimaDispensa: true } } },
      });
      return { item, novaOferta };
    }),
  );
  const semOferta = repeticoes.filter((r) => !r.novaOferta);

  // Cadeiras aprovadas/dispensadas que NÃO entram no conjunto a repetir (aRepetir) ficam
  // definitivamente concluídas — têm de ser desativadas aqui, senão continuam `ativa=true`
  // apontadas para a turma do ano que terminou (era exatamente esta a lacuna do bug original).
  const idsARepetir = new Set(aRepetir.map((r) => r.inscricao.id));
  const aprovadasQueFicam = aprovadas.filter((a) => !idsARepetir.has(a.inscricao.id));

  const repeticoesCriadas = await prisma.$transaction(async (tx) => {
    await tx.matricula.update({ where: { id: matriculaAtual.id }, data: { status: "CONCLUIDA" } });
    await tx.matricula.create({ data: { alunoId, turmaId: turmaAlvo.id, status: "ATIVA" } });
    await tx.aluno.update({
      where: { id: alunoId },
      data: { anoCurricular: decisao.novoAnoCurricular, status: "ATIVO" },
    });

    if (aprovadasQueFicam.length > 0) {
      await tx.inscricaoCadeira.updateMany({
        where: { id: { in: aprovadasQueFicam.map((a) => a.inscricao.id) } },
        data: { ativa: false },
      });
    }

    const criadas: { id: string; turmaDisciplinaId: string }[] = [];
    for (const { item, novaOferta } of repeticoes) {
      if (!novaOferta) continue;
      const tentativasAnteriores = await tx.inscricaoCadeira.findMany({
        where: { alunoId, cadeiraCurricularId: item.inscricao.cadeiraCurricularId },
        orderBy: { tentativa: "desc" },
      });
      await tx.inscricaoCadeira.update({ where: { id: item.inscricao.id }, data: { ativa: false } });
      const nova = await tx.inscricaoCadeira.create({
        data: {
          alunoId,
          cadeiraCurricularId: item.inscricao.cadeiraCurricularId,
          turmaDisciplinaId: novaOferta.id,
          tentativa: (tentativasAnteriores[0]?.tentativa ?? item.inscricao.tentativa) + 1,
          ativa: true,
          permiteDispensaAplicada: novaOferta.cadeiraCurricular.permiteDispensa,
          notaMinimaDispensaAplicada: novaOferta.cadeiraCurricular.notaMinimaDispensa,
        },
      });
      criadas.push({ id: nova.id, turmaDisciplinaId: nova.turmaDisciplinaId });
    }
    return criadas;
  });

  // Repete a meio do ano na disciplina de destino — sem isto fica invisível na marcação de
  // presença das aulas já dadas, apesar de já aparecer na pauta (roster por InscricaoCadeira).
  await backfillFrequenciasParaInscricoes(repeticoesCriadas);
  await sincronizarInscricoesTurma(turmaAlvo.id);

  const resultadoLabel =
    decisao.resultado === "AVANCA" ? `Avançou para o ${decisao.novoAnoCurricular}º Ano` : `Ficou retido no ${decisao.novoAnoCurricular}º Ano`;
  const cadeirasRepetidasLabel = aRepetir.length > 0 ? ` — repete: ${aRepetir.map((r) => r.inscricao.turmaDisciplina.disciplina.nome).join(", ")}` : "";

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Processou a rematrícula de ${aluno.nome}: ${resultadoLabel}${cadeirasRepetidasLabel}`,
    entityType: "Aluno",
    entityId: alunoId,
    valorAnterior: `${aluno.anoCurricular}º Ano`,
    valorNovo: `${decisao.novoAnoCurricular}º Ano${decisao.resultado === "RETIDO" ? " (retido)" : ""}`,
  });

  revalidatePath(`/alunos/${alunoId}`);
  revalidatePath("/alunos");
  revalidatePath("/notas");
  revalidatePath("/minhas-notas");
  revalidatePath("/horario");

  const avisoOferta =
    semOferta.length > 0
      ? ` Aviso: sem oferta atual para ${semOferta.map((r) => r.item.inscricao.turmaDisciplina.disciplina.nome).join(", ")} — tentativa anterior mantida ativa.`
      : "";

  return { resultado: `${resultadoLabel}.${cadeirasRepetidasLabel}${avisoOferta}` };
}

export interface IniciarNovoCursoState {
  error?: string;
  resultado?: string;
}

/**
 * Segunda licenciatura / mudança de curso (§4.2, Fase 8c) — mesmo aluno, mesmo número de
 * estudante, sem aproveitamento de créditos: entra sempre no 1º ano do curso novo. Sem gate pela
 * janela de matrícula — ao contrário da rematrícula anual, é um pedido excecional. Se houver uma
 * Matricula ativa do curso anterior, fecha-a e desativa as InscricaoCadeira ativas (abandonadas,
 * sem nova tentativa); se não houver (aluno já FORMADO/sem matrícula ativa), não há nada a fechar.
 */
export async function iniciarNovoCursoAction(
  _prevState: IniciarNovoCursoState,
  formData: FormData,
): Promise<IniciarNovoCursoState> {
  const session = await requireRegistarPagamento();
  const alunoId = String(formData.get("alunoId") ?? "");
  const novoCursoId = String(formData.get("novoCursoId") ?? "");
  const periodo = formData.get("periodo");
  if (!alunoId || !novoCursoId || !periodo) return { error: "Dados inválidos." };

  const [aluno, novoCurso] = await Promise.all([
    prisma.aluno.findUnique({ where: { id: alunoId } }),
    prisma.curso.findUnique({ where: { id: novoCursoId } }),
  ]);
  if (!aluno) return { error: "Aluno não encontrado." };
  if (!novoCurso) return { error: "Curso não encontrado." };

  const anoLetivoAlvo = getAgora().getFullYear();
  const turmaAlvo = await prisma.turma.findFirst({
    where: {
      cursoId: novoCursoId,
      anoCurricular: 1,
      periodo: periodo as "MATUTINO" | "VESPERTINO" | "NOTURNO",
      anoLetivo: anoLetivoAlvo,
    },
  });
  if (!turmaAlvo) {
    return { error: `Não existe turma de 1º Ano para ${anoLetivoAlvo} neste curso/período — crie-a primeiro em Admin > Turmas.` };
  }

  const matriculaAtiva = await prisma.matricula.findFirst({
    where: { alunoId, status: "ATIVA" },
    include: { turma: { include: { curso: true } } },
  });
  const cursoAntigo = matriculaAtiva?.turma.curso.nome ?? aluno.curso;

  // Matricula é única por (alunoId, turmaId) — um aluno que muda de curso e depois volta ao curso
  // de origem (mesmo ano letivo) já tem uma Matricula TRANCADA para essa mesma turma, e criar uma
  // segunda rebentava com violação de unicidade. Reativa a que já existe em vez de duplicar.
  const matriculaExistenteNaTurmaAlvo = await prisma.matricula.findUnique({
    where: { alunoId_turmaId: { alunoId, turmaId: turmaAlvo.id } },
  });

  await prisma.$transaction(async (tx) => {
    if (matriculaAtiva) {
      await tx.matricula.update({ where: { id: matriculaAtiva.id }, data: { status: "TRANCADA" } });
      await tx.inscricaoCadeira.updateMany({ where: { alunoId, ativa: true }, data: { ativa: false } });
    }
    if (matriculaExistenteNaTurmaAlvo) {
      await tx.matricula.update({ where: { id: matriculaExistenteNaTurmaAlvo.id }, data: { status: "ATIVA" } });
    } else {
      await tx.matricula.create({ data: { alunoId, turmaId: turmaAlvo.id, status: "ATIVA" } });
    }
    await tx.aluno.update({ where: { id: alunoId }, data: { curso: novoCurso.nome, anoCurricular: 1, status: "ATIVO" } });
  });

  await sincronizarInscricoesTurma(turmaAlvo.id);

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Iniciou novo curso para ${aluno.nome}: ${cursoAntigo} → ${novoCurso.nome}`,
    entityType: "Aluno",
    entityId: alunoId,
    valorAnterior: cursoAntigo,
    valorNovo: novoCurso.nome,
  });

  revalidatePath(`/alunos/${alunoId}`);
  revalidatePath("/alunos");
  revalidatePath("/notas");
  revalidatePath("/minhas-notas");
  revalidatePath("/horario");

  return { resultado: `Iniciou ${novoCurso.nome} (1º Ano)${matriculaAtiva ? ` — ${cursoAntigo} encerrado` : ""}.` };
}
