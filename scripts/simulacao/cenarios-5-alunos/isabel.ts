/**
 * Isabel Neto — foco no motor de avaliação (cascata calcularNotaFinal), não em financeiro/rematrícula:
 * paga a tempo e rematricula a tempo todos os anos (igual a Marta nesses dois aspetos), mas em CADA
 * ano os professores lançam-lhe as notas de forma assimétrica entre as duas cadeiras:
 *
 * - Programação I: P1 e P2 lançados normalmente, nota de dispensa (16/16) — fecha DISPENSADO.
 * - Bases de Dados: P1 lançado (14), mas P2 é deliberadamente OMITIDO no marco avaliacoes-p1
 *   (nesse marco só P1 é avaliado) — no marco avaliacoes-p2-exame, o professor volta a NÃO lançar
 *   P2 para Isabel nesta cadeira. Como nada no sistema cria a Avaliacao de P2 automaticamente antes
 *   de alguém tentar gravar uma nota nela (ver criarAvaliacaoEmFalta em src/actions/notas.ts), este
 *   script cria-a diretamente via Prisma ANTES do marco — documentado como simplificação
 *   deliberada: a única UI equivalente (CreateProvaForm, Admin/DAAC > Horário e Provas) usa um
 *   seletor de ano civil limitado a [anoAtualReal-1, anoAtualReal+2] (DateSelect.tsx), que não cobre
 *   os anos simulados dos ciclos mais tardios desta simulação.
 *
 *   §2026-09-02: o 0 por falta deixou de aparecer sozinho. Antes bastava deixar
 *   Avaliacao.prazoLancamento expirar e visitar o dashboard — o job diário fazia o resto. Com o
 *   prazo automático eliminado (interruptor manual do DAAC), os zeros vêm só do fecho do semestre,
 *   por isso isabelCriarProvaP2EmFaltaBasesDados aplica agora essa mesma cascata explicitamente.
 *
 *   O resultado do cenário não muda: o 0 no P2 (Nota.automatica=true) faz a cascata cair em
 *   ADMITIDO_A_EXAME (notaFrequencia (14+0)/2=7 < notaMinimaDispensa 14). O professor lança então o
 *   Exame (14) na visita do marco avaliacoes-p2-exame — fecha APROVADO por Exame
 *   (notaComExame=(7+14)/2=10.5 >= NOTA_MINIMA_POSITIVA=10, ver calcularNotaFinal em avaliacao.ts).
 */
import type { CenarioCtx } from "./tipos";
import { lancarNotaAluno, guardarNotasPauta, confirmarPropinaMaisAntiga, processarRematricula, paraCadaDisciplinaDoProfessor } from "./acoes-comuns";
import {
  calcularNotaFinal,
  extrairNotasPorEpoca,
  proximaEpocaPendente,
  EPOCA_PARA_CHAVE_NOTAS,
  type NotasCadeira,
} from "../../../src/lib/avaliacao";

const NOTA_DISPENSA = 16;
const NOTA_P1_BASES_DADOS = 14;
// notaFrequencia = (P1+P2)/2 = (14+0)/2 = 7 (P2 fica 0 automático, de propósito); para APROVADO,
// notaComExame = (notaFrequencia+exame)/2 >= NOTA_MINIMA_POSITIVA(10) exige exame >= 13 — 12 dava
// 9.5, ficava presa em EM_RECURSO para sempre (a cadeira nunca resolvia, bloqueando toda
// rematrícula futura com "cadeiras por avaliar").
const NOTA_EXAME_BASES_DADOS = 14;

export async function isabelVencimentoPropinas(ctx: CenarioCtx): Promise<void> {
  const ctxBrowser = await ctx.browser.newContext();
  const page = await ctxBrowser.newPage();
  const ok = await confirmarPropinaMaisAntiga(page, ctx.baseUrl, ctx.staff.secretaria, "Isabel Neto", ctx.outputDir);
  ctx.log(`Isabel: propina do mês confirmada a tempo = ${ok}`);
  await ctxBrowser.close();
}

/**
 * P1 nas duas cadeiras — Programação I com nota de dispensa, Bases de Dados com nota que SÓ dispensa
 * se P2 também for alta (deliberadamente deixada pendente nesta cadeira).
 */
export async function isabelAvaliacoesP1(ctx: CenarioCtx): Promise<void> {
  await paraCadaDisciplinaDoProfessor(
    ctx.browser,
    ctx.baseUrl,
    ctx.staff.professor1,
    ctx.outputDir,
    async (page) => {
      await lancarNotaAluno(page, "Isabel Neto", 0, NOTA_DISPENSA);
      await guardarNotasPauta(page);
    },
    { prisma: ctx.prisma, semestreParaVisita: 1 },
  );
  await paraCadaDisciplinaDoProfessor(
    ctx.browser,
    ctx.baseUrl,
    ctx.staff.professor2,
    ctx.outputDir,
    async (page) => {
      await lancarNotaAluno(page, "Isabel Neto", 0, NOTA_P1_BASES_DADOS);
      await guardarNotasPauta(page);
    },
    { prisma: ctx.prisma, semestreParaVisita: 2 },
  );
  ctx.log("Isabel: P1 lançado — 16 em Prog. I, 14 em Bases de Dados (P2 fica pendente de propósito nesta última).");
}

/**
 * Cria a Avaliacao de P2 para a TurmaDisciplina de Bases de Dados do ciclo corrente e atribui o 0
 * por falta a quem ficou sem nota — ver nota no cabeçalho sobre porque isto é feito via Prisma
 * direto em vez de CreateProvaForm.
 *
 * §2026-09-02: o 0 deixou de aparecer sozinho. Antes bastava criar a Avaliacao com o prazo já
 * expirado e visitar o dashboard — o job diário fazia o resto. Com o prazo automático eliminado,
 * os zeros passaram a vir só do fecho do semestre (fecharSemestre), por isso o cenário aplica aqui
 * a mesma cascata que esse fecho aplicaria. A Avaliacao TEM de existir primeiro: o fecho só atribui
 * 0 a épocas agendadas (sem Avaliacao não há onde gravar a Nota).
 */
export async function isabelCriarProvaP2EmFaltaBasesDados(ctx: CenarioCtx, dataProva: Date): Promise<void> {
  const turmaDisciplina = await ctx.prisma.turmaDisciplina.findFirstOrThrow({
    where: { disciplina: { nome: ctx.disciplinaSemestre2 }, turma: { anoCurricular: ctx.anoCurricularCiclo } },
    orderBy: { turma: { anoLetivo: "desc" } },
    include: { turma: { select: { anoLetivo: true } } },
  });
  await ctx.prisma.avaliacao.upsert({
    where: { turmaDisciplinaId_epoca: { turmaDisciplinaId: turmaDisciplina.id, epoca: "P2" } },
    update: { data: dataProva },
    create: { turmaDisciplinaId: turmaDisciplina.id, epoca: "P2", data: dataProva, sala: "Lab 2" },
  });

  const atribuidas = await fecharSemestreDaSimulacao(ctx, turmaDisciplina.turma.anoLetivo, turmaDisciplina.semestre);
  ctx.log(
    `Isabel: Avaliacao P2 de Bases de Dados criada (${dataProva.toISOString().slice(0, 10)}); ` +
      `fecho do ${turmaDisciplina.semestre}º semestre atribuiu ${atribuidas} nota(s) 0 por falta.`,
  );
}

/**
 * Cópia fiel da cascata de fecharSemestre (src/lib/fecho-semestre.ts) — não pode ser importado
 * porque esse ficheiro começa com `import "server-only"`, que um `tsx` puro fora do Next não
 * resolve (mesmo motivo documentado em scripts/backfill-inscricoes-e-propinas.ts). Se a regra
 * mudar lá, atualizar aqui também.
 */
async function fecharSemestreDaSimulacao(ctx: CenarioCtx, anoLetivo: number, semestre: number): Promise<number> {
  const turmaDisciplinas = await ctx.prisma.turmaDisciplina.findMany({
    where: { semestre, turma: { anoLetivo } },
    select: {
      avaliacoes: { select: { id: true, epoca: true } },
      inscricoes: {
        where: { ativa: true },
        select: {
          id: true,
          permiteDispensaAplicada: true,
          notaMinimaDispensaAplicada: true,
          notas: { select: { valor: true, avaliacao: { select: { epoca: true } } } },
        },
      },
    },
  });

  const novasNotas: { avaliacaoId: string; inscricaoCadeiraId: string; valor: number; automatica: boolean }[] = [];
  for (const td of turmaDisciplinas) {
    const avaliacaoPorEpoca = new Map(td.avaliacoes.map((a) => [a.epoca, a]));
    for (const inscricao of td.inscricoes) {
      let notasCadeira: NotasCadeira = extrairNotasPorEpoca(
        inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao })),
      );
      for (let seguranca = 0; seguranca < 5; seguranca += 1) {
        const resultado = calcularNotaFinal(notasCadeira, {
          permiteDispensa: inscricao.permiteDispensaAplicada,
          notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
        });
        const proxima = proximaEpocaPendente(notasCadeira, resultado.estado);
        if (!proxima) break;
        const avaliacao = avaliacaoPorEpoca.get(proxima);
        if (!avaliacao) break;
        novasNotas.push({ avaliacaoId: avaliacao.id, inscricaoCadeiraId: inscricao.id, valor: 0, automatica: true });
        notasCadeira = { ...notasCadeira, [EPOCA_PARA_CHAVE_NOTAS[proxima]]: 0 };
      }
    }
  }

  if (novasNotas.length === 0) return 0;
  const gravadas = await ctx.prisma.nota.createMany({ data: novasNotas, skipDuplicates: true });
  return gravadas.count;
}

/**
 * No marco avaliacoes-p2-exame: lança P2 (16) em Programação I normalmente. Em Bases de Dados NÃO
 * lança P2 (propositadamente ausente) — o 0 por falta já foi atribuído pelo fecho do semestre em
 * isabelCriarProvaP2EmFaltaBasesDados; lança-se então
 * o Exame (14) na mesma passagem pela pauta dessa cadeira.
 */
export async function isabelAvaliacoesP2EExame(ctx: CenarioCtx): Promise<void> {
  await paraCadaDisciplinaDoProfessor(
    ctx.browser,
    ctx.baseUrl,
    ctx.staff.professor1,
    ctx.outputDir,
    async (page) => {
      await lancarNotaAluno(page, "Isabel Neto", 1, NOTA_DISPENSA); // P2 Programação I
      await guardarNotasPauta(page);
    },
    { prisma: ctx.prisma, semestreParaVisita: 1 },
  );
  await paraCadaDisciplinaDoProfessor(
    ctx.browser,
    ctx.baseUrl,
    ctx.staff.professor2,
    ctx.outputDir,
    async (page) => {
      // Coluna 2 = EXAME (0=P1, 1=P2, 2=EXAME) — só editável depois do 0 automático em P2 ter
      // desbloqueado ADMITIDO_A_EXAME na cascata (ver calcularNotaFinal).
      await lancarNotaAluno(page, "Isabel Neto", 2, NOTA_EXAME_BASES_DADOS);
      await guardarNotasPauta(page);
    },
    { prisma: ctx.prisma, semestreParaVisita: 2 },
  );
  ctx.log("Isabel: P2 (16) lançado em Prog. I; Bases de Dados — Exame (14) lançado sobre o 0 automático de P2.");
}

export async function isabelJanelaRematricula(ctx: CenarioCtx): Promise<{ alunoId: string; sucesso: boolean; erro: string | null }> {
  const aluno = await ctx.prisma.aluno.findUniqueOrThrow({ where: { email: ctx.alunos.isabel.email } });
  const ctxBrowser = await ctx.browser.newContext();
  const page = await ctxBrowser.newPage();
  const resultado = await processarRematricula(page, ctx.baseUrl, ctx.staff.secretaria, aluno.id, ctx.outputDir);
  await ctxBrowser.close();
  ctx.log(`Isabel: rematrícula dentro da janela → sucesso=${resultado.sucesso} ${resultado.erro ?? resultado.resultado ?? ""}`);
  return { alunoId: aluno.id, sucesso: resultado.sucesso, erro: resultado.erro };
}
