import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatDate } from "@/lib/utils";
import type { AlunoStatus, CategoriaEstudante, Prisma } from "@/generated/prisma/client";

const STATUS_TONE: Record<AlunoStatus, "success" | "warning" | "neutral" | "danger"> = {
  ATIVO: "success",
  TRANCADO: "warning",
  FORMADO: "neutral",
  DESISTENTE: "danger",
};

const CATEGORIA_LABEL: Record<CategoriaEstudante, string> = {
  NORMAL: "Normal",
  BOLSEIRO_INAGBE: "Bolseiro INAGBE",
  COMPARTICIPADA: "Comparticipada",
};

const CATEGORIA_TONE: Record<CategoriaEstudante, "neutral" | "info"> = {
  NORMAL: "neutral",
  BOLSEIRO_INAGBE: "info",
  COMPARTICIPADA: "info",
};

interface AlunosPageProps {
  searchParams: Promise<{ q?: string; curso?: string; ano?: string; periodo?: string }>;
}

export default async function AlunosPage({ searchParams }: AlunosPageProps) {
  const { q, curso, ano, periodo } = await searchParams;

  const cursos = await prisma.curso.findMany({ orderBy: { nome: "asc" } });

  const where: Prisma.AlunoWhereInput = {};
  if (q) {
    where.OR = [
      { nome: { contains: q, mode: "insensitive" } },
      { numeroEstudante: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }
  if (curso) where.curso = curso;
  if (ano) where.anoCurricular = Number(ano);
  if (periodo) {
    where.matriculas = { some: { status: "ATIVA", turma: { periodo: periodo as "MATUTINO" | "VESPERTINO" | "NOTURNO" } } };
  }

  const alunos = await prisma.aluno.findMany({
    where,
    orderBy: { nome: "asc" },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Alunos</h1>
          <p className="text-sm text-navy-400">Matrículas e gestão do percurso académico.</p>
        </div>
        <Link href="/alunos/novo">
          <Button variant="primary">
            <Plus size={16} />
            Nova matrícula
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader title="Lista de alunos" subtitle={`${alunos.length} resultado(s)`} />
        <CardBody className="flex flex-col gap-4">
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end">
            <Input type="search" name="q" defaultValue={q} placeholder="Nome, nº ou email..." className="sm:col-span-2" />
            <Select name="curso" defaultValue={curso ?? ""}>
              <option value="">Todos os cursos</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.nome}>
                  {c.nome}
                </option>
              ))}
            </Select>
            <Select name="ano" defaultValue={ano ?? ""}>
              <option value="">Todos os anos</option>
              {[1, 2, 3, 4, 5, 6].map((a) => (
                <option key={a} value={a}>
                  {a}º Ano
                </option>
              ))}
            </Select>
            <Select name="periodo" defaultValue={periodo ?? ""}>
              <option value="">Todos os períodos</option>
              <option value="MATUTINO">Matutino</option>
              <option value="VESPERTINO">Vespertino</option>
              <option value="NOTURNO">Noturno</option>
            </Select>
            <button
              type="submit"
              className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800 sm:col-span-5 sm:w-fit"
            >
              Filtrar
            </button>
          </form>

          {alunos.length === 0 ? (
            <EmptyState message="Nenhum aluno encontrado." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Nº Estudante</Th>
                  <Th>Nome</Th>
                  <Th>Curso</Th>
                  <Th>Ano</Th>
                  <Th>Categoria</Th>
                  <Th>Estado</Th>
                  <Th>Registado em</Th>
                </tr>
              </Thead>
              <Tbody>
                {alunos.map((aluno) => (
                  <Tr key={aluno.id}>
                    <Td className="font-mono text-xs">{aluno.numeroEstudante}</Td>
                    <Td>
                      <Link href={`/alunos/${aluno.id}`} className="font-medium text-navy-900 hover:text-navy-600">
                        {aluno.nome}
                      </Link>
                    </Td>
                    <Td>{aluno.curso}</Td>
                    <Td>{aluno.anoCurricular}º Ano</Td>
                    <Td>
                      <Badge tone={CATEGORIA_TONE[aluno.categoria]}>{CATEGORIA_LABEL[aluno.categoria]}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[aluno.status]}>{aluno.status}</Badge>
                    </Td>
                    <Td>{formatDate(aluno.createdAt)}</Td>
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
