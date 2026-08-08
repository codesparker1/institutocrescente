import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TurmaGradebook } from "@/components/notas/TurmaGradebook";

interface ProfessorGradebookPageProps {
  params: Promise<{ turmaDisciplinaId: string }>;
}

export default async function ProfessorGradebookPage({ params }: ProfessorGradebookPageProps) {
  const { turmaDisciplinaId } = await params;
  const session = await auth();
  if (!session?.user.professorId) redirect("/dashboard");

  const turmaDisciplina = await prisma.turmaDisciplina.findUnique({ where: { id: turmaDisciplinaId } });
  if (!turmaDisciplina || turmaDisciplina.professorId !== session.user.professorId) redirect("/professor");

  return <TurmaGradebook turmaDisciplinaId={turmaDisciplinaId} backHref="/professor" editable />;
}
