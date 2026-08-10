import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { AvisoNotasBloqueadas } from "@/components/financeiro/AvisoNotasBloqueadas";
import { verificarBloqueioAluno } from "@/lib/financeiro";

export default async function MinhasNotasPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ALUNO" || !session.user.alunoId) redirect("/dashboard");

  const bloqueio = await verificarBloqueioAluno(session.user.alunoId);
  if (bloqueio.bloqueado) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Minhas Notas</h1>
          <p className="text-sm text-navy-400">As suas notas, organizadas por ano do curso e semestre.</p>
        </div>
        <AvisoNotasBloqueadas saldoEmDivida={bloqueio.saldoEmDivida} />
      </div>
    );
  }

  const matriculas = await prisma.matricula.findMany({
    where: { alunoId: session.user.alunoId, status: "ATIVA" },
    include: {
      turma: {
        include: {
          curso: true,
          turmaDisciplinas: { include: { disciplina: true, avaliacoes: { orderBy: { data: "asc" } } } },
        },
      },
      notas: { include: { avaliacao: true } },
    },
  });

  const notaPorCelula = new Map<string, number>();
  for (const matricula of matriculas) {
    for (const nota of matricula.notas) {
      notaPorCelula.set(`${matricula.id}:${nota.avaliacaoId}`, Number(nota.valor));
    }
  }

  function calcularNotaGeral(matriculaId: string, avaliacoes: { id: string; peso: unknown }[]): number | null {
    let soma = 0;
    let temNota = false;
    for (const avaliacao of avaliacoes) {
      const valor = notaPorCelula.get(`${matriculaId}:${avaliacao.id}`);
      if (valor !== undefined) {
        soma += valor * Number(avaliacao.peso);
        temNota = true;
      }
    }
    return temNota ? soma : null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Minhas Notas</h1>
        <p className="text-sm text-navy-400">As suas notas, organizadas por ano do curso e semestre.</p>
      </div>

      {matriculas.length === 0 ? (
        <EmptyState message="Sem matrículas ativas." />
      ) : (
        matriculas.map((matricula) => {
          const disciplinasPorSemestre = new Map<number, typeof matricula.turma.turmaDisciplinas>();
          for (const td of matricula.turma.turmaDisciplinas) {
            const lista = disciplinasPorSemestre.get(td.semestre) ?? [];
            lista.push(td);
            disciplinasPorSemestre.set(td.semestre, lista);
          }
          const semestres = [...disciplinasPorSemestre.keys()].sort((a, b) => a - b);

          return (
            <div key={matricula.id} className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-400">
                {matricula.turma.curso.nome} · {matricula.turma.anoCurricular}º Ano
              </h2>

              {semestres.length === 0 ? (
                <EmptyState message="Sem disciplinas atribuídas a esta turma." />
              ) : (
                semestres.map((semestre) => (
                  <Card key={semestre}>
                    <CardHeader title={`${semestre}º Semestre`} subtitle={`${disciplinasPorSemestre.get(semestre)!.length} disciplina(s)`} />
                    <Table>
                      <Thead>
                        <tr>
                          <Th>Disciplina</Th>
                          <Th>Notas</Th>
                          <Th>Nota Geral</Th>
                        </tr>
                      </Thead>
                      <Tbody>
                        {disciplinasPorSemestre.get(semestre)!.map((td) => {
                          const notaGeral = calcularNotaGeral(matricula.id, td.avaliacoes);
                          return (
                            <Tr key={td.id}>
                              <Td className="font-medium text-navy-900">{td.disciplina.nome}</Td>
                              <Td>
                                {td.avaliacoes.length === 0 ? (
                                  "—"
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {td.avaliacoes.map((av) => {
                                      const valor = notaPorCelula.get(`${matricula.id}:${av.id}`);
                                      return (
                                        <Badge key={av.id} tone={valor !== undefined ? "info" : "neutral"}>
                                          {av.nome}: {valor !== undefined ? valor : "—"}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                )}
                              </Td>
                              <Td className="font-semibold text-navy-900">{notaGeral !== null ? notaGeral.toFixed(1) : "—"}</Td>
                            </Tr>
                          );
                        })}
                      </Tbody>
                    </Table>
                  </Card>
                ))
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
