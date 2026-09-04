"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { erroDeValidacao, extrairValores, type FormState } from "@/lib/forms";
import { requireGerirCurriculo, requireRegistarPagamento, requireMarcarDesistencia, requireReativarDesistente } from "@/lib/permissions";
import { sincronizarInscricoesTurma, backfillFrequenciasParaInscricoes, garantirOfertaParaRepeticao } from "@/lib/curriculo";
import { getEstadoFinanceiroAluno, gerarPropinasAnoLetivo } from "@/lib/financeiro";
import { calcularNotaFinal, extrairNotasPorEpoca } from "@/lib/avaliacao";
import { formatCurrency, fromIsoDate } from "@/lib/utils";
import { decidirRematricula, cadeirasARepetir, anoLetivoCorrente } from "@/lib/academico";
import { fecharSemestre } from "@/lib/fecho-semestre";
import { getAgora } from "@/lib/tempo";

const ConfiguracaoAcademicaSchema = z.object({
  limiteReprovacoes: z.coerce.number("Indique o limite").int().min(0, "Mínimo 0"),
  regraRetencao: z.enum(["SO_REPROVADAS", "ANO_INTEIRO"], { message: "Regra inválida" }),
  matriculaInicio: z.string().min(1, "Data de início é obrigatória"),
  matriculaFim: z.string().min(1, "Data de fim é obrigatória"),
  anoLetivoInicio: z.string().min(1, "Data de início é obrigatória"),
  anoLetivoFim: z.string().min(1, "Data de fim é obrigatória"),
});

const CAMPOS_CONFIG_ACADEMICA = [
  "limiteReprovacoes",
  "regraRetencao",
  "matriculaInicio",
  "matriculaFim",
  "anoLetivoInicio",
  "anoLetivoFim",
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
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_CONFIG_ACADEMICA);

  // fromIsoDate, não new Date(): a forma só-data é interpretada como meia-noite UTC pelo
  // construtor, mas relida por toIsoDate em hora local — num servidor a oeste de Greenwich o par
  // perdia um dia (o DAAC escolhia 01/09 e o formulário devolvia 31/08).
  const matriculaInicio = fromIsoDate(parsed.data.matriculaInicio);
  const matriculaFim = fromIsoDate(parsed.data.matriculaFim);
  if (!matriculaInicio || !matriculaFim || matriculaFim < matriculaInicio) {
    return {
      fieldErrors: { matriculaFim: "A data de fim tem de ser depois da data de início" },
      values: extrairValores(formData, CAMPOS_CONFIG_ACADEMICA),
    };
  }

  const anoLetivoInicio = fromIsoDate(parsed.data.anoLetivoInicio);
  const anoLetivoFim = fromIsoDate(parsed.data.anoLetivoFim);
  if (!anoLetivoInicio || !anoLetivoFim || anoLetivoFim < anoLetivoInicio) {
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

  const config = await prisma.configuracaoAcademica.upsert({
    where: { id: "config" },
    update: {},
    create: { id: "config" },
  });
  const semestreAnterior = config.semestreAtual === 2 ? 2 : 1;
  if (semestreAnterior === novoSemestre) return;

  const agora = await getAgora();
  const anoLetivo = anoLetivoCorrente(agora, config);

  // Voltar do 2º ao 1º só na viragem do ano letivo (§decisão do cliente 2026-08-31). A meio do ano
  // seria reabrir um semestre já fechado a zeros: as notas automáticas do fecho continuariam lá, e
  // o 1º semestre voltaria a aceitar horários e provas como se nada tivesse acontecido.
  if (novoSemestre === 1 && anoLetivo !== null) {
    throw new Error(
      "O 1º semestre já foi fechado neste ano letivo. Só se volta ao 1º semestre no início de um novo ano letivo.",
    );
  }

  // §2026-09-03: avançar para o 2º FORA do ano letivo deixou de ser possível. Entre anos letivos
  // (férias) `anoLetivo` é null, e a mudança passava sem fechar nada — o fecho a zeros abaixo está
  // guardado por `anoLetivo !== null`. O resultado era um ano letivo novo a arrancar já no 2º
  // semestre: aconteceu nesta instalação, e os alunos iam ver as disciplinas do 2º semestre no dia
  // em que o ano começasse. O rollover repõe 1 quando o ano acaba, mas corre uma vez só — um
  // clique posterior ficava até ao fim do ano letivo seguinte, sem nada que o corrigisse.
  if (novoSemestre === 2 && anoLetivo === null) {
    throw new Error(
      "Não há nenhum ano letivo a decorrer. O semestre só avança dentro do ano letivo — quando o novo ano começar, o sistema arranca no 1º semestre.",
    );
  }

  // Avançar 1º → 2º fecha o 1º: as cadeiras que ficaram com notas por lançar apuram o resultado com
  // 0 nas épocas em falta, em vez de ficarem "Em curso" para sempre.
  let notasAtribuidas = 0;
  if (semestreAnterior === 1 && novoSemestre === 2 && anoLetivo !== null) {
    notasAtribuidas = await fecharSemestre(anoLetivo, 1);
  }

  await prisma.configuracaoAcademica.update({
    where: { id: "config" },
    data: { semestreAtual: novoSemestre, updatedPorId: session.user.id },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action:
      notasAtribuidas > 0
        ? `Mudou o sistema para o ${novoSemestre}º Semestre — fecho do ${semestreAnterior}º atribuiu ${notasAtribuidas} nota(s) 0 por falta`
        : `Mudou o sistema para o ${novoSemestre}º Semestre`,
    entityType: "ConfiguracaoAcademica",
    entityId: "config",
  });

  revalidatePath("/admin/academico/configuracao");
  revalidatePath("/professor");
  revalidatePath("/horario");
  // O painel mostra as pendências do semestre corrente — mudar de semestre destapa outro conjunto
  // delas, e sem isto o cartão "A precisar de atenção" só apareceria no próximo pedido não-cache.
  revalidatePath("/dashboard");
  revalidatePath("/notas");
  revalidatePath("/admin/turmas");
}

/**
 * Interruptor manual do DAAC/ADMIN para a janela de lançamento de notas (§decisão do cliente
 * 2026-09-02: "vamos retornar para um sistema manual, onde se clica para poder permitir os
 * professores introduzir as notas, quando Daac/admin decidir"). Um único valor global — aberto,
 * todos os professores lançam nas suas disciplinas; fechado, nenhum.
 *
 * Ao contrário de alterarSemestreAction, é reversível e não escreve nota nenhuma: fechar a janela
 * não fecha cadeiras nem atribui zeros. Os zeros continuam a vir só do fecho do semestre.
 */
export async function alterarLancamentoNotasAction(formData: FormData): Promise<void> {
  const session = await requireGerirCurriculo();
  const abrir = formData.get("abrir") === "1";

  const config = await prisma.configuracaoAcademica.upsert({
    where: { id: "config" },
    update: {},
    create: { id: "config" },
  });
  // Clicar no botão do estado atual não gera auditoria nem revalidações — mesmo no-op de
  // alterarSemestreAction.
  if (config.lancamentoNotasAberto === abrir) return;

  const agora = await getAgora();
  await prisma.configuracaoAcademica.update({
    where: { id: "config" },
    data: { lancamentoNotasAberto: abrir, lancamentoNotasAlteradoEm: agora, updatedPorId: session.user.id },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: abrir
      ? "Abriu o lançamento de notas — todos os professores passam a poder lançar notas das suas disciplinas"
      : "Fechou o lançamento de notas — nenhum professor consegue lançar ou corrigir notas",
    entityType: "ConfiguracaoAcademica",
    entityId: "config",
    valorAnterior: config.lancamentoNotasAberto ? "Aberto" : "Fechado",
    valorNovo: abrir ? "Aberto" : "Fechado",
  });

  revalidatePath("/admin/academico/configuracao");
  revalidatePath("/professor");
  revalidatePath("/notas");
  revalidatePath("/dashboard");
  // O efeito visível está DENTRO da pauta, não só nas listas — sem revalidar as rotas dinâmicas, o
  // professor continuava a ver os campos no estado antigo até ao próximo pedido não-cache.
  revalidatePath("/professor/[turmaDisciplinaId]", "page");
  revalidatePath("/notas/[turmaId]/[turmaDisciplinaId]", "page");
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
  const agora = await getAgora();
  // §pedido do cliente 2026-08 (confirmado): fora da janela, a rematrícula tardia é PODER da
  // ADMIN — a Secretaria continua limitada à janela. A multa por rematrícula tardia é o valor
  // configurável valorMultaRematriculaTardia (ConfiguracaoFinanceira, 0 = desligada por defeito).
  const dentroDaJanela = agora >= config.matriculaInicio && agora <= config.matriculaFim;
  const rematriculaTardia = !dentroDaJanela && session.user.role === "ADMIN";
  if (!dentroDaJanela && !rematriculaTardia) {
    return { error: "Fora do período de matrícula — a rematrícula só pode ser processada dentro da janela configurada (ou pela ADMIN, fora dela)." };
  }

  const aluno = await prisma.aluno.findUnique({ where: { id: alunoId } });
  if (!aluno) return { error: "Aluno não encontrado." };

  // §regra confirmada 2026-08: só a PROPINA em dívida trava a rematrícula — a multa (mesmo
  // órfã, pendente) nunca bloqueia o regresso do aluno; continua a dever-se, e só a ADMIN a
  // confirma (toggleMultaAction). "Em dívida" é DEVENDO (vencida além da tolerância), a mesma
  // regra de verificarBloqueioAluno/estadoCobrancaVisual — não qualquer mês PENDENTE, já que
  // gerarPropinasAnoLetivo pré-gera o ano letivo inteiro e a maioria dos meses ainda nem venceu.
  const estadoFinanceiro = await getEstadoFinanceiroAluno(alunoId);
  const saldoPropinas = estadoFinanceiro.meses
    .filter((m) => m.estadoVisual === "DEVENDO")
    .reduce((soma, m) => soma + (m.valorDevido - m.valorPago), 0);
  if (saldoPropinas > 0) {
    return {
      error: `${aluno.nome} tem ${formatCurrency(saldoPropinas)} em mensalidades por pagar — confirme os pagamentos das mensalidades antes de processar a rematrícula (as multas não bloqueiam).`,
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
      eMonografia: inscricao.eMonografiaAplicada,
    });
    return { inscricao, estado: resultado.estado };
  });
  // EM_DEFESA entra aqui (§2026-09-04): sem a nota da defesa lançada, o finalista não avança nem
  // se forma. Sem isto, um aluno chegaria a FORMADO só por não haver turma do ano seguinte
  // (ver o fim de curso mais abaixo), sem ninguém verificar se defendeu a monografia.
  const pendentes = avaliadas.filter(
    (a) =>
      a.estado === "EM_CURSO" ||
      a.estado === "ADMITIDO_A_EXAME" ||
      a.estado === "EM_RECURSO" ||
      a.estado === "EM_EXAME_ESPECIAL" ||
      a.estado === "EM_DEFESA",
  );
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
    // §Opção A (confirmada 2026-08-24): a tentativa de rematrícula para um ano que o curso nem
    // tem (ex.: 5º ano de um curso de 4) é FIM DE CURSO, não erro — o aluno fica FORMADO (o enum
    // AlunoStatus já o tinha, nunca escrito até agora) e a Matricula corrente passa a CONCLUIDA.
    // FORMADO é excluído da suspensão automática (suspenderNaoRematriculados só apanha ATIVO) —
    // um formado não "trancou", terminou. A devolução distingue os dois casos para o chamador
    // (o teste de simulação trata o fim de curso como resultado esperado).
    const cursoTerminou = decisao.novoAnoCurricular > matriculaAtual.turma.curso.duracaoAnos;
    if (cursoTerminou) {
      await prisma.$transaction([
        prisma.matricula.update({ where: { id: matriculaAtual.id }, data: { status: "CONCLUIDA" } }),
        prisma.aluno.update({ where: { id: alunoId }, data: { status: "FORMADO" } }),
      ]);
      await registrarAuditoria({
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? "Utilizador",
        userRole: session.user.role,
        action: `Concluiu o curso: ${aluno.nome} (${matriculaAtual.turma.curso.nome}) ficou FORMADO — sem turma de ${decisao.novoAnoCurricular}º Ano para ${anoLetivoAlvo}`,
        entityType: "Aluno",
        entityId: alunoId,
      });
      return {
        error: `FIM_DE_CURSO: ${aluno.nome} concluiu o ${matriculaAtual.turma.curso.nome} (${matriculaAtual.turma.curso.duracaoAnos} anos) — não há ${decisao.novoAnoCurricular}º Ano. Estado final: FORMADO.`,
        resultado: `Concluiu o curso — estado FORMADO.`,
      };
    }
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
        include: { cadeiraCurricular: { select: { permiteDispensa: true, notaMinimaDispensa: true, eMonografia: true } } },
      });
      return { item, novaOferta };
    }),
  );

  // Sem oferta no ano alvo, a repetição não chegava a ser criada: ficava só um aviso e alguém
  // tinha de resolver à mão (§pedido do cliente 2026-08-28). Acontece quando a cadeira é de um ano
  // curricular que ainda não tem turma no ano letivo novo — o aluno avança para o 2º ano mas
  // repete uma cadeira do 1º, e não há turma de 1º ano em 2027. Cria-se a oferta em falta (e a
  // turma, se preciso), sem professor: o DAAC atribui-o depois, como em qualquer outra.
  const repeticoesResolvidas = await Promise.all(
    repeticoes.map(async ({ item, novaOferta }) => {
      if (novaOferta) return { item, novaOferta };
      const oferta = await garantirOfertaParaRepeticao({
        cadeiraCurricularId: item.inscricao.cadeiraCurricularId,
        cursoId: matriculaAtual.turma.cursoId,
        periodo: matriculaAtual.turma.periodo,
        anoLetivo: anoLetivoAlvo,
      });
      return { item, novaOferta: oferta };
    }),
  );
  const semOferta = repeticoesResolvidas.filter((r) => !r.novaOferta);

  // Cadeiras aprovadas/dispensadas que NÃO entram no conjunto a repetir (aRepetir) ficam
  // definitivamente concluídas — têm de ser desativadas aqui, senão continuam `ativa=true`
  // apontadas para a turma do ano que terminou (era exatamente esta a lacuna do bug original).
  const idsARepetir = new Set(aRepetir.map((r) => r.inscricao.id));
  const aprovadasQueFicam = aprovadas.filter((a) => !idsARepetir.has(a.inscricao.id));

  let matriculaNovaId = "";
  const repeticoesCriadas = await prisma.$transaction(async (tx) => {
    await tx.matricula.update({ where: { id: matriculaAtual.id }, data: { status: "CONCLUIDA" } });
    const matriculaNova = await tx.matricula.create({ data: { alunoId, turmaId: turmaAlvo.id, status: "ATIVA" } });
    matriculaNovaId = matriculaNova.id;
    await tx.aluno.update({
      where: { id: alunoId },
      data: {
        anoCurricular: decisao.novoAnoCurricular,
        status: "ATIVO",
        // Alimenta o agravamento por cadeira em repetição na propina (garantirCobrancasGeradas) —
        // atualizado a cada rematrícula, mesmo para 0 (aluno que deixou de repetir cadeiras deixa
        // de pagar o agravamento a partir do mês seguinte).
        cadeirasReprovadasAnoAnterior: reprovadas.length,
      },
    });

    if (aprovadasQueFicam.length > 0) {
      await tx.inscricaoCadeira.updateMany({
        where: { id: { in: aprovadasQueFicam.map((a) => a.inscricao.id) } },
        data: { ativa: false },
      });
    }

    const criadas: { id: string; turmaDisciplinaId: string }[] = [];
    for (const { item, novaOferta } of repeticoesResolvidas) {
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
          eMonografiaAplicada: novaOferta.cadeiraCurricular.eMonografia,
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
  await gerarPropinasAnoLetivo({
    alunoId,
    matriculaId: matriculaNovaId,
    categoria: aluno.categoria,
    anoCurricular: decisao.novoAnoCurricular,
    cadeirasReprovadas: reprovadas.length,
    anoLetivoAlvo,
    configAcademica: config,
  });

  // Multa por rematrícula tardia (§pedido do cliente 2026-08): valor configurável em
  // ConfiguracaoFinanceira.valorMultaRematriculaTardia, 0 = desligada (defeito). Nasce como
  // Cobranca MULTA órfã (sem mesReferencia — os tipos pontuais não restringem unicidade),
  // presa ao aluno, confirmável/reversível só pela ADMIN (toggleMultaAction).
  let avisoMultaTardia = "";
  if (rematriculaTardia) {
    const configFinanceira = await prisma.configuracaoFinanceira.findUnique({ where: { id: "config" } });
    const valorMultaTardia = Number(configFinanceira?.valorMultaRematriculaTardia ?? 0);
    if (valorMultaTardia > 0) {
      await prisma.cobranca.create({
        data: {
          matriculaId: matriculaNovaId,
          alunoId,
          tipo: "MULTA",
          descricao: `Multa por rematrícula tardia (${agora.getFullYear()}) — confirmada fora da janela pela ADMIN`,
          valorDevido: valorMultaTardia,
          dataVencimento: agora,
        },
      });
      avisoMultaTardia = ` Multa por rematrícula tardia aplicada: ${formatCurrency(valorMultaTardia)}.`;
      await registrarAuditoria({
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? "Utilizador",
        userRole: session.user.role,
        action: `Aplicou multa por rematrícula tardia de ${formatCurrency(valorMultaTardia)} ao aluno ${aluno.nome} (${aluno.curso}, ${aluno.anoCurricular}º Ano)`,
        entityType: "Cobranca",
        entityId: alunoId,
        valorNovo: formatCurrency(valorMultaTardia),
      });
    }
  }

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

  // Depois de garantirOfertaParaRepeticao, só sobra aqui a cadeira que nem sequer pertence ao
  // curso do aluno (mudança de curso mal resolvida, dados importados) — não se inventa oferta fora
  // do plano curricular, por isso a tentativa anterior fica ativa e alguém tem de olhar para ela.
  const avisoOferta =
    semOferta.length > 0
      ? ` Aviso: ${semOferta.map((r) => r.item.inscricao.turmaDisciplina.disciplina.nome).join(", ")} não pertence ao plano curricular de ${matriculaAtual.turma.curso.nome} — tentativa anterior mantida ativa, verifique o percurso do aluno.`
      : "";

  return { resultado: `${resultadoLabel}.${cadeirasRepetidasLabel}${avisoOferta}${avisoMultaTardia}` };
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

  const agora = await getAgora();
  const anoLetivoAlvo = agora.getFullYear();
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

export interface MarcarDesistenteState {
  error?: string;
  resultado?: string;
}

const motivoDesistenciaSchema = z.string().trim().min(3, "Indique o motivo da desistência.").max(500);

/**
 * Desistência (§pedido do cliente 2026-08-25): o aluno sai do ciclo académico por decisão própria
 * — formalizada pela ADMIN ou DAAC, sempre com motivo registado na auditoria. Espelha os efeitos
 * da suspensão automática de suspenderNaoRematriculados (matrícula TRANCADA + inscrições
 * desativadas), mas com status DESISTENTE: a diferença não é mecânica, é de saída — o TRANCADO
 * regressa pela rematrícula tardia da ADMIN; o DESISTENTE só regressa pela ação própria de
 * reativação. A dívida sobrevive intacta (regra geral: só PROPINA bloqueia, multas nunca).
 */
export async function marcarDesistenteAction(
  _prevState: MarcarDesistenteState,
  formData: FormData,
): Promise<MarcarDesistenteState> {
  const session = await requireMarcarDesistencia();
  const alunoId = String(formData.get("alunoId") ?? "");
  const parsedMotivo = motivoDesistenciaSchema.safeParse(String(formData.get("motivo") ?? ""));
  if (!alunoId) return { error: "Aluno inválido." };
  if (!parsedMotivo.success) return { error: "Indique o motivo da desistência." };

  const aluno = await prisma.aluno.findUnique({ where: { id: alunoId } });
  if (!aluno) return { error: "Aluno não encontrado." };
  // FORMADO já terminou; DESISTENTE já está fora; ATIVO ou TRANCADO (suspenso por não rematricular)
  // podem ser marcados como desistente — o TRANCADO é o estado natural de quem desiste: para de
  // frequentar, é suspenso automaticamente, e a ADMIN/DAAC formaliza a desistência.
  if (aluno.status === "FORMADO" || aluno.status === "DESISTENTE") {
    return { error: `Só um aluno ATIVO ou TRANCADO pode ser marcado como desistente (estado atual: ${aluno.status}).` };
  }

  const matriculaAtiva = await prisma.matricula.findFirst({ where: { alunoId, status: "ATIVA" } });

  await prisma.$transaction(async (tx) => {
    if (matriculaAtiva) {
      await tx.matricula.update({ where: { id: matriculaAtiva.id }, data: { status: "TRANCADA" } });
    }
    // Mesmo cuidado da suspensão automática: sem isto as inscrições ficam ativas para sempre
    // (diagnóstico: sem-inscricao-ativa-se-inativo).
    await tx.inscricaoCadeira.updateMany({ where: { alunoId, ativa: true }, data: { ativa: false } });
    await tx.aluno.update({ where: { id: alunoId }, data: { status: "DESISTENTE" } });
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Marcou ${aluno.nome} como DESISTENTE — motivo: ${parsedMotivo.data}`,
    entityType: "Aluno",
    entityId: alunoId,
    valorAnterior: "ATIVO",
    valorNovo: "DESISTENTE",
  });

  revalidatePath(`/alunos/${alunoId}`);
  revalidatePath("/alunos");

  return { resultado: `${aluno.nome} marcado como DESISTENTE.` };
}

export interface ReativarDesistenteState {
  error?: string;
  resultado?: string;
}

/**
 * Reativação de um desistente (§decisão do cliente 2026-08-25): exclusivo da ADMIN. Não matricula
 * em nada — devolve o aluno a ATIVO (sem turma, sem inscrições); o regresso ao percurso faz-se
 * pela rematrícula normal/tardia como qualquer outro aluno inativo que volta.
 */
export async function reativarDesistenteAction(
  _prevState: ReativarDesistenteState,
  formData: FormData,
): Promise<ReativarDesistenteState> {
  const session = await requireReativarDesistente();
  const alunoId = String(formData.get("alunoId") ?? "");
  if (!alunoId) return { error: "Aluno inválido." };

  const aluno = await prisma.aluno.findUnique({ where: { id: alunoId } });
  if (!aluno) return { error: "Aluno não encontrado." };
  if (aluno.status !== "DESISTENTE") {
    return { error: `Só um aluno DESISTENTE pode ser reativado (estado atual: ${aluno.status}).` };
  }

  await prisma.aluno.update({ where: { id: alunoId }, data: { status: "ATIVO" } });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Reativou ${aluno.nome} (DESISTENTE → ATIVO)`,
    entityType: "Aluno",
    entityId: alunoId,
    valorAnterior: "DESISTENTE",
    valorNovo: "ATIVO",
  });

  revalidatePath(`/alunos/${alunoId}`);
  revalidatePath("/alunos");

  return { resultado: `${aluno.nome} reativado — agora ATIVO, pronto para rematrícula.` };
}
