import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { deleteDisciplinaAction } from "@/actions/admin";
import { CreateDisciplinaForm } from "./CreateDisciplinaForm";
import type { Prisma } from "@/generated/prisma/client";

interface AdminDisciplinasPageProps {
  searchParams: Promise<{ q?: string; cursoId?: string }>;
}

export default async function AdminDisciplinasPage({ searchParams }: AdminDisciplinasPageProps) {
  const { q, cursoId } = await searchParams;

  const where: Prisma.DisciplinaWhereInput = {};
  if (q) {
    where.OR = [{ nome: { contains: q, mode: "insensitive" } }, { codigo: { contains: q, mode: "insensitive" } }];
  }
  if (cursoId) where.cursoId = cursoId;

  const [cursos, disciplinas] = await Promise.all([
    // select: CreateDisciplinaForm (Client Component) só precisa de id/nome — Curso.valorPropina
    // é Decimal e o Next.js recusa-se a serializar Decimal ao passar de Server para Client Component.
    prisma.curso.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.disciplina.findMany({ where, include: { curso: true }, orderBy: { nome: "asc" } }),
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

          <form className="grid grid-cols-1 gap-3 border-t border-navy-50 pt-4 sm:grid-cols-4 sm:items-end">
            <Input type="search" name="q" defaultValue={q} placeholder="Nome ou código..." className="sm:col-span-2" />
            <Select name="cursoId" defaultValue={cursoId ?? ""}>
              <option value="">Todos os cursos</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
            <button
              type="submit"
              className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800"
            >
              Filtrar
            </button>
          </form>

          {disciplinas.length === 0 ? (
            <EmptyState message="Nenhuma disciplina encontrada." />
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
