import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { PERIODO_LABEL, nomeProfessor, parseIntParam } from "@/lib/utils";

interface NotasTurmaPageProps {
  params: Promise<{ turmaId: string }>;
  searchParams: Promise<{ semestre?: string }>;
}

export default async function NotasTurmaPage({ params, searchParams }: NotasTurmaPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "SECRETARIA") redirect("/dashboard");

  const { turmaId } = await params;
  const { semestre: semestreParam } = await searchParams;

  // O professor só vê as suas próprias disciplinas dentro da turma — não a grelha inteira dos
  // colegas. Admin/DAAC continuam a ver todas (gestão académica).
  const professorId = session.user.role === "PROFESSOR" ? session.user.professorId : null;

  const config = await prisma.configuracaoAcademica.findUnique({
    where: { id: "config" },
    select: { semestreAtual: true },
  });
  const semestreAtual = config?.semestreAtual === 2 ? 2 : 1;

  // Só o semestre a decorrer, por omissão: durante o 1º semestre, ver as disciplinas do 2º ao lado
  // das que se leccionam agora confunde o professor (§pedido do cliente 2026-08-29). Ao contrário
  // do Horário — onde o outro semestre é só leitura porque ainda pode mudar — aqui o semestre
  // anterior continua acessível e editável: as notas já lançadas são registo, não desaparecem
  // quando o semestre vira.
  const semestrePedido = parseIntParam(semestreParam);
  const semestre = semestrePedido === 1 || semestrePedido === 2 ? semestrePedido : semestreAtual;

  const turma = await prisma.turma.findUnique({
    where: { id: turmaId },
    include: {
      curso: true,
      turmaDisciplinas: {
        where: { semestre, ...(professorId ? { professorId } : {}) },
        include: { disciplina: true, professor: true, _count: { select: { avaliacoes: true } } },
        orderBy: { disciplina: { nome: "asc" } },
      },
    },
  });

  if (!turma) notFound();
  // Turma sem nenhuma disciplina deste professor não é dele — 404 em vez de uma página vazia que
  // confirmaria a existência da turma (mesma razão de não distinguir "não existe" de "não é seu").
  // Conta em TODOS os semestres de propósito: o filtro de semestre é uma vista, e um professor que
  // só lecciona no 2º semestre não pode ser expulso da sua própria turma durante o 1º.
  const disciplinasDoProfessorNaTurma = professorId
    ? await prisma.turmaDisciplina.count({ where: { turmaId, professorId } })
    : 0;
  if (professorId && disciplinasDoProfessorNaTurma === 0) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/notas" className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-700">
          <ArrowLeft size={16} />
          Voltar para Turmas
        </Link>
        <h1 className="mt-2 text-xl font-bold text-navy-900">
          {turma.curso.nome} - {turma.anoCurricular}º Ano
        </h1>
        <p className="text-sm text-navy-400">
          {PERIODO_LABEL[turma.periodo]} · {semestre}º Semestre
          {semestre === semestreAtual ? " (a decorrer)" : ""}
        </p>
      </div>

      <Card>
        <CardHeader
          title="Disciplinas"
          subtitle={`${turma.turmaDisciplinas.length} disciplina(s) do ${semestre}º semestre`}
          action={
            <Link
              href={`/notas/${turma.id}?semestre=${semestre === 1 ? 2 : 1}`}
              className="rounded-md px-2 py-1 text-xs font-medium text-navy-400 hover:bg-navy-50 hover:text-navy-700"
            >
              Ver {semestre === 1 ? 2 : 1}º semestre
            </Link>
          }
        />
        {turma.turmaDisciplinas.length === 0 ? (
          <EmptyState
            message={
              professorId
                ? `Não lecciona nenhuma disciplina desta turma no ${semestre}º semestre.`
                : `Esta turma não tem disciplinas no ${semestre}º semestre.`
            }
          />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Disciplina</Th>
                <Th>Professor</Th>
                <Th>Avaliações</Th>
              </tr>
            </Thead>
            <Tbody>
              {turma.turmaDisciplinas.map((td) => (
                <Tr key={td.id}>
                  <Td>
                    <Link href={`/notas/${turma.id}/${td.id}`} className="font-medium text-navy-900 hover:text-navy-600">
                      {td.disciplina.nome}
                    </Link>
                  </Td>
                  <Td className={td.professor ? undefined : "text-navy-400 italic"}>{nomeProfessor(td.professor)}</Td>
                  <Td>{td._count.avaliacoes}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
