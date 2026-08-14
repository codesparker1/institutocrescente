/**
 * Predicado de dívida (MD §2/§6) — puro, sem acesso a BD, para poder ser testado isoladamente.
 * Não recebe nem consulta a categoria do estudante: bolseiro INAGBE, comparticipada e normal
 * vencem da mesma forma, sem exceção (confirmado com o diretor, ver Fase 2 do plano).
 */
export function ehVencidoAlemDaTolerancia(dataVencimento: Date, toleranciaDias: number, agora: Date): boolean {
  const limite = new Date(dataVencimento);
  limite.setDate(limite.getDate() + toleranciaDias);
  return agora > limite;
}
