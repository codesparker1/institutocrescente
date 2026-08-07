import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-navy-50/40">
      <Sidebar role={session.user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar name={session.user.name ?? session.user.email ?? "Utilizador"} role={session.user.role} />
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
