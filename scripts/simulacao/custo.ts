/**
 * Estimativa OFFLINE de custo Neon/Vercel a partir das métricas que a própria corrida já
 * recolhe — não liga a nenhuma API de faturação (sem tokens, sem tocar nas contas reais). Os
 * preços abaixo são valores de partida, não a verdade: confirma o teu plano atual em
 * https://neon.tech/pricing e https://vercel.com/pricing antes de confiar num número daqui para
 * decisões reais. O valor disto é comparar corridas entre si (ficou mais caro depois desta
 * mudança? fica muito mais caro num dia de pico?), não produzir uma fatura exata.
 */

export const PRECOS = {
  /** Neon Launch, compute ativo — confirma no teu plano real. */
  neonComputeUSDPorHora: 0.14,
  /** Vercel Pro, Function Duration (GB-segundos) — confirma no teu plano real. */
  vercelFunctionUSDPorGBSegundo: 0.000018,
  /** Memória assumida por invocação de function — ajusta ao que a Vercel reporta no teu projeto. */
  vercelMemoriaGB: 0.5,
  /** Só para dares a volta ao número em Kz sem teres de converter à mão. */
  usdParaAoa: 950,
};

export interface AmostraPedido {
  duracaoMs: number;
}

export interface MetricasCusto {
  /** Duração total da corrida — proxy do tempo em que o compute Neon esteve ativo (scale-to-zero à parte). */
  duracaoTotalMs: number;
  pedidos: AmostraPedido[];
}

export interface EstimativaCusto {
  neonUSD: number;
  vercelUSD: number;
  totalUSD: number;
  totalAOA: number;
  vercelGBSegundos: number;
  totalPedidos: number;
}

export function estimarCusto(metricas: MetricasCusto, precos = PRECOS): EstimativaCusto {
  const neonUSD = (metricas.duracaoTotalMs / (60 * 60 * 1000)) * precos.neonComputeUSDPorHora;

  const vercelGBSegundos = metricas.pedidos.reduce((soma, p) => soma + (p.duracaoMs / 1000) * precos.vercelMemoriaGB, 0);
  const vercelUSD = vercelGBSegundos * precos.vercelFunctionUSDPorGBSegundo;

  const totalUSD = neonUSD + vercelUSD;
  return {
    neonUSD,
    vercelUSD,
    totalUSD,
    totalAOA: totalUSD * precos.usdParaAoa,
    vercelGBSegundos,
    totalPedidos: metricas.pedidos.length,
  };
}

/** Extrapola "se esta carga se repetisse com esta frequência" — ex. multiplicadorMensal=30 para simular um mês de dias iguais a este. */
export function projetar(estimativa: EstimativaCusto, multiplicador: number): EstimativaCusto {
  return {
    neonUSD: estimativa.neonUSD * multiplicador,
    vercelUSD: estimativa.vercelUSD * multiplicador,
    totalUSD: estimativa.totalUSD * multiplicador,
    totalAOA: estimativa.totalAOA * multiplicador,
    vercelGBSegundos: estimativa.vercelGBSegundos * multiplicador,
    totalPedidos: estimativa.totalPedidos * multiplicador,
  };
}
