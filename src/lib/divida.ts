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
