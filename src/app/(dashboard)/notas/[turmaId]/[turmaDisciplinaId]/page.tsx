import { auth } from "@/lib/auth";
import { TurmaGradebook } from "@/components/notas/TurmaGradebook";

interface NotasGradebookPageProps {
  params: Promise<{ turmaId: string; turmaDisciplinaId: string }>;
}

export default async function NotasGradebookPage({ params }: NotasGradebookPageProps) {
  const { turmaId, turmaDisciplinaId } = await params;
  const session = await auth();
  const editable = session?.user.role === "ADMIN" || session?.user.role === "SECRETARIA";

  return <TurmaGradebook turmaDisciplinaId={turmaDisciplinaId} backHref={`/notas/${turmaId}`} editable={editable} />;
}
