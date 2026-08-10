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
  const editable = session.user.role === "ADMIN";

  return <TurmaGradebook turmaDisciplinaId={turmaDisciplinaId} backHref={`/notas/${turmaId}`} editable={editable} />;
}
