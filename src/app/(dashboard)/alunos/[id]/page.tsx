import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyState } from "@/components/ui/Table";
import { formatDate } from "@/lib/utils";
import type { AlunoStatus } from "@/generated/prisma/client";

const STATUS_TONE: Record<AlunoStatus, "success" | "warning" | "neutral" | "danger"> = {
  ATIVO: "success",
  TRANCADO: "warning",
  FORMADO: "neutral",
  DESISTENTE: "danger",
};

interface AlunoDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AlunoDetailPage({ params }: AlunoDetailPageProps) {
  const { id } = await params;

  const aluno = await prisma.aluno.findUnique({
    where: { id },
    include: {
      matriculas: {
        include: {
          turma: { include: { disciplina: true, professor: true } },
          notas: { include: { avaliacao: true } },
        },
      },
    },
  });

  if (!aluno) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/alunos" className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-700">
          <ArrowLeft size={16} />
          Voltar para Alunos
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-navy-900">{aluno.nome}</h1>
          <p className="text-sm text-navy-400">{aluno.numeroEstudante} · {aluno.curso}</p>
        </div>
        <Badge tone={STATUS_TONE[aluno.status]}>{aluno.status}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Dados pessoais" />
          <CardBody className="flex flex-col gap-3 text-sm">
            <InfoRow label="Email" value={aluno.email} />
            <InfoRow label="Telefone" value={aluno.telefone} />
            <InfoRow label="Data de nascimento" value={formatDate(aluno.dataNascimento)} />
            <InfoRow label="Género" value={aluno.genero} />
            <InfoRow label="Ano de ingresso" value={String(aluno.anoIngresso)} />
            <InfoRow label="Registado em" value={formatDate(aluno.createdAt)} />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Matrículas e desempenho" subtitle={`${aluno.matriculas.length} turma(s)`} />
          {aluno.matriculas.length === 0 ? (
            <EmptyState message="Sem matrículas registadas." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Turma</Th>
                  <Th>Professor</Th>
                  <Th>Estado</Th>
                  <Th>Notas lançadas</Th>
                </tr>
              </Thead>
              <Tbody>
                {aluno.matriculas.map((matricula) => (
                  <Tr key={matricula.id}>
                    <Td className="font-medium text-navy-900">{matricula.turma.nome}</Td>
                    <Td>{matricula.turma.professor.nome}</Td>
                    <Td>
                      <Badge tone={matricula.status === "ATIVA" ? "success" : "neutral"}>{matricula.status}</Badge>
                    </Td>
                    <Td>
                      {matricula.notas.length === 0
                        ? "—"
                        : matricula.notas.map((n) => `${n.avaliacao.nome}: ${n.valor}`).join(" · ")}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-navy-50 pb-2 last:border-0 last:pb-0">
      <span className="text-navy-400">{label}</span>
      <span className="font-medium text-navy-800">{value}</span>
    </div>
  );
}
