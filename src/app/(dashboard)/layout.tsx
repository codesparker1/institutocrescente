import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { garantirCobrancasGeradas } from "@/lib/financeiro";
import { garantirSuspensaoAutomatica, garantirTurmasSincronizadasComPlano } from "@/lib/curriculo";
import { garantirNotasAutomaticasPorFalta } from "@/lib/notas-automaticas";
import { SIMULATION_MODE, getAgora } from "@/lib/tempo";
import { registarSimEventoFogoEForge, medirJobGarantir } from "@/lib/telemetria";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Data que o sistema considera corrente — a simulada sob SIMULATION_MODE, a real fora dela.
  // Mostrada no Topbar para se poder confirmar de relance que o relógio simulado está a pegar.
  const agora = await getAgora();

  // Telemetria da simulação: cada acesso ao dashboard é um ponto de dados (papel, rota de origem,
  // offset do relógio). Fire-and-forget — nunca atrasa o render.
  if (SIMULATION_MODE) {
    const headerList = await headers();
    registarSimEventoFogoEForge({
      tipo: "ACESSO_DASHBOARD",
      dataSimulada: agora,
      etiqueta: headerList.get("x-invoke-path") ?? headerList.get("referer") ?? "/dashboard",
      userId: session.user.id,
      userRole: session.user.role,
    });
  }

  // Suspende quem não rematriculou dentro da janela, no primeiro acesso do dia (§4.2/Fase 8b).
  // TEM de correr ANTES de garantirCobrancasGeradas: na virada do ano letivo, gerar propinas
  // antes de suspender cobrava mais um mês de alunos que já deviam estar TRANCADO (achado em
  // teste com o relógio simulado — salto de vários meses de uma vez criava PROPINA do mês
  // corrente para matrículas que a suspensão logo a seguir fechava).
  await medirJobGarantir("garantirSuspensaoAutomatica", () => garantirSuspensaoAutomatica());
  // Geração preguiçosa das propinas/multas do mês, no primeiro acesso ao dashboard do dia (MD §2).
  await medirJobGarantir("garantirCobrancasGeradas", () => garantirCobrancasGeradas());
  // Atribui 0 automático a quem devia ter feito uma época e o prazo passou sem nota (§4.3).
  await medirJobGarantir("garantirNotasAutomaticasPorFalta", () => garantirNotasAutomaticasPorFalta());
  // Rede de segurança: alinha as turmas do ano corrente com o plano curricular. O caminho normal é
  // imediato (createCadeiraCurricularAction propaga logo) — isto apanha o que ficou de fora.
  // Depois do rollover, para as turmas que ele acabou de criar entrarem já sincronizadas.
  await medirJobGarantir("garantirTurmasSincronizadasComPlano", () => garantirTurmasSincronizadasComPlano());

  return (
    <DashboardShell
      role={session.user.role}
      name={session.user.name ?? session.user.email ?? "Utilizador"}
      dataSistema={agora}
      simulationMode={SIMULATION_MODE}
    >
      {children}
    </DashboardShell>
  );
}
