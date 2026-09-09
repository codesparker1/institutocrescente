import path from "node:path";
import { readFile } from "node:fs/promises";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verificarBloqueioAluno } from "@/lib/financeiro";
import { calcularNotaFinal, extrairNotasPorEpoca } from "@/lib/avaliacao";
import { inscricoesVisiveisAoAluno } from "@/lib/academico";
import { formatAnoLetivo, formatDate, parseIntParam } from "@/lib/utils";
import { getAgora } from "@/lib/tempo";
import { HistoricoNotasDocument, type SemestreHistorico } from "@/components/pdf/HistoricoNotasDocument";
import type { Epoca } from "@/generated/prisma/client";

export const runtime = "nodejs";

/**
 * Histórico de notas do PRÓPRIO aluno, de um ano DO CURSO, em PDF (§pedido do cliente 2026-09-09).
 *
 * Por ano curricular e não por ano letivo (§ajuste do mesmo dia: "organizar apenas por ano"): é a
 * unidade que o ecrã Minhas Notas mostra, e a folha impressa tem de bater certo com o que o aluno
 * tinha à frente quando carregou em imprimir. Um repetente cobre assim, numa folha só, a cadeira
 * que fez e a que repetiu — as duas são do mesmo ano do curso, mesmo tendo sido em anos letivos
 * diferentes.
 *
 * Só o próprio: não recebe alunoId nenhum, lê-o da sessão. Um parâmetro de aluno tornaria isto numa
 * forma de qualquer estudante autenticado ler as notas de outro — o percurso académico completo,
 * não só uma nota solta.
 *
 * O bloqueio financeiro vale aqui como vale no ecrã Minhas Notas: sem isto, um aluno com notas
 * bloqueadas contornava o bloqueio imprimindo-as.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Não autorizado", { status: 403 });
  if (session.user.role !== "ALUNO" || !session.user.alunoId) {
    return new Response("Não autorizado", { status: 403 });
  }
  const alunoId = session.user.alunoId;

  const params = new URL(request.url).searchParams;
  const anoCurricular = parseIntParam(params.get("anoCurricular") ?? undefined);
  if (anoCurricular === undefined) return new Response("Indique o ano do curso.", { status: 400 });
  // O curso separa dois "1º Ano" de cursos diferentes no percurso de quem fez uma segunda
  // licenciatura. Opcional: sem ele, sai o ano curricular de todos os cursos que o aluno tenha.
  const curso = params.get("curso")?.trim() || null;

  const bloqueio = await verificarBloqueioAluno(alunoId);
  if (bloqueio.bloqueado) {
    return new Response("As suas notas estão bloqueadas por dívida. Regularize na secretaria.", { status: 403 });
  }

  const [aluno, inscricoes] = await Promise.all([
    prisma.aluno.findUnique({ where: { id: alunoId }, select: { nome: true, numeroEstudante: true, curso: true } }),
    prisma.inscricaoCadeira.findMany({
      where: {
        alunoId,
        turmaDisciplina: { turma: { anoCurricular, ...(curso ? { curso: { nome: curso } } : {}) } },
      },
      include: {
        turmaDisciplina: { include: { disciplina: true, turma: { include: { curso: true } } } },
        notas: { include: { avaliacao: { select: { epoca: true } } } },
      },
      orderBy: [{ turmaDisciplina: { disciplina: { nome: "asc" } } }, { tentativa: "asc" }],
    }),
  ]);
  if (!aluno) return new Response("Aluno não encontrado", { status: 404 });
  if (inscricoes.length === 0) {
    return new Response("Sem notas registadas neste ano do curso.", { status: 404 });
  }

  const avaliadas = inscricoes.map((inscricao) => {
    const resultado = calcularNotaFinal(
      extrairNotasPorEpoca(inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao }))),
      {
        permiteDispensa: inscricao.permiteDispensaAplicada,
        notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
        eMonografia: inscricao.eMonografiaAplicada,
      },
    );
    const notasPorEpoca: Partial<Record<Epoca, number>> = {};
    for (const nota of inscricao.notas) notasPorEpoca[nota.avaliacao.epoca] = Number(nota.valor);
    return {
      disciplinaId: inscricao.turmaDisciplina.disciplinaId,
      tentativa: inscricao.tentativa,
      aprovado: resultado.aprovado,
      disciplina: inscricao.turmaDisciplina.disciplina.nome,
      semestre: inscricao.turmaDisciplina.semestre,
      anoLetivo: inscricao.turmaDisciplina.turma.anoLetivo,
      turmaLabel: `${inscricao.turmaDisciplina.turma.curso.nome} · ${inscricao.turmaDisciplina.turma.anoCurricular}º Ano`,
      notasPorEpoca,
      notaFrequencia: resultado.notaFrequencia,
      estado: resultado.estado,
      notaFinal: resultado.notaFinal,
    };
  });

  // A MESMA regra do ecrã (inscricoesVisiveisAoAluno): a folha impressa tem de bater certo com o
  // que o aluno acabou de ver antes de clicar em imprimir.
  const visiveis = inscricoesVisiveisAoAluno(avaliadas);

  // Uma secção por semestre E ano letivo: no mesmo ano do curso, a cadeira repetida foi frequentada
  // noutro ano letivo que não a original, e juntá-las na mesma tabela esconderia isso justamente na
  // folha que serve de comprovativo.
  const porSeccao = new Map<string, SemestreHistorico>();
  for (const linha of visiveis) {
    const chave = `${linha.anoLetivo}|${linha.semestre}`;
    const seccao = porSeccao.get(chave) ?? {
      semestre: linha.semestre,
      anoLetivoLabel: formatAnoLetivo(linha.anoLetivo),
      turmaLabel: linha.turmaLabel,
      linhas: [],
    };
    seccao.linhas.push({
      disciplina: linha.disciplina,
      tentativa: linha.tentativa,
      notasPorEpoca: linha.notasPorEpoca,
      notaFrequencia: linha.notaFrequencia,
      estado: linha.estado,
      notaFinal: linha.notaFinal,
    });
    porSeccao.set(chave, seccao);
  }
  const seccoes = [...porSeccao.values()].sort(
    (a, b) => a.anoLetivoLabel.localeCompare(b.anoLetivoLabel) || a.semestre - b.semestre,
  );

  const logoBuffer = await readFile(path.join(process.cwd(), "public", "logo.png"));
  const pdfBuffer = await renderToBuffer(
    <HistoricoNotasDocument
      instituicaoNome="Instituto Superior Politécnico Crescente"
      logoSrc={`data:image/png;base64,${logoBuffer.toString("base64")}`}
      alunoNome={aluno.nome}
      numeroEstudante={aluno.numeroEstudante}
      curso={curso ?? aluno.curso}
      anoLabel={`${anoCurricular}º Ano`}
      dataEmissao={formatDate(await getAgora())}
      seccoes={seccoes}
    />,
  );

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="historico-${aluno.numeroEstudante}-${anoCurricular}ano.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
