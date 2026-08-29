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
  // DAAC e ADMIN lançam notas sem restrições e ignoram prazos — ver podeLancarNota para a decisão
  // do cliente (2026-08-29) que abriu isto ao ADMIN.
  const editable = session.user.role === "DAAC" || session.user.role === "ADMIN";

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
