import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminDashboard } from "@/components/dashboard/AdminDashboard";
import { AlunoDashboard } from "@/components/dashboard/AlunoDashboard";
import { ProfessorDashboard } from "@/components/dashboard/ProfessorDashboard";
import { SecretariaDashboard } from "@/components/dashboard/SecretariaDashboard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role === "PROFESSOR") {
    if (!session.user.professorId) redirect("/login");
    return <ProfessorDashboard professorId={session.user.professorId} />;
  }

  if (session.user.role === "ALUNO") {
    if (!session.user.alunoId) redirect("/login");
    return <AlunoDashboard alunoId={session.user.alunoId} />;
  }

  if (session.user.role === "SECRETARIA") {
    return <SecretariaDashboard nome={session.user.name ?? "Utilizador"} email={session.user.email ?? "—"} />;
  }

  return (
    <AdminDashboard
      nome={session.user.name ?? "Utilizador"}
      email={session.user.email ?? "—"}
      role={session.user.role}
    />
  );
}
