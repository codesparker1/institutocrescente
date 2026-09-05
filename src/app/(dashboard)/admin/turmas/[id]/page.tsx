import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { DeleteButtonForm } from "@/components/ui/DeleteButtonForm";
import { deleteTurmaDisciplinaAction } from "@/actions/admin";
import { CreateTurmaDisciplinaForm } from "./CreateTurmaDisciplinaForm";
import { EditarProfessorTurmaDisciplina } from "./EditarProfessorTurmaDisciplina";
import { PERIODO_LABEL, formatAnoLetivo, parseIntParam } from "@/lib/utils";

interface AdminTurmaDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ semestre?: string }>;
}

export default async function AdminTurmaDetailPage({ params, searchParams }: AdminTurmaDetailPageProps) {
  const { id } = await params;
  const { semestre: semestreParam } = await searchParams;

  const config = await prisma.configuracaoAcademica.findUnique({
    where: { id: "config" },
    select: { semestreAtual: true },
  });
  const semestreAtual = config?.semestreAtual === 2 ? 2 : 1;

  // Um semestre de cada vez (§pedido do cliente 2026-08-29): o sistema é usado por pessoas sem
  // formação em informática, e ver as cadeiras dos dois semestres na mesma tabela gera dúvidas
  // sobre o que está mesmo a decorrer. O outro semestre continua a um clique — escondê-lo de vez
  // deixaria as suas cadeiras eternamente sem professor, e sem professor ninguém lança notas.
  const semestrePedido = parseIntParam(semestreParam);
  const semestre = semestrePedido === 1 || semestrePedido === 2 ? semestrePedido : semestreAtual;

  const turma = await prisma.turma.findUnique({
    where: { id },
    include: {
      curso: true,
      turmaDisciplinas: {
        // A monografia sai daqui — dura o ano inteiro, não pertence a este semestre mesmo que o
        // valor gravado (arbitrário, sempre 1) coincida. Tem a sua própria secção, sempre visível
        // (query separada abaixo, turmaDisciplinasMonografia).
        where: { semestre, cadeiraCurricular: { eMonografia: false } },
        include: { disciplina: true, professor: true, _count: { select: { avaliacoes: true, horarioSlots: true } } },
        orderBy: { disciplina: { nome: "asc" } },
      },
    },
  });

  if (!turma) notFound();

  const [
    professores,
    cadeirasCurriculares,
    cadeirasMonografia,
    cadeirasJaAtribuidas,
    semProfessorNoOutroSemestre,
    turmaDisciplinasMonografia,
  ] = await Promise.all([
    prisma.professor.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    // select: CreateTurmaDisciplinaForm (Client Component) só precisa de id/semestre/disciplina.nome
    // — CadeiraCurricular.notaMinimaDispensa é Decimal, ver nota em admin/disciplinas/page.tsx.
    prisma.cadeiraCurricular.findMany({
      where: { cursoId: turma.cursoId, anoCurricular: turma.anoCurricular, semestre, eMonografia: false },
      select: { id: true, semestre: true, eMonografia: true, disciplina: { select: { nome: true } } },
      orderBy: { disciplina: { nome: "asc" } },
    }),
    // Sem filtro de semestre: a monografia oferece-se sempre, na secção própria.
    prisma.cadeiraCurricular.findMany({
      where: { cursoId: turma.cursoId, anoCurricular: turma.anoCurricular, eMonografia: true },
      select: { id: true, semestre: true, eMonografia: true, disciplina: { select: { nome: true } } },
      orderBy: { disciplina: { nome: "asc" } },
    }),
    // Todos os semestres: uma cadeira já atribuída não pode reaparecer como disponível só porque a
    // vista está filtrada.
    prisma.turmaDisciplina.findMany({ where: { turmaId: id }, select: { cadeiraCurricularId: true } }),
    // O aviso que impede o esquecimento: se o outro semestre tem cadeiras sem professor, dizemo-lo
    // aqui em vez de esperar que alguém se lembre de lá ir. Exclui a monografia — não é "do outro
    // semestre", é a secção à parte, que já tem o seu próprio aviso.
    prisma.turmaDisciplina.count({
      where: { turmaId: id, semestre: semestre === 1 ? 2 : 1, professorId: null, cadeiraCurricular: { eMonografia: false } },
    }),
    // A monografia desta turma, sempre — nunca filtrada por semestre (§pedido do cliente 2026-09-05).
    prisma.turmaDisciplina.findMany({
      where: { turmaId: id, cadeiraCurricular: { eMonografia: true } },
      include: { disciplina: true, professor: true, _count: { select: { avaliacoes: true, horarioSlots: true } } },
      orderBy: { disciplina: { nome: "asc" } },
    }),
  ]);
  const cadeirasAtribuidas = new Set(cadeirasJaAtribuidas.map((td) => td.cadeiraCurricularId));
  const cadeirasDisponiveis = cadeirasCurriculares.filter((c) => !cadeirasAtribuidas.has(c.id));
  const cadeirasMonografiaDisponiveis = cadeirasMonografia.filter((c) => !cadeirasAtribuidas.has(c.id));
  const outroSemestre = semestre === 1 ? 2 : 1;
  const semProfessorNaMonografia = turmaDisciplinasMonografia.filter((td) => !td.professorId).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/turmas" className="inline-flex items-center gap-1.5 text-sm text-texto hover:text-navy-700">
          <ArrowLeft size={16} />
          Voltar para Turmas
        </Link>
        <h1 className="mt-2 text-xl font-bold text-texto">
          {turma.curso.nome} - {turma.anoCurricular}º Ano
        </h1>
        <p className="text-sm text-texto-suave">
          {PERIODO_LABEL[turma.periodo]} · {formatAnoLetivo(turma.anoLetivo)} · {semestre}º Semestre
          {semestre === semestreAtual ? " (a decorrer)" : ""}
        </p>
      </div>

      <Card>
        <CardHeader
          title={`Disciplinas do ${semestre}º semestre`}
          subtitle={
            semestre === semestreAtual
              ? "O semestre a decorrer. Atribua disciplinas e professores."
              : `Semestre que não está a decorrer — atribua já os professores para não ficar por fazer.`
          }
          action={
            <Link
              href={`/admin/turmas/${turma.id}?semestre=${outroSemestre}`}
              className="rounded-md px-2 py-1 text-xs font-medium text-texto-suave hover:bg-navy-50 hover:text-navy-700"
            >
              Ver {outroSemestre}º semestre
            </Link>
          }
        />
        <CardBody className="flex flex-col gap-4">
          {semProfessorNoOutroSemestre > 0 ? (
            <p className="rounded-lg border border-gold-200 bg-gold-50 px-4 py-2.5 text-xs text-gold-800">
              O {outroSemestre}º semestre tem {semProfessorNoOutroSemestre} disciplina(s) sem professor.{" "}
              <Link href={`/admin/turmas/${turma.id}?semestre=${outroSemestre}`} className="font-semibold underline">
                Atribuir agora
              </Link>{" "}
              — sem professor, ninguém pode lançar notas nessa disciplina.
            </p>
          ) : null}

          {cadeirasCurriculares.length === 0 ? (
            <p className="text-sm text-texto-suave">
              Este curso não tem cadeiras do {semestre}º semestre para o {turma.anoCurricular}º ano no plano curricular.
              Defina-as primeiro em{" "}
              <Link href="/admin/curriculo" className="underline hover:text-navy-600">
                Plano Curricular
              </Link>
              .
            </p>
          ) : cadeirasDisponiveis.length === 0 ? (
            <p className="text-sm text-texto-suave">
              Todas as cadeiras do {semestre}º semestre já foram atribuídas a esta turma.
            </p>
          ) : (
            <CreateTurmaDisciplinaForm
              turmaId={turma.id}
              cadeirasCurriculares={cadeirasDisponiveis}
              professores={professores}
            />
          )}

          {turma.turmaDisciplinas.length === 0 ? (
            <EmptyState message={`Nenhuma disciplina do ${semestre}º semestre atribuída ainda.`} />
          ) : (
            <Table>
              <Thead>
                {/* Sem coluna "Semestre": a tabela inteira é de um semestre só, anunciado no título. */}
                <tr>
                  <Th>Disciplina</Th>
                  <Th>Professor</Th>
                  <Th>Sala</Th>
                  <Th>Horários</Th>
                  <Th>Provas</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <Tbody>
                {turma.turmaDisciplinas.map((td) => (
                  <Tr key={td.id}>
                    <Td className="font-medium text-texto">{td.disciplina.nome}</Td>
                    <Td>
                      <EditarProfessorTurmaDisciplina
                        turmaDisciplinaId={td.id}
                        professorAtualId={td.professorId}
                        professores={professores}
                      />
                    </Td>
                    <Td>{td.sala}</Td>
                    <Td>{td._count.horarioSlots}</Td>
                    <Td>{td._count.avaliacoes}</Td>
                    <Td className="text-right">
                      <DeleteButtonForm action={deleteTurmaDisciplinaAction} id={td.id} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}

          <p className="text-xs text-texto-suave">
            Cada semestre mostra-se em separado. Pode atribuir professores em qualquer um deles, mas o horário semanal
            e as provas só se marcam no semestre a decorrer, em{" "}
            <Link href="/horario" className="underline hover:text-navy-600">
              Horário e Provas
            </Link>
            .
          </p>
        </CardBody>
      </Card>

      {/* Sempre visível, fora das abas de semestre acima (§pedido do cliente 2026-09-05): a
          monografia dura o ano inteiro, e prendê-la a uma aba fazia-a desaparecer sempre que o
          semestre corrente não coincidisse com o gravado (arbitrário) na CadeiraCurricular dela. */}
      {cadeirasMonografiaDisponiveis.length > 0 || turmaDisciplinasMonografia.length > 0 ? (
        <Card>
          <CardHeader
            title="Monografia — ano inteiro"
            subtitle="Não pertence a nenhum semestre. Atribua o orientador em Finalistas, depois de criada aqui."
          />
          <CardBody className="flex flex-col gap-4">
            {semProfessorNaMonografia > 0 ? (
              <p className="rounded-lg border border-gold-200 bg-gold-50 px-4 py-2.5 text-xs text-gold-800">
                A monografia tem {semProfessorNaMonografia} disciplina(s) sem professor atribuído — sem professor,
                ninguém marca presenças.
              </p>
            ) : null}

            {cadeirasMonografiaDisponiveis.length > 0 ? (
              <CreateTurmaDisciplinaForm
                turmaId={turma.id}
                cadeirasCurriculares={cadeirasMonografiaDisponiveis}
                professores={professores}
              />
            ) : null}

            {turmaDisciplinasMonografia.length === 0 ? (
              <EmptyState message="Nenhuma monografia atribuída ainda a esta turma." />
            ) : (
              <Table>
                <Thead>
                  <tr>
                    <Th>Disciplina</Th>
                    <Th>Professor</Th>
                    <Th>Sala</Th>
                    <Th>Horários</Th>
                    <Th>Provas</Th>
                    <Th></Th>
                  </tr>
                </Thead>
                <Tbody>
                  {turmaDisciplinasMonografia.map((td) => (
                    <Tr key={td.id}>
                      <Td className="font-medium text-texto">{td.disciplina.nome}</Td>
                      <Td>
                        <EditarProfessorTurmaDisciplina
                          turmaDisciplinaId={td.id}
                          professorAtualId={td.professorId}
                          professores={professores}
                        />
                      </Td>
                      <Td>{td.sala}</Td>
                      <Td>{td._count.horarioSlots}</Td>
                      <Td>{td._count.avaliacoes}</Td>
                      <Td className="text-right">
                        <DeleteButtonForm action={deleteTurmaDisciplinaAction} id={td.id} />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
