import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createProfessorAction, deleteProfessorAction } from "@/actions/admin";

export default async function AdminProfessoresPage() {
  const professores = await prisma.professor.findMany({ orderBy: { nome: "asc" } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Professores</h1>
        <p className="text-sm text-navy-400">Utilizadores — corpo docente do ISPC.</p>
      </div>

      <Card>
        <CardHeader title="Professores" subtitle={`${professores.length} professor(es)`} />
        <CardBody className="flex flex-col gap-4">
          <form action={createProfessorAction} className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end">
            <Field label="Nome" htmlFor="prof-nome">
              <Input id="prof-nome" name="nome" required placeholder="Eng. Carlos Neto" />
            </Field>
            <Field label="Email" htmlFor="prof-email">
              <Input id="prof-email" name="email" type="email" required placeholder="carlos.neto@ispc.ao" />
            </Field>
            <Field label="Telefone" htmlFor="prof-telefone">
              <Input id="prof-telefone" name="telefone" required placeholder="923 000 000" />
            </Field>
            <Field label="Especialidade" htmlFor="prof-especialidade">
              <Input id="prof-especialidade" name="especialidade" required placeholder="Engenharia Civil" />
            </Field>
            <Button type="submit">Adicionar</Button>
          </form>

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
                    <Td className="font-medium text-navy-900">{professor.nome}</Td>
                    <Td>{professor.email}</Td>
                    <Td>{professor.especialidade}</Td>
                    <Td className="text-right">
                      <form action={deleteProfessorAction}>
                        <input type="hidden" name="id" value={professor.id} />
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
