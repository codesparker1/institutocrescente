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

  const [disciplinas, cadeiras] = cursoId
    ? await Promise.all([
        prisma.disciplina.findMany({ where: { cursoId }, orderBy: { nome: "asc" } }),
        prisma.cadeiraCurricular.findMany({
          where: { cursoId },
          include: { disciplina: true, _count: { select: { turmaDisciplinas: true } } },
          orderBy: [{ anoCurricular: "asc" }, { semestre: "asc" }, { disciplina: { nome: "asc" } }],
        }),
      ])
    : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Plano Curricular</h1>
        <p className="text-sm text-navy-400">
          Define em que ano e semestre de cada curso se leciona cada disciplina — a cadeira curricular.
        </p>
      </div>

      <Card>
        <CardBody>
          <form className="flex items-end gap-3">
            <div className="flex-1 sm:max-w-xs">
              <label className="mb-1 block text-xs font-medium text-navy-500">Curso</label>
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

      {!curso ? (
        <EmptyState message="Nenhum curso cadastrado. Crie um curso primeiro em Admin > Cursos." />
      ) : (
        <Card>
          <CardHeader title={curso.nome} subtitle={`${cadeiras.length} cadeira(s) no plano curricular`} />
          <CardBody className="flex flex-col gap-4">
            {disciplinas.length === 0 ? (
              <p className="text-sm text-navy-400">
                Este curso ainda não tem disciplinas. Crie-as primeiro em{" "}
                <Link href="/admin/disciplinas" className="underline hover:text-navy-600">
                  Disciplinas
                </Link>
                .
              </p>
            ) : (
              <CreateCadeiraCurricularForm cursoId={curso.id} disciplinas={disciplinas} duracaoAnos={curso.duracaoAnos} />
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
                      <Td className="font-medium text-navy-900">{cadeira.disciplina.nome}</Td>
                      <Td>{cadeira.anoCurricular}º Ano</Td>
                      <Td>{cadeira.semestre}º Semestre</Td>
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
