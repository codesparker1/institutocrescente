import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { DeleteButtonForm } from "@/components/ui/DeleteButtonForm";
import { deleteProfessorAction } from "@/actions/admin";
import { CreateProfessorForm } from "./CreateProfessorForm";

export default async function AdminProfessoresPage() {
  const professores = await prisma.professor.findMany({ orderBy: { nome: "asc" } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Professores</h1>
        <p className="text-sm text-texto-suave">Utilizadores — corpo docente do ISPC.</p>
      </div>

      <Card>
        <CardHeader title="Professores" subtitle={`${professores.length} professor(es)`} />
        <CardBody className="flex flex-col gap-4">
          <CreateProfessorForm />

          {professores.length === 0 ? (
            <EmptyState message="Nenhum professor cadastrado." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>Email</Th>
                  <Th>Especialidade</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <Tbody>
                {professores.map((professor) => (
                  <Tr key={professor.id}>
                    <Td className="font-medium text-texto">{professor.nome}</Td>
                    <Td>{professor.email}</Td>
                    <Td>{professor.especialidade}</Td>
                    <Td className="text-right">
                      <DeleteButtonForm action={deleteProfessorAction} id={professor.id} />
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
