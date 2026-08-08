import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminDashboard } from "@/components/dashboard/AdminDashboard";
import { AlunoDashboard } from "@/components/dashboard/AlunoDashboard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role === "PROFESSOR") redirect("/professor");

  if (session.user.role === "ALUNO") {
    if (!session.user.alunoId) redirect("/login");
    return <AlunoDashboard alunoId={session.user.alunoId} />;
  }

  return <AdminDashboard />;
}
