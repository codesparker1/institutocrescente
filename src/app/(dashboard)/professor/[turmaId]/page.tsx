import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TurmaGradebook } from "@/components/notas/TurmaGradebook";

interface ProfessorTurmaPageProps {
  params: Promise<{ turmaId: string }>;
}

export default async function ProfessorTurmaPage({ params }: ProfessorTurmaPageProps) {
  const { turmaId } = await params;
  const session = await auth();
  if (!session?.user.professorId) redirect("/dashboard");

  const turma = await prisma.turma.findUnique({ where: { id: turmaId } });
  if (!turma || turma.professorId !== session.user.professorId) redirect("/professor");

  return <TurmaGradebook turmaId={turmaId} backHref="/professor" editable />;
}
