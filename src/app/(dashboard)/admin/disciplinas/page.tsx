import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { deleteDisciplinaAction } from "@/actions/admin";
import { CreateDisciplinaForm } from "./CreateDisciplinaForm";

export default async function AdminDisciplinasPage() {
  const [cursos, disciplinas] = await Promise.all([
    prisma.curso.findMany({ orderBy: { nome: "asc" } }),
    prisma.disciplina.findMany({ include: { curso: true }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Disciplinas</h1>
        <p className="text-sm text-navy-400">Gestão académica — disciplinas de cada curso.</p>
      </div>

      <Card>
        <CardHeader title="Disciplinas" subtitle={`${disciplinas.length} disciplina(s)`} />
        <CardBody className="flex flex-col gap-4">
          <CreateDisciplinaForm cursos={cursos} />

          {disciplinas.length === 0 ? (
            <EmptyState message="Nenhuma disciplina cadastrada." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>Código</Th>
                  <Th>Curso</Th>
                  <Th>Carga horária</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <Tbody>
                {disciplinas.map((disciplina) => (
                  <Tr key={disciplina.id}>
                    <Td className="font-medium text-navy-900">{disciplina.nome}</Td>
                    <Td>{disciplina.codigo}</Td>
                    <Td>{disciplina.curso.nome}</Td>
                    <Td>{disciplina.cargaHoraria}h</Td>
                    <Td className="text-right">
                      <form action={deleteDisciplinaAction}>
                        <input type="hidden" name="id" value={disciplina.id} />
                        <button type="submit" className="rounded-md p-1.5 text-navy-300 hover:bg-red-50 hover:text-red-600" aria-label="Remover">
                          <Trash2 size={15} />
                        </button>
                      </form>
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
