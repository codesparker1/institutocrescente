/**
 * Rematrícula e retenção (§4.2/Fase 8b). Não é promoção automática em lote — é a Secretaria que
 * aciona aluno a aluno, aluno a aluno, dentro da janela de matrícula. Esta é a decisão pura
 * (elegível para avançar de ano ou retido), separada da leitura/escrita à BD para poder ser
 * testada isoladamente, mesmo padrão de src/lib/avaliacao.ts e src/lib/divida.ts.
 */
import type { RegraRetencao } from "@/generated/prisma/client";

export type ResultadoRematricula = "AVANCA" | "RETIDO";

export interface DecisaoRematriculaInput {
  reprovacoes: number;
  limiteReprovacoes: number;
  anoCurricular: number;
}

export interface DecisaoRematricula {
  resultado: ResultadoRematricula;
  /** anoCurricular a aplicar ao aluno — igual ao atual quando RETIDO. */
  novoAnoCurricular: number;
}

/**
 * `reprovacoes <= limiteReprovacoes` → avança de ano; senão fica retido no mesmo ano.
 * Não decide o que fazer com as cadeiras já aprovadas de um retido — isso é `regraRetencao`,
 * aplicado por quem chama esta função ao escolher que tentativas de repetição criar.
 * Não trata conclusão de curso (anoCurricular já no último ano do curso) — fora de escopo,
 * a ação que usa isto falha ao não encontrar uma turma do "ano seguinte" e pede para a criar.
 */
export function decidirRematricula(input: DecisaoRematriculaInput): DecisaoRematricula {
  if (input.reprovacoes <= input.limiteReprovacoes) {
    return { resultado: "AVANCA", novoAnoCurricular: input.anoCurricular + 1 };
  }
  return { resultado: "RETIDO", novoAnoCurricular: input.anoCurricular };
}

/**
 * Só relevante quando RETIDO: além das reprovadas (que repetem sempre), a regra `ANO_INTEIRO`
 * também repete as já aprovadas/dispensadas; `SO_REPROVADAS` deixa-as definitivamente fechadas.
 */
export function cadeirasARepetir<T>(reprovadas: T[], aprovadasOuDispensadas: T[], regraRetencao: RegraRetencao): T[] {
  return regraRetencao === "ANO_INTEIRO" ? [...reprovadas, ...aprovadasOuDispensadas] : reprovadas;
}
