import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createDisciplinaAction, deleteDisciplinaAction } from "@/actions/admin";

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
          <form action={createDisciplinaAction} className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end">
            <Field label="Nome" htmlFor="disc-nome">
              <Input id="disc-nome" name="nome" required placeholder="Cálculo I" />
            </Field>
            <Field label="Código" htmlFor="disc-codigo">
              <Input id="disc-codigo" name="codigo" required placeholder="ENG-301" />
            </Field>
            <Field label="Carga horária" htmlFor="disc-carga">
              <Input id="disc-carga" name="cargaHoraria" type="number" min={1} required defaultValue={45} />
            </Field>
            <Field label="Curso" htmlFor="disc-curso">
              <Select id="disc-curso" name="cursoId" required>
                {cursos.map((curso) => (
                  <option key={curso.id} value={curso.id}>
                    {curso.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">Adicionar</Button>
          </form>

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
