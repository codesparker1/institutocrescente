import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { DeleteButtonForm } from "@/components/ui/DeleteButtonForm";
import { deleteCursoAction } from "@/actions/admin";
import { CreateCursoForm } from "./CreateCursoForm";
import { EditarValorPropinaCurso } from "./EditarValorPropinaCurso";

export default async function AdminCursosPage() {
  const cursos = await prisma.curso.findMany({ orderBy: { nome: "asc" } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Cursos</h1>
        <p className="text-sm text-navy-400">Gestão académica — cursos oferecidos pelo ISPC.</p>
      </div>

      <Card>
        <CardHeader title="Cursos" subtitle={`${cursos.length} curso(s)`} />
        <CardBody className="flex flex-col gap-4">
          <CreateCursoForm />

          {cursos.length === 0 ? (
            <EmptyState message="Nenhum curso cadastrado." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>Código</Th>
                  <Th>Duração</Th>
                  <Th>Propina mensal (Kz)</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <Tbody>
                {cursos.map((curso) => (
                  <Tr key={curso.id}>
                    <Td className="font-medium text-navy-900">{curso.nome}</Td>
                    <Td>{curso.codigo}</Td>
                    <Td>{curso.duracaoAnos} anos</Td>
                    <Td>
                      <EditarValorPropinaCurso cursoId={curso.id} valorPropina={Number(curso.valorPropina)} />
                    </Td>
                    <Td className="text-right">
                      <DeleteButtonForm action={deleteCursoAction} id={curso.id} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
