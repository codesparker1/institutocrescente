import "server-only";
import { prisma } from "@/lib/prisma";
import { anoLetivoCorrente } from "@/lib/academico";

/**
 * O ano letivo que os ecrãs de GESTÃO devem usar — §pedido do cliente 2026-09-06/07.
 *
 * `anoLetivoCorrente(agora, config)` responde a "que período está o SISTEMA a operar agora", e
 * devolve null de propósito no intervalo entre um ciclo e o seguinte. Isso é a resposta certa para
 * recusar uma operação fora de época, mas a resposta errada para "o que é que o DAAC pode preparar
 * agora": nesta instalação esse intervalo dura cerca de quatro meses (Junho a Outubro), TODOS os
 * anos, e durante ele o DAAC ficava sem Finalistas, sem o aviso de monografias pendentes e sem
 * Horário e Provas — exatamente na altura em que precisa de preparar o ano que vai começar.
 *
 * O recurso são os dados: `rolloverTurmas` cria as turmas do ano novo automaticamente assim que o
 * anterior acaba, sem depender de ninguém configurar nada. Por isso o maior `Turma.anoLetivo` já
 * existente é uma referência fiável de "o ano mais recente que o sistema conhece", mesmo quando o
 * sistema não consegue dizer "que ano é hoje".
 *
 * Devolve null só quando não há uma única turma na base de dados (instalação vazia).
 */
export async function anoLetivoDeReferencia(
  agora: Date,
  config: { anoLetivoInicio: Date | null; anoLetivoFim: Date | null } | null,
): Promise<number | null> {
  const corrente = anoLetivoCorrente(agora, config);
  if (corrente !== null) return corrente;
  const maisRecente = await prisma.turma.aggregate({ _max: { anoLetivo: true } });
  return maisRecente._max.anoLetivo ?? null;
}
