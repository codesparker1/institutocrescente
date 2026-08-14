import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { garantirCobrancasGeradas } from "@/lib/financeiro";
import { garantirSuspensaoAutomatica } from "@/lib/curriculo";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Geração preguiçosa das propinas/multas do mês, no primeiro acesso ao dashboard do dia (MD §2).
  await garantirCobrancasGeradas();
  // Suspende quem não rematriculou dentro da janela, no primeiro acesso do dia (§4.2/Fase 8b).
  await garantirSuspensaoAutomatica();

  return (
    <DashboardShell role={session.user.role} name={session.user.name ?? session.user.email ?? "Utilizador"}>
      {children}
    </DashboardShell>
  );
}
