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
 * Histórico de notas do PRÓPRIO aluno, de um ano letivo, em PDF (§pedido do cliente 2026-09-09).
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

  const anoLetivo = parseIntParam(new URL(request.url).searchParams.get("anoLetivo") ?? undefined);
  if (anoLetivo === undefined) return new Response("Indique o ano letivo.", { status: 400 });

  const bloqueio = await verificarBloqueioAluno(alunoId);
  if (bloqueio.bloqueado) {
    return new Response("As suas notas estão bloqueadas por dívida. Regularize na secretaria.", { status: 403 });
  }

  const [aluno, inscricoes] = await Promise.all([
    prisma.aluno.findUnique({ where: { id: alunoId }, select: { nome: true, numeroEstudante: true, curso: true } }),
    prisma.inscricaoCadeira.findMany({
      where: { alunoId, turmaDisciplina: { turma: { anoLetivo } } },
      include: {
        turmaDisciplina: { include: { disciplina: true, turma: { include: { curso: true } } } },
        notas: { include: { avaliacao: { select: { epoca: true } } } },
      },
      orderBy: [{ turmaDisciplina: { disciplina: { nome: "asc" } } }, { tentativa: "asc" }],
    }),
  ]);
  if (!aluno) return new Response("Aluno não encontrado", { status: 404 });
  if (inscricoes.length === 0) {
    return new Response("Sem notas registadas neste ano letivo.", { status: 404 });
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

  const porSeccao = new Map<string, SemestreHistorico>();
  for (const linha of visiveis) {
    const chave = `${linha.turmaLabel}|${linha.semestre}`;
    const seccao = porSeccao.get(chave) ?? { semestre: linha.semestre, turmaLabel: linha.turmaLabel, linhas: [] };
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
    (a, b) => a.turmaLabel.localeCompare(b.turmaLabel) || a.semestre - b.semestre,
  );

  const logoBuffer = await readFile(path.join(process.cwd(), "public", "logo.png"));
  const pdfBuffer = await renderToBuffer(
    <HistoricoNotasDocument
      instituicaoNome="Instituto Superior Politécnico Crescente"
      logoSrc={`data:image/png;base64,${logoBuffer.toString("base64")}`}
      alunoNome={aluno.nome}
      numeroEstudante={aluno.numeroEstudante}
      curso={aluno.curso}
      anoLetivoLabel={formatAnoLetivo(anoLetivo)}
      dataEmissao={formatDate(await getAgora())}
      seccoes={seccoes}
    />,
  );

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="historico-${aluno.numeroEstudante}-${anoLetivo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
