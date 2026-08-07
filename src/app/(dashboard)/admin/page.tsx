import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import {
  createCursoAction,
  deleteCursoAction,
  createDisciplinaAction,
  deleteDisciplinaAction,
  createProfessorAction,
  deleteProfessorAction,
  createTurmaAction,
  deleteTurmaAction,
} from "@/actions/admin";

function DeleteButton() {
  return (
    <button type="submit" className="rounded-md p-1.5 text-navy-300 hover:bg-red-50 hover:text-red-600" aria-label="Remover">
      <Trash2 size={15} />
    </button>
  );
}

export default async function AdminPage() {
  const [cursos, disciplinas, professores, turmas] = await Promise.all([
    prisma.curso.findMany({ orderBy: { nome: "asc" } }),
    prisma.disciplina.findMany({ include: { curso: true }, orderBy: { nome: "asc" } }),
    prisma.professor.findMany({ orderBy: { nome: "asc" } }),
    prisma.turma.findMany({ include: { disciplina: true, professor: true }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Administração</h1>
        <p className="text-sm text-navy-400">Gestão de cursos, disciplinas, professores e turmas.</p>
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
                        <DeleteButton />
                      </form>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

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
                        <DeleteButton />
                      </form>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

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
                        <DeleteButton />
                      </form>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Turmas" subtitle={`${turmas.length} turma(s)`} />
        <CardBody className="flex flex-col gap-4">
          <form action={createTurmaAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Nome" htmlFor="turma-nome">
              <Input id="turma-nome" name="nome" required placeholder="Cálculo I - Turma B" />
            </Field>
            <Field label="Disciplina" htmlFor="turma-disciplina">
              <Select id="turma-disciplina" name="disciplinaId" required>
                {disciplinas.map((disciplina) => (
                  <option key={disciplina.id} value={disciplina.id}>
                    {disciplina.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Professor" htmlFor="turma-professor">
              <Select id="turma-professor" name="professorId" required>
                {professores.map((professor) => (
                  <option key={professor.id} value={professor.id}>
                    {professor.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sala" htmlFor="turma-sala">
              <Input id="turma-sala" name="sala" required placeholder="Sala 3" />
            </Field>
            <Field label="Ano letivo" htmlFor="turma-ano">
              <Input id="turma-ano" name="anoLetivo" type="number" required defaultValue={2026} />
            </Field>
            <Field label="Semestre" htmlFor="turma-semestre">
              <Select id="turma-semestre" name="semestre" required defaultValue="1">
                <option value="1">1º Semestre</option>
                <option value="2">2º Semestre</option>
              </Select>
            </Field>
            <Field label="Horário" htmlFor="turma-horario">
              <Input id="turma-horario" name="horario" required placeholder="Seg/Qua 08h-10h" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Adicionar
              </Button>
            </div>
          </form>

          {turmas.length === 0 ? (
            <EmptyState message="Nenhuma turma cadastrada." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Turma</Th>
                  <Th>Disciplina</Th>
                  <Th>Professor</Th>
                  <Th>Horário</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <Tbody>
                {turmas.map((turma) => (
                  <Tr key={turma.id}>
                    <Td className="font-medium text-navy-900">{turma.nome}</Td>
                    <Td>{turma.disciplina.nome}</Td>
                    <Td>{turma.professor.nome}</Td>
                    <Td>{turma.horario}</Td>
                    <Td className="text-right">
                      <form action={deleteTurmaAction}>
                        <input type="hidden" name="id" value={turma.id} />
                        <DeleteButton />
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
