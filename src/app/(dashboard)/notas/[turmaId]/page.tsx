import { auth } from "@/lib/auth";
import { TurmaGradebook } from "@/components/notas/TurmaGradebook";

interface NotasTurmaPageProps {
  params: Promise<{ turmaId: string }>;
}

export default async function NotasTurmaPage({ params }: NotasTurmaPageProps) {
  const { turmaId } = await params;
  const session = await auth();
  const editable = session?.user.role === "ADMIN" || session?.user.role === "SECRETARIA";

  return <TurmaGradebook turmaId={turmaId} backHref="/notas" editable={editable} />;
}
