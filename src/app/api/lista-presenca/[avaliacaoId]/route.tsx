import path from "node:path";
import { readFile } from "node:fs/promises";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { getConjuntoAlunosEmDivida } from "@/lib/financeiro";
import { ListaPresencaDocument } from "@/components/pdf/ListaPresencaDocument";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ avaliacaoId: string }>;
}

function epocaProvaLabel(tipo: string, nome: string): string {
  if (tipo === "EXAME_FINAL") return "Época de Exame";
  return `Época Normal — ${nome}`;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "SECRETARIA", "PROFESSOR"].includes(session.user.role)) {
    return new Response("Não autorizado", { status: 403 });
  }

  const { avaliacaoId } = await params;

  const avaliacao = await prisma.avaliacao.findUnique({
    where: { id: avaliacaoId },
    include: {
      turmaDisciplina: {
        include: {
          disciplina: true,
          professor: true,
          turma: { include: { curso: true } },
          // Roster por cadeira, não por coorte — inclui repetentes de outras turmas (§4.2).
          inscricoes: { where: { ativa: true }, include: { aluno: true } },
        },
      },
    },
  });

  if (!avaliacao) return new Response("Avaliação não encontrada", { status: 404 });

  if (session.user.role === "PROFESSOR" && avaliacao.turmaDisciplina.professorId !== session.user.professorId) {
    return new Response("Não autorizado", { status: 403 });
  }

  const alunosDaTurma = avaliacao.turmaDisciplina.inscricoes.map((i) => i.aluno);
  const alunosEmDivida = await getConjuntoAlunosEmDivida(alunosDaTurma.map((a) => a.id));

  const alunosElegiveis = alunosDaTurma
    .filter((a) => !alunosEmDivida.has(a.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));

  const logoBuffer = await readFile(path.join(process.cwd(), "public", "logo.png"));
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  const pdfBuffer = await renderToBuffer(
    <ListaPresencaDocument
      instituicaoNome="Instituto Superior Politécnico Crescente"
      logoSrc={logoSrc}
      curso={avaliacao.turmaDisciplina.turma.curso.nome}
      disciplina={avaliacao.turmaDisciplina.disciplina.nome}
      anoTurma={`${avaliacao.turmaDisciplina.turma.anoCurricular}º Ano`}
      epocaProva={epocaProvaLabel(avaliacao.tipo, avaliacao.nome)}
      docente={avaliacao.turmaDisciplina.professor.nome}
      dataHora={formatDate(avaliacao.data)}
      alunos={alunosElegiveis.map((aluno, index) => ({
        numero: index + 1,
        numeroEstudante: aluno.numeroEstudante,
        nome: aluno.nome,
      }))}
    />,
  );

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="lista-presenca-${avaliacao.nome}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
