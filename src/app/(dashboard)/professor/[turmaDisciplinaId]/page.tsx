import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TurmaGradebook } from "@/components/notas/TurmaGradebook";
import { getAgora } from "@/lib/tempo";

interface ProfessorGradebookPageProps {
  params: Promise<{ turmaDisciplinaId: string }>;
}

export default async function ProfessorGradebookPage({ params }: ProfessorGradebookPageProps) {
  const { turmaDisciplinaId } = await params;
  const session = await auth();
  if (!session?.user.professorId) redirect("/dashboard");

  const [turmaDisciplina, config] = await Promise.all([
    prisma.turmaDisciplina.findUnique({ where: { id: turmaDisciplinaId }, include: { turma: true } }),
    prisma.configuracaoAcademica.findUnique({ where: { id: "config" } }),
  ]);
  if (!turmaDisciplina || turmaDisciplina.professorId !== session.user.professorId) redirect("/professor");

  // Um ano letivo passado é registo histórico, e um semestre ainda não aberto pelo DAAC ainda não
  // começou — em ambos os casos só o DAAC (podeIgnorarPrazo, via /notas) edita; o professor pode
  // continuar a consultar, mas não a editar.
  const semestreAtual = config?.semestreAtual === 2 ? 2 : 1;
  const editable = turmaDisciplina.turma.anoLetivo === getAgora().getFullYear() && turmaDisciplina.semestre === semestreAtual;

  return <TurmaGradebook turmaDisciplinaId={turmaDisciplinaId} backHref="/professor" editable={editable} />;
}
