import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeRegistarPagamento } from "@/lib/permissions";
import { getAgora } from "@/lib/tempo";
import { formatDate, turmaLabel } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui/Card";
import { NovoAlunoForm } from "./NovoAlunoForm";

export default async function NovoAlunoPage() {
  const session = await auth();
  if (!session?.user || !podeRegistarPagamento(session.user)) redirect("/alunos");

  // Mesma regra do createAlunoAction (que continua a valer no submit) — mas mostrada ANTES de
  // a secretaria preencher tudo: fora da janela, o formulário nem aparece.
  const config = await prisma.configuracaoAcademica.findUnique({
    where: { id: "config" },
    select: { matriculaInicio: true, matriculaFim: true },
  });
  const agora = await getAgora();
  const matriculaInicio = config?.matriculaInicio ?? null;
  const matriculaFim = config?.matriculaFim ?? null;
  const semJanela = !matriculaInicio || !matriculaFim;
  const janelaAberta = !semJanela && agora >= matriculaInicio && agora <= matriculaFim;
  // §regra confirmada 2026-08-23: fora da janela, a matrícula nova é PODER da ADMIN (igual à
  // rematrícula tardia) — a ADMIN vê o form com aviso; a Secretaria vê o bloqueio.
  const isAdmin = session.user.role === "ADMIN";
  const aviso = semJanela
    ? "Período de matrícula não configurado — defina-o em Admin > Configuração Académica antes de matricular."
    : janelaAberta
      ? null
      : agora < matriculaInicio
        ? `Fora do período de matrícula — abre a ${formatDate(matriculaInicio)}.`
        : `Fora do período de matrícula — encerrou a ${formatDate(matriculaFim)}.`;

  if (!janelaAberta && !isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <Link href="/alunos" className="inline-flex items-center gap-1.5 text-sm text-texto hover:text-navy-700">
            <ArrowLeft size={16} />
            Voltar para Alunos
          </Link>
          <h1 className="mt-2 text-xl font-bold text-texto">Nova Matrícula</h1>
        </div>

        <Card>
          <CardBody>
            <p className="flex items-start gap-3 text-sm text-texto">
              <Lock size={20} className="mt-0.5 shrink-0 text-texto-suave" />
              {aviso}
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  const turmas = await prisma.turma.findMany({
    include: { curso: true },
    orderBy: [{ anoLetivo: "desc" }, { curso: { nome: "asc" } }, { anoCurricular: "asc" }],
  });

  const turmaOptions = turmas.map((turma) => ({ id: turma.id, label: turmaLabel(turma) }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/alunos" className="inline-flex items-center gap-1.5 text-sm text-texto hover:text-navy-700">
          <ArrowLeft size={16} />
          Voltar para Alunos
        </Link>
        <h1 className="mt-2 text-xl font-bold text-texto">Nova Matrícula</h1>
      </div>

      <NovoAlunoForm turmas={turmaOptions} anoDeReferencia={agora.getFullYear()} />
    </div>
  );
}
