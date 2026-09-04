import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { anoLetivoCorrente } from "@/lib/academico";
import { calcularNotaFinal, extrairNotasPorEpoca, rotuloEstado, toneEstado } from "@/lib/avaliacao";
import { getAgora } from "@/lib/tempo";
import { formatAnoLetivo, formatDate } from "@/lib/utils";

/**
 * Meus Orientandos — os finalistas que este professor orienta (§pedido do cliente 2026-09-04).
 * Só consulta: a nota da defesa é lançada pelo DAAC, não por aqui.
 */
export default async function MeusOrientandosPage() {
  const session = await auth();
  if (!session?.user.professorId) redirect("/dashboard");

  const agora = await getAgora();
  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  const anoLetivo = anoLetivoCorrente(agora, config);

  const orientandos = await prisma.inscricaoCadeira.findMany({
    where:
      anoLetivo === null
        ? { id: "" } // sem ano letivo não há orientação a decorrer — explicado no ecrã
        : { ativa: true, orientadorId: session.user.professorId, turmaDisciplina: { turma: { anoLetivo } } },
    include: {
      aluno: { select: { nome: true, numeroEstudante: true, curso: true, email: true } },
      notas: { include: { avaliacao: true } },
      turmaDisciplina: { include: { avaliacoes: true } },
    },
    orderBy: { aluno: { nome: "asc" } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Meus Orientandos</h1>
        <p className="text-sm text-texto-suave">
          Os finalistas que orienta. A nota da defesa é lançada pelo DAAC.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Monografias que orienta"
          subtitle={
            anoLetivo === null
              ? "Sem ano letivo a decorrer"
              : `${orientandos.length} orientando(s) · ${formatAnoLetivo(anoLetivo)}`
          }
        />
        {orientandos.length === 0 ? (
          <EmptyState
            message={
              anoLetivo === null
                ? "Não há nenhum ano letivo a decorrer. Isto é normal entre anos letivos."
                : "Ainda não lhe foi atribuído nenhum orientando. É o DAAC que faz a atribuição."
            }
          />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Aluno</Th>
                <Th>Curso</Th>
                <Th>Contacto</Th>
                <Th>Defesa</Th>
                <Th>Estado</Th>
                <Th>Nota</Th>
              </tr>
            </Thead>
            <Tbody>
              {orientandos.map((inscricao) => {
                const notas = inscricao.notas.map((n) => ({ valor: Number(n.valor), avaliacao: n.avaliacao }));
                const resultado = calcularNotaFinal(extrairNotasPorEpoca(notas), {
                  permiteDispensa: inscricao.permiteDispensaAplicada,
                  notaMinimaDispensa: Number(inscricao.notaMinimaDispensaAplicada),
                  eMonografia: inscricao.eMonografiaAplicada,
                });
                const defesa = inscricao.turmaDisciplina.avaliacoes.find((a) => a.epoca === "EXAME");
                return (
                  <Tr key={inscricao.id}>
                    <Td className="font-medium text-texto">
                      {inscricao.aluno.nome}
                      <span className="block text-xs text-texto-suave">{inscricao.aluno.numeroEstudante}</span>
                    </Td>
                    <Td>{inscricao.aluno.curso}</Td>
                    <Td className="text-xs">{inscricao.aluno.email ?? "—"}</Td>
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
