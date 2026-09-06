import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { garantirCobrancasGeradas } from "@/lib/financeiro";
import { garantirSuspensaoAutomatica, garantirTurmasSincronizadasComPlano } from "@/lib/curriculo";
import { SIMULATION_MODE, getAgora } from "@/lib/tempo";
import { registarSimEventoFogoEForge, medirJobGarantir } from "@/lib/telemetria";
import { DashboardShell } from "@/components/layout/DashboardShell";

/**
 * Corre uma tarefa de manutenção sem deixar que ela derrube a página.
 *
 * Os três jobs abaixo são manutenção preguiçosa — gerar as propinas do mês, suspender quem não
 * rematriculou, alinhar as turmas com o plano. Nenhum deles produz o que o utilizador veio ver, mas
 * todos corriam `await` no layout partilhado, sem rede: bastava um deles falhar (um cold start do
 * Neon a exceder o tempo, o pool de ligações esgotado num pico) para TODAS as páginas rebentarem
 * para TODOS os utilizadores. Em produção isso aparece como o React #441 — um erro do servidor com
 * a mensagem escondida — sem nada no ecrã que ajude quem está a usar o sistema.
 *
 * Falhar aqui é aceitável porque os três são idempotentes e voltam a tentar no pedido seguinte: a
 * geração de propinas reclama o dia com um updateMany condicional, e as outras duas recalculam o
 * trabalho a partir do estado atual. O que não é aceitável é o aluno ficar sem o painel por causa
 * de uma tarefa de fundo. Fica registado no log do servidor, para não falhar em silêncio.
 */
async function correrManutencao(etiqueta: string, fn: () => Promise<void>): Promise<void> {
  try {
    await medirJobGarantir(etiqueta, fn);
  } catch (erro) {
    console.error(`[dashboard/layout] ${etiqueta} falhou — a página continua a renderizar.`, erro);
  }
}

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
  await correrManutencao("garantirSuspensaoAutomatica", () => garantirSuspensaoAutomatica());
  // Geração preguiçosa das propinas/multas do mês, no primeiro acesso ao dashboard do dia (MD §2).
  await correrManutencao("garantirCobrancasGeradas", () => garantirCobrancasGeradas());
  // (Não há job de 0 automático: desde §2026-09-02 os zeros por falta vêm só do fecho do semestre,
  // fecharSemestre — disparado por alterarSemestreAction, não por um prazo a expirar sozinho.)
  // Rede de segurança: alinha as turmas do ano corrente com o plano curricular. O caminho normal é
  // imediato (createCadeiraCurricularAction propaga logo) — isto apanha o que ficou de fora.
  // Depois do rollover, para as turmas que ele acabou de criar entrarem já sincronizadas.
  await correrManutencao("garantirTurmasSincronizadasComPlano", () => garantirTurmasSincronizadasComPlano());

  // "Finalista" só aparece a quem tem monografia (§2026-09-04). A query corre só para alunos:
  // os outros papéis não têm o item no menu de qualquer forma, e não vale a pena cobrar-lhes uma
  // ida à base em cada navegação.
  const temMonografia =
    session.user.role === "ALUNO" && session.user.alunoId
      ? (await prisma.inscricaoCadeira.count({
          where: { alunoId: session.user.alunoId, eMonografiaAplicada: true },
        })) > 0
      : false;

  return (
    <DashboardShell
      role={session.user.role}
      name={session.user.name ?? session.user.email ?? "Utilizador"}
      dataSistema={agora}
      simulationMode={SIMULATION_MODE}
      temMonografia={temMonografia}
    >
      {children}
    </DashboardShell>
  );
}
