import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DeleteButtonForm } from "@/components/ui/DeleteButtonForm";
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
  // Filtrar por "usada no plano deste curso", não por "criada neste curso": desde que há partilha,
  // quem filtra por Engenharia quer ver o que Engenharia lecciona — incluindo a Matemática I que
  // nasceu em Gestão. O OR mantém à vista as disciplinas criadas aqui mas ainda sem plano, que de
  // outro modo desapareciam do ecrã onde foram criadas.
  // AND (não OR): o `where.OR` acima é o da pesquisa por texto, e sobrepô-lo faria o filtro de
  // curso apagar a pesquisa — os dois têm de valer ao mesmo tempo.
  if (cursoId) {
    where.AND = [{ OR: [{ cadeirasCurriculares: { some: { cursoId } } }, { cursoId }] }];
  }

  const [cursos, disciplinas] = await Promise.all([
    // select: CreateDisciplinaForm (Client Component) só precisa de id/nome — Curso.valorPropina
    // é Decimal e o Next.js recusa-se a serializar Decimal ao passar de Server para Client Component.
    prisma.curso.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    // cadeirasCurriculares: em que planos a disciplina é usada. Desde que uma disciplina pode
    // servir vários cursos (§pedido do cliente 2026-09-02), "Curso" sozinho enganaria — diria só
    // onde foi criada, não quem depende dela. Quem apaga ou altera precisa de ver as duas coisas.
    prisma.disciplina.findMany({
      where,
      include: {
        curso: true,
        cadeirasCurriculares: {
          select: { cursoId: true, curso: { select: { nome: true } } },
          distinct: ["cursoId"],
          orderBy: { curso: { nome: "asc" } },
        },
      },
      orderBy: { nome: "asc" },
    }),
  ]);

  // Contado sobre a lista já filtrada: o aviso descreve o que está no ecrã, não o sistema inteiro.
  const partilhadas = disciplinas.filter((d) => d.cadeirasCurriculares.length > 1).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Disciplinas</h1>
        <p className="text-sm text-navy-400">
          Gestão académica — a mesma disciplina pode entrar no plano de vários cursos, sem ser duplicada.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Disciplinas"
          subtitle={
            partilhadas > 0
              ? `${disciplinas.length} disciplina(s) — ${partilhadas} usada(s) por mais de um curso. Uma disciplina partilhada é a mesma em todos: alterá-la altera-a em todos os planos onde entra.`
              : `${disciplinas.length} disciplina(s)`
          }
        />
        <CardBody className="flex flex-col gap-4">
          <CreateDisciplinaForm cursos={cursos} />

          <form className="grid grid-cols-1 gap-3 border-t border-navy-50 pt-4 sm:grid-cols-4 sm:items-end">
            <Input type="search" name="q" defaultValue={q} placeholder="Nome ou código..." className="sm:col-span-2" />
            <Select name="cursoId" defaultValue={cursoId ?? ""}>
              {/* "No plano de" e não só o nome do curso: o filtro passou a ser por quem lecciona a
                  disciplina, não por quem a criou — o rótulo tem de dizer o que o filtro faz. */}
              <option value="">Todos os cursos</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>
                  No plano de {c.nome}
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
                  <Th>Criada em</Th>
                  <Th>Nos planos de</Th>
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
                    <Td>
                      {disciplina.cadeirasCurriculares.length === 0 ? (
                        <span className="text-navy-300">Nenhum</span>
                      ) : (
                        <span className={disciplina.cadeirasCurriculares.length > 1 ? "font-medium text-navy-900" : ""}>
                          {disciplina.cadeirasCurriculares.map((c) => c.curso.nome).join(", ")}
                        </span>
                      )}
                    </Td>
                    <Td>{disciplina.cargaHoraria}h</Td>
                    <Td className="text-right">
                      <DeleteButtonForm action={deleteDisciplinaAction} id={disciplina.id} />
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
