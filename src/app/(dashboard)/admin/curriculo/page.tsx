import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Select } from "@/components/ui/Select";
import { DeleteButtonForm } from "@/components/ui/DeleteButtonForm";
import { deleteCadeiraCurricularAction } from "@/actions/admin";
import { CreateCadeiraCurricularForm } from "./CreateCadeiraCurricularForm";
import { EditarRegrasCadeiraCurricular } from "./EditarRegrasCadeiraCurricular";

interface AdminCurriculoPageProps {
  searchParams: Promise<{ cursoId?: string }>;
}

export default async function AdminCurriculoPage({ searchParams }: AdminCurriculoPageProps) {
  const { cursoId: cursoIdParam } = await searchParams;
  const cursos = await prisma.curso.findMany({ orderBy: { nome: "asc" } });
  const cursoId = cursoIdParam ?? cursos[0]?.id ?? "";
  const curso = cursoId ? cursos.find((c) => c.id === cursoId) : null;

  // TODAS as disciplinas, não só as deste curso (§pedido do cliente 2026-09-02): uma disciplina
  // pode entrar no plano de vários cursos, para não haver cinco "Matemática I" no sistema. O que
  // o plano partilha é a DEFINIÇÃO (nome, código, carga horária) — cada curso continua a ter a sua
  // turma, professor, horário e pauta, porque tudo isso pende de CadeiraCurricular, não daqui.
  // `Disciplina.cursoId` fica a significar apenas onde a disciplina foi criada: serve para agrupar
  // esta lista e mostrar de onde vem, não para restringir quem a usa.
  const [disciplinas, cadeiras] = cursoId
    ? await Promise.all([
        prisma.disciplina.findMany({
          include: { curso: { select: { nome: true } } },
          orderBy: [{ curso: { nome: "asc" } }, { nome: "asc" }],
        }),
        prisma.cadeiraCurricular.findMany({
          where: { cursoId },
          include: {
            disciplina: { include: { curso: { select: { nome: true } } } },
            _count: { select: { turmaDisciplinas: true } },
          },
          orderBy: [{ anoCurricular: "asc" }, { semestre: "asc" }, { disciplina: { nome: "asc" } }],
        }),
      ])
    : [[], []];

  // Já no plano: não vale a pena voltar a oferecê-las no seletor — o @@unique da CadeiraCurricular
  // recusaria a mesma disciplina no mesmo ano/semestre, e repeti-la noutro ano é raro o suficiente
  // para não justificar poluir a lista.
  const jaNoPlano = new Set(cadeiras.map((c) => c.disciplinaId));
  const disciplinasDisponiveis = disciplinas
    .filter((d) => !jaNoPlano.has(d.id))
    .map((d) => ({ id: d.id, nome: d.nome, cursoOrigem: d.cursoId === cursoId ? null : d.curso.nome }));

  // Cobertura da monografia em TODOS os cursos, não só no selecionado: a pergunta "já está em
  // todos?" não se responde curso a curso.
  //
  // Só LEITURA, de propósito. Houve aqui um botão que aplicava a monografia a todos os cursos de
  // uma vez (§2026-09-07, removido no mesmo dia): escolher a disciplina errada no dropdown marcava
  // uma cadeira normal como monografia em todo o sistema. Avisar que falta é útil; agir por conta
  // própria em todos os cursos não é.
  const cadeirasMonografia = await prisma.cadeiraCurricular.findMany({
    where: { eMonografia: true },
    select: { cursoId: true, disciplina: { select: { nome: true } } },
  });
  const cursosComMonografia = new Set(cadeirasMonografia.map((c) => c.cursoId));
  const cursosEmFalta = cursos.filter((c) => !cursosComMonografia.has(c.id)).map((c) => c.nome);
  // Nomear a disciplina que já faz esse papel noutro curso responde à pergunta que vem logo a
  // seguir — "crio uma nova?". Não: é a mesma, adicionada ao plano deste curso. Criar outra bate
  // no código único da Disciplina, e era esse o beco reportado a 2026-09-07.
  const nomesMonografia = [...new Set(cadeirasMonografia.map((c) => c.disciplina.nome))].sort((a, b) =>
    a.localeCompare(b, "pt"),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Plano Curricular</h1>
        <p className="text-sm text-texto-suave">
          Define em que ano e semestre de cada curso se leciona cada disciplina — a cadeira curricular.
        </p>
      </div>

      <Card>
        <CardBody>
          <form className="flex items-end gap-3">
            <div className="flex-1 sm:max-w-xs">
              <label className="mb-1 block text-xs font-medium text-texto">Curso</label>
              <Select name="cursoId" defaultValue={cursoId}>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800"
            >
              Ver
            </button>
          </form>
        </CardBody>
      </Card>

      {/* Fora do cartão do curso selecionado de propósito: isto é sobre TODOS os cursos. */}
      {cursosEmFalta.length > 0 ? (
        <p className="rounded-lg border border-gold-200 bg-gold-50 px-4 py-3 text-xs text-gold-800">
          <strong>
            {cursosEmFalta.length} de {cursos.length} curso(s) ainda não têm monografia no último ano:
          </strong>{" "}
          {cursosEmFalta.join(", ")}. Escolha cada curso acima e adicione-a ao plano com o tipo{" "}
          <strong>Monografia (defesa)</strong>.
          {nomesMonografia.length > 0 ? (
            <>
              {" "}
              Use a mesma disciplina que já serve noutro curso ({nomesMonografia.join(", ")}) — está no seletor, em
              &quot;De outros cursos (partilhada)&quot;. Não crie uma nova em Disciplinas.
            </>
          ) : null}
        </p>
      ) : null}

      {!curso ? (
        <EmptyState message="Nenhum curso cadastrado. Crie um curso primeiro em Admin > Cursos." />
      ) : (
        <Card>
          <CardHeader title={curso.nome} subtitle={`${cadeiras.length} cadeira(s) no plano curricular`} />
          <CardBody className="flex flex-col gap-4">
            {disciplinasDisponiveis.length === 0 ? (
              <p className="text-sm text-texto-suave">
                {disciplinas.length === 0 ? (
                  <>
                    Ainda não há disciplinas no sistema. Crie-as primeiro em{" "}
                    <Link href="/admin/disciplinas" className="underline hover:text-navy-600">
                      Disciplinas
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    Todas as disciplinas do sistema já estão neste plano. Para acrescentar outra, crie-a em{" "}
                    <Link href="/admin/disciplinas" className="underline hover:text-navy-600">
                      Disciplinas
                    </Link>
                    .
                  </>
                )}
              </p>
            ) : (
              <CreateCadeiraCurricularForm
                cursoId={curso.id}
                disciplinas={disciplinasDisponiveis}
                duracaoAnos={curso.duracaoAnos}
              />
            )}

            {cadeiras.length === 0 ? (
              <EmptyState message="Nenhuma cadeira definida ainda para este curso." />
            ) : (
              <Table>
                <Thead>
                  <tr>
                    <Th>Disciplina</Th>
                    <Th>Ano</Th>
                    <Th>Semestre</Th>
                    <Th>Turmas a lecionar</Th>
                    <Th>Regras de dispensa (§4.1.1)</Th>
                    <Th></Th>
                  </tr>
                </Thead>
                <Tbody>
                  {cadeiras.map((cadeira) => (
                    <Tr key={cadeira.id}>
                      <Td className="font-medium text-texto">
                        {cadeira.disciplina.nome}
                        {cadeira.disciplina.cursoId !== cursoId ? (
                          <span className="ml-2 rounded bg-navy-50 px-1.5 py-0.5 text-xs font-normal text-texto">
                            de {cadeira.disciplina.curso.nome}
                          </span>
                        ) : null}
                        {/* A monografia comporta-se de forma diferente de todas as outras cadeiras
                            (nota única, só o DAAC lança) — tem de se ver na lista qual é. */}
                        {cadeira.eMonografia ? (
                          <span className="ml-2 rounded bg-gold-100 px-1.5 py-0.5 text-xs font-normal text-gold-800">
                            Monografia
                          </span>
                        ) : null}
                      </Td>
                      <Td>{cadeira.anoCurricular}º Ano</Td>
                      {/* O valor gravado (sempre 1) não tem significado para a monografia — ver
                          CreateCadeiraCurricularAction. Mostrá-lo enganaria quem lê a lista. */}
                      <Td>{cadeira.eMonografia ? "Ano inteiro" : `${cadeira.semestre}º Semestre`}</Td>
                      <Td>{cadeira._count.turmaDisciplinas}</Td>
                      <Td>
                        <EditarRegrasCadeiraCurricular
                          cadeiraCurricularId={cadeira.id}
                          permiteDispensa={cadeira.permiteDispensa}
                          notaMinimaDispensa={Number(cadeira.notaMinimaDispensa)}
                        />
                      </Td>
                      <Td className="text-right">
                        <DeleteButtonForm action={deleteCadeiraCurricularAction} id={cadeira.id} />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
