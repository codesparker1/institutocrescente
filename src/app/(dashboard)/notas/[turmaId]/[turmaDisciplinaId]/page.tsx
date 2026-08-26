import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { TurmaGradebook } from "@/components/notas/TurmaGradebook";

interface NotasGradebookPageProps {
  params: Promise<{ turmaId: string; turmaDisciplinaId: string }>;
}

export default async function NotasGradebookPage({ params }: NotasGradebookPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "SECRETARIA") redirect("/dashboard");

  const { turmaId, turmaDisciplinaId } = await params;
  // Só o DAAC lança notas sem restrições aqui — ADMIN é read-only sobre dados académicos (MD §3).
  const editable = session.user.role === "DAAC";

  return (
    <TurmaGradebook
      turmaDisciplinaId={turmaDisciplinaId}
      backHref={`/notas/${turmaId}`}
      editable={editable}
      podeIgnorarPrazo={editable}
      restringirAoProfessorId={session.user.role === "PROFESSOR" ? session.user.professorId : null}
    />
  );
}
