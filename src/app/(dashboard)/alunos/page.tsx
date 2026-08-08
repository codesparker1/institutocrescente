import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import type { AlunoStatus } from "@/generated/prisma/client";

const STATUS_TONE: Record<AlunoStatus, "success" | "warning" | "neutral" | "danger"> = {
  ATIVO: "success",
  TRANCADO: "warning",
  FORMADO: "neutral",
  DESISTENTE: "danger",
};

interface AlunosPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function AlunosPage({ searchParams }: AlunosPageProps) {
  const { q } = await searchParams;

  const alunos = await prisma.aluno.findMany({
    where: q
      ? {
          OR: [
            { nome: { contains: q, mode: "insensitive" } },
            { numeroEstudante: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
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
        <CardHeader
          title="Lista de alunos"
          subtitle={`${alunos.length} resultado(s)`}
          action={
            <form className="w-64">
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Pesquisar por nome, nº ou email..."
                className="w-full rounded-lg border border-navy-100 px-3 py-1.5 text-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100"
              />
            </form>
          }
        />
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
                    <Badge tone={STATUS_TONE[aluno.status]}>{aluno.status}</Badge>
                  </Td>
                  <Td>{formatDate(aluno.createdAt)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
