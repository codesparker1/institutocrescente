import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { ReclamacaoForm } from "@/components/reclamacoes/ReclamacaoForm";
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

export default async function ReclamacoesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const alunoId = session.user.role === "ALUNO" ? session.user.alunoId : undefined;
  const professorId = session.user.role === "PROFESSOR" ? session.user.professorId : undefined;
  const userId = session.user.role === "SECRETARIA" ? session.user.id : undefined;
  if (!alunoId && !professorId && !userId) redirect("/dashboard");

  const reclamacoes = await prisma.reclamacao.findMany({
    where: alunoId ? { alunoId } : professorId ? { professorId } : { userId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Reclamações e Sugestões</h1>
        <p className="text-sm text-navy-400">Encontrou um problema no sistema, ou tem uma ideia para o melhorar? Diga-nos aqui.</p>
      </div>

      <Card>
        <CardHeader title="Nova mensagem" />
        <CardBody>
          <ReclamacaoForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="As suas mensagens anteriores" subtitle={`${reclamacoes.length} enviada(s)`} />
        {reclamacoes.length === 0 ? (
          <EmptyState message="Ainda não enviou nenhuma mensagem." />
        ) : (
          <CardBody className="flex flex-col gap-3">
            {reclamacoes.map((r) => (
              <div key={r.id} className="rounded-lg border border-navy-50 px-4 py-3">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-navy-900">{r.assunto}</span>
                    <Badge tone="neutral">{CATEGORIA_LABEL[r.categoria]}</Badge>
                  </div>
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </div>
                <p className="whitespace-pre-wrap text-sm text-navy-600">{r.mensagem}</p>
                <p className="mt-2 text-xs text-navy-300">{formatDateTime(r.createdAt)}</p>
                {r.resposta ? (
                  <div className="mt-3 rounded-md bg-navy-50 px-3 py-2">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-400">Resposta</p>
                    <p className="whitespace-pre-wrap text-sm text-navy-700">{r.resposta}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </CardBody>
        )}
      </Card>
    </div>
  );
}
