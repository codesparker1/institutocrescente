import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { after } from "next/server";
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
 * Os jobs abaixo são manutenção preguiçosa — gerar as propinas do mês, suspender quem não
 * rematriculou, alinhar as turmas com o plano. Nenhum deles produz o que o utilizador veio ver, mas
 * todos corriam `await` no layout partilhado, sem rede: bastava um deles falhar (um cold start do
 * Neon a exceder o tempo, o pool de ligações esgotado num pico) para TODAS as páginas rebentarem
 * para TODOS os utilizadores. Em produção isso aparece como o React #441 — um erro do servidor com
 * a mensagem escondida — sem nada no ecrã que ajude quem está a usar o sistema.
 *
 * Falhar aqui é aceitável porque todos são idempotentes e voltam a tentar no pedido seguinte: a
 * geração de propinas reclama o dia com um updateMany condicional, e as outras recalculam o
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

/**
 * Passo síncrono ("reclamar o dia") de garantirSuspensaoAutomatica/garantirCobrancasGeradas —
 * devolve o trabalho pesado por fazer, ou `null` se não há nada a fazer hoje ou se este pedido
 * perdeu a corrida para reclamar o turno. Falhar aqui é tratado como "nada a fazer", pela mesma
 * razão de correrManutencao: uma falha de rede não pode derrubar a página.
 */
async function prepararManutencao(etiqueta: string, fn: () => Promise<(() => Promise<void>) | null>): Promise<(() => Promise<void>) | null> {
  try {
    return await medirJobGarantir(etiqueta, fn);
  } catch (erro) {
    console.error(`[dashboard/layout] ${etiqueta} falhou a preparar — a página continua a renderizar.`, erro);
    return null;
  }
}

/** Executa o trabalho pesado já preparado, isolando a falha de um job da do seguinte. */
async function executarManutencao(etiqueta: string, trabalho: (() => Promise<void>) | null): Promise<void> {
  if (!trabalho) return;
  try {
    await trabalho();
  } catch (erro) {
    console.error(`[dashboard/layout] ${etiqueta} falhou — o próximo job de manutenção continua.`, erro);
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
  // TEM de terminar ANTES de garantirCobrancasGeradas: na virada do ano letivo, gerar propinas
  // antes de a suspensão fechar a matrícula cobrava mais um mês a quem já devia estar TRANCADO
  // (§reportado 2026-09-08 e 2026-08-23 — "propina fantasma" reaparecida).
  //
  // Só reordenar os `await` (a correção de 2026-08-23) NÃO chega: cada uma destas funções agendava
  // o trabalho pesado com o seu PRÓPRIO `after()`, e os `after()` do Next correm com concorrência
  // infinita — dois `after()` separados não têm ordem nenhuma entre si, só o passo síncrono de
  // reclamar o dia (abaixo) é que fica em ordem. Por isso as duas devolvem o trabalho por fazer em
  // vez de o agendarem sozinhas, e este layout compõe-nas num único `after()` sequencial.
  const trabalhoSuspensao = await prepararManutencao("garantirSuspensaoAutomatica", () => garantirSuspensaoAutomatica());
  // Geração preguiçosa das propinas/multas do mês, no primeiro acesso ao dashboard do dia (MD §2).
  const trabalhoCobrancas = await prepararManutencao("garantirCobrancasGeradas", () => garantirCobrancasGeradas());
  // (Não há job de 0 automático: desde §2026-09-02 os zeros por falta vêm só do fecho do semestre,
  // fecharSemestre — disparado por alterarSemestreAction, não por um prazo a expirar sozinho.)
  after(async () => {
    await executarManutencao("garantirSuspensaoAutomatica", trabalhoSuspensao);
    await executarManutencao("garantirCobrancasGeradas", trabalhoCobrancas);
  });
  // Rede de segurança: alinha as turmas do ano corrente com o plano curricular. O caminho normal é
  // imediato (createCadeiraCurricularAction propaga logo) — isto apanha o que ficou de fora.
  // Continua com o seu próprio after(): não tem o mesmo efeito financeiro/de acesso do par acima,
  // e corre de novo no acesso seguinte se calhar de ler as turmas antes do rollover as criar.
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
