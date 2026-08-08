import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createCursoAction, deleteCursoAction } from "@/actions/admin";

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
          <form action={createCursoAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
            <Field label="Nome" htmlFor="curso-nome">
              <Input id="curso-nome" name="nome" required placeholder="Engenharia Civil" />
            </Field>
            <Field label="Código" htmlFor="curso-codigo">
              <Input id="curso-codigo" name="codigo" required placeholder="ENG-CIV" />
            </Field>
            <Field label="Duração (anos)" htmlFor="curso-duracao">
              <Input id="curso-duracao" name="duracaoAnos" type="number" min={1} max={8} required defaultValue={4} />
            </Field>
            <Button type="submit">Adicionar</Button>
          </form>

          {cursos.length === 0 ? (
            <EmptyState message="Nenhum curso cadastrado." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>Código</Th>
                  <Th>Duração</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <Tbody>
                {cursos.map((curso) => (
                  <Tr key={curso.id}>
                    <Td className="font-medium text-navy-900">{curso.nome}</Td>
                    <Td>{curso.codigo}</Td>
                    <Td>{curso.duracaoAnos} anos</Td>
                    <Td className="text-right">
                      <form action={deleteCursoAction}>
                        <input type="hidden" name="id" value={curso.id} />
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
