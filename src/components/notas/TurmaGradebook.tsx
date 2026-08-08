import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { GradeCell } from "./GradeCell";
import { formatDate, PERIODO_LABEL } from "@/lib/utils";

interface TurmaGradebookProps {
  turmaId: string;
  backHref: string;
  editable: boolean;
}

export async function TurmaGradebook({ turmaId, backHref, editable }: TurmaGradebookProps) {
  const turma = await prisma.turma.findUnique({
    where: { id: turmaId },
    include: {
      disciplina: true,
      professor: true,
      avaliacoes: { orderBy: { data: "asc" } },
      matriculas: {
        include: {
          aluno: true,
          notas: true,
        },
        orderBy: { aluno: { nome: "asc" } },
      },
      aulas: { orderBy: { data: "desc" }, take: 6, include: { frequencias: true } },
    },
  });

  if (!turma) notFound();

  const notaPorCelula = new Map<string, number>();
  for (const matricula of turma.matriculas) {
    for (const nota of matricula.notas) {
      notaPorCelula.set(`${matricula.id}:${nota.avaliacaoId}`, Number(nota.valor));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-700">
          <ArrowLeft size={16} />
          Voltar
        </Link>
        <h1 className="mt-2 text-xl font-bold text-navy-900">{turma.nome}</h1>
        <p className="text-sm text-navy-400">
          {turma.disciplina.nome} · {turma.professor.nome} · {turma.anoCurricular}º Ano · {PERIODO_LABEL[turma.periodo]}
        </p>
      </div>

      <Card>
        <CardHeader title="Pauta de notas" subtitle={editable ? "Clique num campo e prima Tab/Enter para gravar" : "Modo de visualização"} />
        {turma.matriculas.length === 0 || turma.avaliacoes.length === 0 ? (
          <EmptyState message="Sem alunos ou avaliações registadas para esta turma." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Aluno</Th>
                {turma.avaliacoes.map((avaliacao) => (
                  <Th key={avaliacao.id}>{avaliacao.nome}</Th>
                ))}
              </tr>
            </Thead>
            <Tbody>
              {turma.matriculas.map((matricula) => (
                <Tr key={matricula.id}>
                  <Td className="font-medium text-navy-900">{matricula.aluno.nome}</Td>
                  {turma.avaliacoes.map((avaliacao) => (
                    <Td key={avaliacao.id}>
                      <GradeCell
                        turmaId={turma.id}
                        avaliacaoId={avaliacao.id}
                        matriculaId={matricula.id}
                        valorInicial={notaPorCelula.get(`${matricula.id}:${avaliacao.id}`) ?? null}
                        disabled={!editable}
                      />
                    </Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Frequência recente" subtitle="Últimas 6 aulas" />
        {turma.aulas.length === 0 ? (
          <EmptyState message="Sem aulas registadas." />
        ) : (
          <CardBody className="flex flex-col gap-3">
            {turma.aulas.map((aula) => {
              const total = aula.frequencias.length;
              const presentes = aula.frequencias.filter((f) => f.presente).length;
              return (
                <div key={aula.id} className="flex items-center justify-between rounded-lg border border-navy-50 px-4 py-2 text-sm">
                  <span className="text-navy-600">{formatDate(aula.data)}</span>
                  <Badge tone={presentes / (total || 1) >= 0.8 ? "success" : "warning"}>
                    {presentes}/{total} presentes
                  </Badge>
                </div>
              );
            })}
          </CardBody>
        )}
      </Card>
    </div>
  );
}
