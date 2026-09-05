import Link from "next/link";
import { redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { podeGerirCurriculo } from "@/lib/permissions";
import { anoLetivoCorrente } from "@/lib/academico";
import { getFinalistas, ESTADO_FINALISTA_LABEL, type EstadoFinalista, type FinalistaItem } from "@/lib/finalistas";
import { getAgora } from "@/lib/tempo";
import { formatAnoLetivo, formatDefesa, PERIODO_LABEL } from "@/lib/utils";
import type { Periodo } from "@/generated/prisma/client";
import { ConfirmarPagamento } from "./ConfirmarPagamento";
import { EditarOrientador } from "./EditarOrientador";
import { EditarDefesa } from "./EditarDefesa";

const TONE_ESTADO: Record<EstadoFinalista, "neutral" | "success" | "warning" | "danger" | "info"> = {
  SEM_MONOGRAFIA_NO_PLANO: "neutral",
  POR_CONFIRMAR: "warning",
  SEM_ORIENTADOR: "warning",
  DEFESA_POR_MARCAR: "info",
  DEFESA_MARCADA: "info",
  CONCLUIDA: "success",
};

interface FinalistasPageProps {
  searchParams: Promise<{ curso?: string; periodo?: string; estado?: string; q?: string }>;
}

/**
 * Finalistas — os alunos no último ano do curso e o percurso da monografia de cada um:
 * pagamento → orientador → defesa → nota (§pedido do cliente 2026-09-04 e 2026-09-05).
 *
 * A lista sai das MATRÍCULAS do último ano, não das inscrições em monografia: desde que a
 * monografia passou a depender da confirmação do pagamento, um finalista por pagar não tem
 * inscrição, e desapareceria da própria lista onde o DAAC o tem de confirmar.
 */
export default async function FinalistasPage({ searchParams }: FinalistasPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!podeGerirCurriculo(session.user)) redirect("/dashboard");

  const { curso, periodo, estado, q } = await searchParams;
  const estadoFiltro = estado && estado in ESTADO_FINALISTA_LABEL ? (estado as EstadoFinalista) : undefined;

  const agora = await getAgora();
  const config = await prisma.configuracaoAcademica.findUnique({ where: { id: "config" } });
  const anoLetivo = anoLetivoCorrente(agora, config);
  const limite = config?.limiteOrientandosPorProfessor ?? 5;

  const [finalistas, cursos, professores] = await Promise.all([
    anoLetivo === null
      ? Promise.resolve([] as FinalistaItem[])
      : getFinalistas(anoLetivo, {
          curso: curso || undefined,
          periodo: (periodo || undefined) as Periodo | undefined,
          estado: estadoFiltro,
          q: q?.trim() || undefined,
        }),
    prisma.curso.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
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

  const opcoesProfessores = professores.map((p) => ({ id: p.id, nome: p.nome, orientandos: p._count.orientandos }));

  const porConfirmar = finalistas.filter((f) => f.estado === "POR_CONFIRMAR").length;
  const comDefesaMarcada = finalistas.filter((f) => f.defesaData !== null).length;

  // A pauta de defesas imprime exatamente o que está filtrado no ecrã (só quem tem data marcada).
  const queryImpressao = new URLSearchParams();
  if (curso) queryImpressao.set("curso", curso);
  if (periodo) queryImpressao.set("periodo", periodo);
  if (q?.trim()) queryImpressao.set("q", q.trim());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Finalistas</h1>
        <p className="text-sm text-texto-suave">
          Alunos no último ano do curso. A monografia é atribuída ao confirmar o pagamento; depois disso atribui-se o
          orientador e marca-se a defesa. A nota lança-se em Notas e Frequência.
        </p>
      </div>

      <Card>
        <CardBody>
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Nome ou nº de estudante"
              className="rounded-lg border border-navy-100 px-3 py-2 text-sm text-texto"
            />
            <Select name="curso" defaultValue={curso ?? ""}>
              <option value="">Todos os cursos</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.nome}>
                  {c.nome}
                </option>
              ))}
            </Select>
            <Select name="periodo" defaultValue={periodo ?? ""}>
              <option value="">Todos os períodos</option>
              <option value="MATUTINO">Matutino</option>
              <option value="VESPERTINO">Vespertino</option>
              <option value="NOTURNO">Noturno</option>
            </Select>
            <Select name="estado" defaultValue={estadoFiltro ?? ""}>
              <option value="">Todos os estados</option>
              {Object.entries(ESTADO_FINALISTA_LABEL).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
            </Select>
            <button
              type="submit"
              className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800 sm:col-span-4 sm:w-fit"
            >
              Filtrar
            </button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Monografias"
          subtitle={
            anoLetivo === null
              ? "Sem ano letivo a decorrer"
              : `${finalistas.length} finalista(s) · ${formatAnoLetivo(anoLetivo)}${
                  porConfirmar > 0 ? ` · ${porConfirmar} com o pagamento por confirmar` : ""
                }`
          }
          action={
            // Só aparece quando há defesas marcadas para imprimir — um botão que geraria uma folha
            // em branco é pior do que botão nenhum (§auditoria 2026-09-03).
            comDefesaMarcada > 0 ? (
              <Link
                href={`/api/defesas?${queryImpressao.toString()}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-texto-suave hover:bg-navy-50 hover:text-navy-700"
              >
                <Printer size={15} />
                Pauta de defesas ({comDefesaMarcada})
              </Link>
            ) : null
          }
        />
        {finalistas.length === 0 ? (
          <EmptyState
            message={
              anoLetivo === null
                ? "Não há nenhum ano letivo a decorrer. Isto é normal entre anos letivos."
                : curso || periodo || estadoFiltro || q?.trim()
                  ? "Nenhum finalista corresponde a estes filtros."
                  : "Nenhum aluno tem matrícula ativa no último ano de um curso este ano letivo."
            }
          />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Aluno</Th>
                <Th>Curso</Th>
                <Th>Pagamento</Th>
                <Th>Orientador</Th>
                <Th>Defesa</Th>
                <Th>Estado</Th>
                <Th>Nota</Th>
              </tr>
            </Thead>
            <Tbody>
              {finalistas.map((finalista) => (
                <Tr key={finalista.alunoId}>
                  <Td className="font-medium text-texto">
                    <Link href={`/alunos/${finalista.alunoId}`} className="hover:underline">
                      {finalista.nome}
                    </Link>
                    <span className="block text-xs text-texto-suave">{finalista.numeroEstudante}</span>
                  </Td>
                  <Td>
                    {finalista.cursoNome}
                    <span className="block text-xs text-texto-suave">
                      {finalista.anoCurricular}º Ano · {PERIODO_LABEL[finalista.periodo]}
                    </span>
                  </Td>
                  <Td>
                    <ConfirmarPagamento
                      alunoId={finalista.alunoId}
                      turmaId={finalista.turmaId}
                      inscricaoId={finalista.inscricaoId}
                      confirmadaEm={finalista.confirmadaEm}
                      confirmadaPorNome={finalista.confirmadaPorNome}
                      temMonografiaNoPlano={finalista.estado !== "SEM_MONOGRAFIA_NO_PLANO"}
                      temNota={finalista.notaFinal !== null}
                    />
                  </Td>
                  <Td>
                    {/* Sem monografia atribuída não há inscrição a que ligar um orientador — em vez
                        de um seletor morto, diz-se qual é o passo em falta. */}
                    {finalista.inscricaoId ? (
                      <EditarOrientador
                        inscricaoId={finalista.inscricaoId}
                        orientadorAtualId={finalista.orientadorId}
                        professores={opcoesProfessores}
                        limite={limite}
                      />
                    ) : (
                      <span className="text-xs text-texto-suave">Confirme primeiro o pagamento.</span>
                    )}
                  </Td>
                  <Td>
                    {finalista.inscricaoId ? (
                      <EditarDefesa
                        inscricaoId={finalista.inscricaoId}
                        defesaData={finalista.defesaData}
                        defesaSala={finalista.defesaSala}
                        temOrientador={finalista.orientadorId !== null}
                      />
                    ) : (
                      <span className="text-xs text-texto-suave">—</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={TONE_ESTADO[finalista.estado]}>{ESTADO_FINALISTA_LABEL[finalista.estado]}</Badge>
                    {finalista.defesaData ? (
                      <span className="mt-1 block text-xs text-texto-suave">
                        {formatDefesa(finalista.defesaData, finalista.defesaSala)}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="font-semibold text-texto">
                    {finalista.notaFinal !== null ? finalista.notaFinal.toFixed(1) : "—"}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
