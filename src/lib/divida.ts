/**
 * Predicado de dívida (MD §2/§6) — puro, sem acesso a BD, para poder ser testado isoladamente.
 * Não recebe nem consulta a categoria do estudante: bolseiro INAGBE, comparticipada e normal
 * vencem da mesma forma, sem exceção (confirmado com o diretor, ver Fase 2 do plano).
 *
 * "Tolerância 0 dias" (MD §2) significa que o próprio dia de vencimento ainda é válido para pagar
 * — só no dia seguinte é que passa a estar em atraso. `dataVencimento` é sempre meia-noite do dia
 * limite (ver garantirCobrancasGeradas), por isso comparar "agora > dataVencimento" fazia o aluno
 * vencer já às 00:01 do próprio dia — a multa disparava horas antes de o dia sequer acabar.
 * O limite real é meia-noite do dia SEGUINTE ao vencimento (mais a tolerância).
 */
export function ehVencidoAlemDaTolerancia(dataVencimento: Date, toleranciaDias: number, agora: Date): boolean {
  const limite = new Date(dataVencimento.getFullYear(), dataVencimento.getMonth(), dataVencimento.getDate() + toleranciaDias + 1);
  return agora >= limite;
}

/**
 * O mês de `agora` faz parte do ano letivo configurado? Fora dele não há propina a cobrar — a
 * geração diária (garantirCobrancasGeradas) olhava só ao mês do relógio e cobrava agosto com o ano
 * letivo a começar em outubro (§bug encontrado 2026-08-28).
 *
 * Compara pelo MÊS, não pelo dia: quem se matricula a meio de outubro paga outubro inteiro, e o
 * último mês do ciclo conta por inteiro também — é assim que gerarPropinasAnoLetivo monta o ciclo,
 * e as duas têm de concordar, senão a geração diária cria meses que a do ano letivo não criaria.
 *
 * Sem ano letivo configurado devolve true: é o estado inicial do sistema, e aí a cobrança mensal é
 * o único mecanismo que existe — bloqueá-la deixaria a instituição sem receita nenhuma.
 */
export function mesDentroDoAnoLetivo(
  agora: Date,
  config: { anoLetivoInicio: Date | null; anoLetivoFim: Date | null } | null,
): boolean {
  if (!config?.anoLetivoInicio || !config.anoLetivoFim) return true;
  const mesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime();
  const primeiroMes = new Date(config.anoLetivoInicio.getFullYear(), config.anoLetivoInicio.getMonth(), 1).getTime();
  const ultimoMes = new Date(config.anoLetivoFim.getFullYear(), config.anoLetivoFim.getMonth(), 1).getTime();
  return mesAtual >= primeiroMes && mesAtual <= ultimoMes;
}
