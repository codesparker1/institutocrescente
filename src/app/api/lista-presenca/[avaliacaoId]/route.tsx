import path from "node:path";
import { readFile } from "node:fs/promises";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, nomeProfessor } from "@/lib/utils";
import { getConjuntoAlunosEmDivida } from "@/lib/financeiro";
import { ListaPresencaDocument } from "@/components/pdf/ListaPresencaDocument";
import { EPOCA_LABEL, calcularNotaFinal, extrairNotasPorEpoca, provaJaPassou, proximaEpocaPendente } from "@/lib/avaliacao";
import { getAgora } from "@/lib/tempo";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ avaliacaoId: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  // DAAC estava em falta desde a criação do papel na Fase 1 — a whitelist nunca foi atualizada.
  if (!session?.user || !["ADMIN", "SECRETARIA", "PROFESSOR", "DAAC"].includes(session.user.role)) {
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
          inscricoes: { where: { ativa: true }, include: { aluno: true, notas: { include: { avaliacao: true } } } },
        },
      },
    },
  });

  if (!avaliacao) return new Response("Avaliação não encontrada", { status: 404 });

  if (session.user.role === "PROFESSOR" && avaliacao.turmaDisciplina.professorId !== session.user.professorId) {
    return new Response("Não autorizado", { status: 403 });
  }

  // Espelha o bloqueio do botão de imprimir em ScheduleGrid — a lista serve para conferir quem
  // entra na sala nesse dia, não é um registo histórico para reimprimir depois da prova.
  // No próprio dia da prova continua a imprimir: ver provaJaPassou.
  if (provaJaPassou(avaliacao.data, await getAgora())) {
    return new Response("Esta prova já foi dada — a lista de presença já não pode ser impressa.", { status: 403 });
  }

  // Só quem realmente vai a ESTA época — não a turma inteira. Um aluno já dispensado em P1/P2, ou
  // já aprovado no Exame, não tem nada a fazer na sala do Recurso; sem este filtro a lista de
  // presença listava sempre todo o roster da disciplina, para qualquer época.
  const inscricoesEsperadas = avaliacao.turmaDisciplina.inscricoes.filter((inscricao) => {
    const notasCadeira = extrairNotasPorEpoca(inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao })));
    const resultado = calcularNotaFinal(notasCadeira, {
      permiteDispensa: inscricao.permiteDispensaAplicada,
      notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
      eMonografia: inscricao.eMonografiaAplicada,
    });
    return proximaEpocaPendente(notasCadeira, resultado.estado) === avaliacao.epoca;
  });

  const alunosDaTurma = inscricoesEsperadas.map((i) => i.aluno);
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
      epocaProva={EPOCA_LABEL[avaliacao.epoca]}
      docente={nomeProfessor(avaliacao.turmaDisciplina.professor)}
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
      "Content-Disposition": `inline; filename="lista-presenca-${avaliacao.epoca}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
