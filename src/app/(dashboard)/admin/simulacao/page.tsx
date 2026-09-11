import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui/Table";
import { raiaDoPapel } from "@/lib/simulacao";
import { PainelSimulacao, type CorridaResumo, type EventoPainel } from "./PainelSimulacao";

/** Teto de eventos por corrida. Uma corrida de ano inteiro passa bem dos 2000; o painel mostra os
 *  mais recentes, que é o que interessa a quem está a ver correr. O relatório completo continua a
 *  ser o `relatorio.json` da corrida, no disco. */
const MAX_EVENTOS = 2000;

/** Lê um campo de string do Json `detalhes` sem confiar na forma do que lá está gravado. */
function campo(detalhes: unknown, chave: string): string | null {
  if (!detalhes || typeof detalhes !== "object" || Array.isArray(detalhes)) return null;
  const valor = (detalhes as Record<string, unknown>)[chave];
  return typeof valor === "string" ? valor : null;
}

interface SimulacaoPageProps {
  searchParams: Promise<{ corrida?: string }>;
}

/**
 * Sala de Comando — a corrida de simulação vista como fluxo entre papéis (§pedido do cliente
 * 2026-09-11), em vez de um relatório de texto lido depois de tudo acabar.
 *
 * ADMIN e DEV apenas: é instrumentação, não gestão académica. O DAAC entra em quase todo o /admin
 * (ver middleware.ts) mas não aqui — telemetria da simulação não lhe diz respeito, e a lista de
 * corridas revelaria nomes e ids de alunos fora de qualquer contexto de trabalho dele.
 */
export default async function SimulacaoPage({ searchParams }: SimulacaoPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "DEV") redirect("/dashboard");

  const { corrida } = await searchParams;

  // As corridas que existem, da mais recente para a mais antiga. Os eventos antigos (gravados
  // antes de SimEvento ter runId) ficam de fora: sem corrida a que pertencer, não há painel que
  // os saiba enquadrar.
  const grupos = await prisma.simEvento.groupBy({
    by: ["runId"],
    where: { runId: { not: null } },
    _count: { _all: true },
    _max: { dataReal: true },
    _min: { dataReal: true },
    orderBy: { _max: { dataReal: "desc" } },
    take: 25,
  });

  const corridas: CorridaResumo[] = grupos.map((g) => ({
    runId: g.runId!,
    eventos: g._count._all,
    inicio: (g._min.dataReal ?? new Date()).toISOString(),
    fim: (g._max.dataReal ?? new Date()).toISOString(),
  }));

  const runIdAtual = corrida && corridas.some((c) => c.runId === corrida) ? corrida : (corridas[0]?.runId ?? null);

  const linhas = runIdAtual
    ? await prisma.simEvento.findMany({
        where: { runId: runIdAtual },
        orderBy: { dataReal: "desc" },
        take: MAX_EVENTOS,
        select: {
          id: true,
          tipo: true,
          etiqueta: true,
          userRole: true,
          entidade: true,
          escrita: true,
          dataSimulada: true,
          dataReal: true,
          duracaoMs: true,
          detalhes: true,
        },
      })
    : [];

  // Lidos do mais recente (para o `take` apanhar o fim da corrida) e revertidos aqui: o painel
  // precisa deles em ordem cronológica, que é a ordem em que as setas fazem sentido.
  const eventos: EventoPainel[] = linhas.reverse().map((e) => ({
    id: e.id,
    raia: raiaDoPapel(e.userRole),
    tipo: e.tipo,
    acao: e.etiqueta,
    papel: campo(e.detalhes, "papel"),
    rota: campo(e.detalhes, "rota"),
    anomalia: campo(e.detalhes, "anomalia"),
    entidade: e.entidade,
    escrita: e.escrita,
    dataSimulada: e.dataSimulada.toISOString(),
    dataReal: e.dataReal.toISOString(),
    duracaoMs: e.duracaoMs,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-texto">Sala de Comando</h1>
        <p className="text-sm text-texto-suave">
          Uma corrida de simulação vista como fluxo entre papéis. As setas ligam eventos de raias
          diferentes que tocaram a mesma entidade — saem dos dados, não de causalidade declarada.
        </p>
      </div>

      {corridas.length === 0 ? (
        <EmptyState message="Nenhuma corrida registada ainda. Corra uma simulação (npx tsx scripts/simulacao/run-pequeno.ts) para a ver aqui." />
      ) : (
        <PainelSimulacao corridas={corridas} runIdAtual={runIdAtual!} eventos={eventos} />
      )}
    </div>
  );
}
