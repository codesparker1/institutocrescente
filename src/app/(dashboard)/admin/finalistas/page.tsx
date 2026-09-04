import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { podeGerirCurriculo } from "@/lib/permissions";
import { anoLetivoCorrente } from "@/lib/academico";
import { calcularNotaFinal, extrairNotasPorEpoca, rotuloEstado, toneEstado } from "@/lib/avaliacao";
import { getAgora } from "@/lib/tempo";
import { formatAnoLetivo, formatDate } from "@/lib/utils";
import { EditarOrientador } from "./EditarOrientador";

/**
 * Finalistas — quem está a fazer a monografia este ano letivo, e quem os orienta
 * (§pedido do cliente 2026-09-04). É daqui que o DAAC atribui os orientadores.
 */
export default async function FinalistasPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!podeGerirCurriculo(session.user)) redirect("/dashboard");

  const agora = await getAgora();
  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  const anoLetivo = anoLetivoCorrente(agora, config);
  const limite = config?.limiteOrientandosPorProfessor ?? 5;

  // Fora do ano letivo não há finalistas a mostrar — o `id: ""` impossível é o mesmo padrão da
  // página do professor, para o ecrã poder explicar a diferença entre "não há ano letivo" e
  // "não há monografias".
  const [inscricoes, professores] = await Promise.all([
    prisma.inscricaoCadeira.findMany({
      where:
        anoLetivo === null
          ? { id: "" }
          : { ativa: true, eMonografiaAplicada: true, turmaDisciplina: { turma: { anoLetivo } } },
      include: {
        aluno: { select: { id: true, nome: true, numeroEstudante: true, curso: true } },
        orientador: { select: { id: true, nome: true } },
        notas: { include: { avaliacao: true } },
        turmaDisciplina: { include: { disciplina: true, avaliacoes: true } },
      },
      orderBy: { aluno: { nome: "asc" } },
    }),
    prisma.professor.findMany({
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        // Só as ativas: uma monografia de um ano anterior, já fechada, não ocupa lugar este ano.
        _count: { select: { orientandos: { where: { ativa: true } } } },
      },
    }),
  ]);

  const opcoesProfessores = professores.map((p) => ({
    id: p.id,
    nome: p.nome,
    orientandos: p._count.orientandos,
  }));

  const semOrientador = inscricoes.filter((i) => !i.orientadorId).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Finalistas</h1>
        <p className="text-sm text-texto-suave">
          Alunos a fazer a monografia e o professor que os orienta. A nota da defesa lança-se em Notas e Frequência.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Monografias em curso"
          subtitle={
            anoLetivo === null
              ? "Sem ano letivo a decorrer"
              : `${inscricoes.length} finalista(s) · ${formatAnoLetivo(anoLetivo)}${
                  semOrientador > 0 ? ` · ${semOrientador} ainda sem orientador` : ""
                }`
          }
        />
        {inscricoes.length === 0 ? (
          <EmptyState
            message={
              anoLetivo === null
                ? "Não há nenhum ano letivo a decorrer. Isto é normal entre anos letivos."
                : "Nenhum aluno está inscrito numa monografia este ano. A cadeira do último ano tem de estar marcada como monografia em Plano Curricular."
            }
          />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Aluno</Th>
                <Th>Curso</Th>
                <Th>Orientador</Th>
                <Th>Defesa</Th>
                <Th>Estado</Th>
                <Th>Nota</Th>
              </tr>
            </Thead>
            <Tbody>
              {inscricoes.map((inscricao) => {
                const notas = inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao }));
                const resultado = calcularNotaFinal(extrairNotasPorEpoca(notas), {
                  permiteDispensa: inscricao.permiteDispensaAplicada,
                  notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
                  eMonografia: inscricao.eMonografiaAplicada,
                });
                // A defesa é a Avaliacao da época EXAME desta TurmaDisciplina — ver a nota no
                // schema sobre porque a monografia reutiliza essa época.
                const defesa = inscricao.turmaDisciplina.avaliacoes.find((a) => a.epoca === "EXAME");
                return (
                  <Tr key={inscricao.id}>
                    <Td className="font-medium text-texto">
                      <Link href={`/alunos/${inscricao.aluno.id}`} className="hover:underline">
                        {inscricao.aluno.nome}
                      </Link>
                      <span className="block text-xs text-texto-suave">{inscricao.aluno.numeroEstudante}</span>
                    </Td>
                    <Td>{inscricao.aluno.curso}</Td>
                    <Td>
                      <EditarOrientador
                        inscricaoId={inscricao.id}
                        orientadorAtualId={inscricao.orientadorId}
                        professores={opcoesProfessores}
                        limite={limite}
                      />
                    </Td>
                    <Td>
                      {defesa ? (
                        <>
                          {formatDate(defesa.data)}
                          {defesa.sala ? <span className="block text-xs text-texto-suave">{defesa.sala}</span> : null}
                        </>
                      ) : (
                        <span className="text-texto-suave">Por agendar</span>
                      )}
                    </Td>
                    <Td>
                      {/* semestreFechado=false: a monografia nunca fecha a zeros, logo "Por
                          defender" continua a ser verdade enquanto a nota não for lançada. */}
                      <Badge tone={toneEstado(resultado.estado, false)}>{rotuloEstado(resultado.estado, false)}</Badge>
                    </Td>
                    <Td className="font-semibold text-texto">
                      {resultado.notaFinal !== null ? resultado.notaFinal.toFixed(1) : "—"}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
