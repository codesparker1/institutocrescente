import path from "node:path";
import { readFile } from "node:fs/promises";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, PERIODO_LABEL } from "@/lib/utils";
import { calcularNotaFinal, extrairNotasPorEpoca } from "@/lib/avaliacao";
import { PautaDocument } from "@/components/pdf/PautaDocument";
import { getAgora } from "@/lib/tempo";
import type { Epoca } from "@/generated/prisma/client";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ turmaDisciplinaId: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "SECRETARIA", "PROFESSOR", "DAAC"].includes(session.user.role)) {
    return new Response("Não autorizado", { status: 403 });
  }

  const { turmaDisciplinaId } = await params;

  const turmaDisciplina = await prisma.turmaDisciplina.findUnique({
    where: { id: turmaDisciplinaId },
    include: {
      disciplina: true,
      professor: true,
      turma: { include: { curso: true } },
      // Roster por cadeira, não por coorte — inclui repetentes de outras turmas (§4.2).
      inscricoes: {
        where: { ativa: true },
        include: { aluno: true, notas: { include: { avaliacao: { select: { epoca: true } } } } },
        orderBy: { aluno: { nome: "asc" } },
      },
    },
  });

  if (!turmaDisciplina) return new Response("Turma-disciplina não encontrada", { status: 404 });

  if (session.user.role === "PROFESSOR" && turmaDisciplina.professorId !== session.user.professorId) {
    return new Response("Não autorizado", { status: 403 });
  }

  const logoBuffer = await readFile(path.join(process.cwd(), "public", "logo.png"));
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  const alunos = turmaDisciplina.inscricoes.map((inscricao, index) => {
    const notas = inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao }));
    const resultado = calcularNotaFinal(extrairNotasPorEpoca(notas), {
      permiteDispensa: inscricao.permiteDispensaAplicada,
      notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
    });
    const notasPorEpoca: Partial<Record<Epoca, number>> = {};
    for (const nota of inscricao.notas) {
      notasPorEpoca[nota.avaliacao.epoca] = Number(nota.valor);
    }
    return {
      numero: index + 1,
      numeroEstudante: inscricao.aluno.numeroEstudante,
      nome: inscricao.aluno.nome,
      tentativa: inscricao.tentativa,
      notasPorEpoca,
      estado: resultado.estado,
      notaFinal: resultado.notaFinal,
    };
  });

  const pdfBuffer = await renderToBuffer(
    <PautaDocument
      instituicaoNome="Instituto Superior Politécnico Crescente"
      logoSrc={logoSrc}
      curso={turmaDisciplina.turma.curso.nome}
      disciplina={turmaDisciplina.disciplina.nome}
      anoTurma={`${turmaDisciplina.turma.anoCurricular}º Ano · ${PERIODO_LABEL[turmaDisciplina.turma.periodo]}`}
      docente={turmaDisciplina.professor.nome}
      dataEmissao={formatDate(getAgora())}
      alunos={alunos}
    />,
  );

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="pauta-${turmaDisciplina.disciplina.codigo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
