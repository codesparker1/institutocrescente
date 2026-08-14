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

  // Por InscricaoCadeira, não por Matricula — cobre repetentes, cujas cadeiras podem estar
  // ligadas a uma Turma de um ano anterior ao ano curricular atual do aluno (§4.2).
  const inscricoes = await prisma.inscricaoCadeira.findMany({
    where: { alunoId: session.user.alunoId, ativa: true },
    include: {
      turmaDisciplina: {
        include: {
          disciplina: true,
          turma: { include: { curso: true } },
          avaliacoes: { orderBy: { data: "asc" } },
        },
      },
      notas: { include: { avaliacao: true } },
    },
  });

  function calcularNotaGeral(inscricao: (typeof inscricoes)[number]): number | null {
    let soma = 0;
    let temNota = false;
    for (const avaliacao of inscricao.turmaDisciplina.avaliacoes) {
      const nota = inscricao.notas.find((n) => n.avaliacaoId === avaliacao.id);
      if (nota) {
        soma += Number(nota.valor) * Number(avaliacao.peso);
        temNota = true;
      }
    }
    return temNota ? soma : null;
  }

  const grupos = new Map<string, { label: string; inscricoesPorSemestre: Map<number, typeof inscricoes> }>();
  for (const inscricao of inscricoes) {
    const turma = inscricao.turmaDisciplina.turma;
    const chave = turma.id;
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        label: `${turma.curso.nome} · ${turma.anoCurricular}º Ano`,
        inscricoesPorSemestre: new Map(),
      });
    }
    const grupo = grupos.get(chave)!;
    const semestre = inscricao.turmaDisciplina.semestre;
    const lista = grupo.inscricoesPorSemestre.get(semestre) ?? [];
    lista.push(inscricao);
    grupo.inscricoesPorSemestre.set(semestre, lista);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Minhas Notas</h1>
        <p className="text-sm text-navy-400">As suas notas, organizadas por ano do curso e semestre.</p>
      </div>

      {grupos.size === 0 ? (
        <EmptyState message="Sem cadeiras inscritas." />
      ) : (
        [...grupos.values()].map((grupo) => {
          const semestres = [...grupo.inscricoesPorSemestre.keys()].sort((a, b) => a - b);
          return (
            <div key={grupo.label} className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-400">{grupo.label}</h2>

              {semestres.map((semestre) => {
                const inscricoesSemestre = grupo.inscricoesPorSemestre.get(semestre)!;
                return (
                  <Card key={semestre}>
                    <CardHeader title={`${semestre}º Semestre`} subtitle={`${inscricoesSemestre.length} disciplina(s)`} />
                    <Table>
                      <Thead>
                        <tr>
                          <Th>Disciplina</Th>
                          <Th>Notas</Th>
                          <Th>Nota Geral</Th>
                        </tr>
                      </Thead>
                      <Tbody>
                        {inscricoesSemestre.map((inscricao) => {
                          const notaGeral = calcularNotaGeral(inscricao);
                          return (
                            <Tr key={inscricao.id}>
                              <Td className="font-medium text-navy-900">
                                {inscricao.turmaDisciplina.disciplina.nome}
                                {inscricao.tentativa > 1 ? (
                                  <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-700">
                                    {inscricao.tentativa}ª tentativa
                                  </span>
                                ) : null}
                              </Td>
                              <Td>
                                {inscricao.turmaDisciplina.avaliacoes.length === 0 ? (
                                  "—"
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {inscricao.turmaDisciplina.avaliacoes.map((av) => {
                                      const nota = inscricao.notas.find((n) => n.avaliacaoId === av.id);
                                      return (
                                        <Badge key={av.id} tone={nota ? "info" : "neutral"}>
                                          {av.nome}: {nota ? Number(nota.valor) : "—"}
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
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}
