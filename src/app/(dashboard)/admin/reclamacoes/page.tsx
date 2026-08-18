import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { Select } from "@/components/ui/Select";
import { AtualizarReclamacaoForm } from "@/components/reclamacoes/AtualizarReclamacaoForm";
import { formatDateTime } from "@/lib/utils";
import type { ReclamacaoCategoria, ReclamacaoStatus } from "@/generated/prisma/client";

const CATEGORIA_LABEL: Record<ReclamacaoCategoria, string> = {
  SUGESTAO: "Sugestão",
  RECLAMACAO: "Reclamação",
  PROBLEMA_TECNICO: "Problema técnico",
  OUTRO: "Outro",
};

const STATUS_TONE: Record<ReclamacaoStatus, "warning" | "info" | "success"> = {
  PENDENTE: "warning",
  EM_ANALISE: "info",
  RESOLVIDO: "success",
};

const STATUS_LABEL: Record<ReclamacaoStatus, string> = {
  PENDENTE: "Pendente",
  EM_ANALISE: "Em análise",
  RESOLVIDO: "Resolvido",
};

interface AdminReclamacoesPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function AdminReclamacoesPage({ searchParams }: AdminReclamacoesPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "DEV") redirect("/dashboard");

  const { status } = await searchParams;
  const statusValido = status && ["PENDENTE", "EM_ANALISE", "RESOLVIDO"].includes(status) ? (status as ReclamacaoStatus) : undefined;

  const reclamacoes = await prisma.reclamacao.findMany({
    where: statusValido ? { status: statusValido } : undefined,
    include: { aluno: true, professor: true, user: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Reclamações e Sugestões</h1>
        <p className="text-sm text-navy-400">Mensagens enviadas por qualquer utilizador (aluno, professor, secretaria ou admin) sobre o sistema.</p>
      </div>

      <Card>
        <CardBody>
          <form className="flex items-end gap-3">
            <Select name="status" defaultValue={status ?? ""} className="w-48 text-sm">
              <option value="">Todos os estados</option>
              <option value="PENDENTE">Pendente</option>
              <option value="EM_ANALISE">Em análise</option>
              <option value="RESOLVIDO">Resolvido</option>
            </Select>
            <button type="submit" className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800">
              Filtrar
            </button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Mensagens" subtitle={`${reclamacoes.length} resultado(s)`} />
        {reclamacoes.length === 0 ? (
          <EmptyState message="Nenhuma mensagem encontrada." />
        ) : (
          <CardBody className="flex flex-col gap-4">
            {reclamacoes.map((r) => (
              <div key={r.id} className="rounded-lg border border-navy-50 px-4 py-3">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-navy-900">{r.assunto}</span>
                    <Badge tone="neutral">{CATEGORIA_LABEL[r.categoria]}</Badge>
                    <span className="text-xs text-navy-400">
                      {r.aluno ? (
                        <>
                          {r.aluno.nome} · {r.aluno.numeroEstudante}
                        </>
                      ) : r.professor ? (
                        <>{r.professor.nome} · Professor</>
                      ) : (
                        <>
                          {r.user?.name} · {r.user?.role === "ADMIN" ? "Admin" : "Secretaria"}
                        </>
                      )}
                    </span>
                  </div>
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </div>
                <p className="whitespace-pre-wrap text-sm text-navy-600">{r.mensagem}</p>
                <p className="mt-2 text-xs text-navy-300">{formatDateTime(r.createdAt)}</p>
                <AtualizarReclamacaoForm reclamacaoId={r.id} statusAtual={r.status} respostaAtual={r.resposta} />
              </div>
            ))}
          </CardBody>
        )}
      </Card>
    </div>
  );
}
