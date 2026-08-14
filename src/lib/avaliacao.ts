import type { Epoca } from "@/generated/prisma/client";

/**
 * Motor de avaliação (MD §4.1, §10). Pesos fixos por contrato — (P1+P2)/2 para dispensa,
 * (P1+P2+Exame)/3 para aprovação — não variam por cadeira, por isso ficam constantes aqui em vez
 * de campos de BD. Só a dispensa (permiteDispensa/notaMinimaDispensa) é configurável por cadeira
 * (§4.1.1); a nota positiva é a mesma para todos.
 */
export const NOTA_MINIMA_POSITIVA = 10;

export const EPOCA_ORDEM: Epoca[] = ["P1", "P2", "EXAME", "RECURSO", "EXAME_ESPECIAL"];

export const EPOCA_LABEL: Record<Epoca, string> = {
  P1: "1ª Prova (P1)",
  P2: "2ª Prova (P2)",
  EXAME: "Exame",
  RECURSO: "Recurso",
  EXAME_ESPECIAL: "Exame Especial",
};

export type EstadoAvaliacao =
  | "EM_CURSO"
  | "DISPENSADO"
  | "ADMITIDO_A_EXAME"
  | "EM_RECURSO"
  | "EM_EXAME_ESPECIAL"
  | "APROVADO"
  | "REPROVADO";

export const ESTADO_LABEL: Record<EstadoAvaliacao, string> = {
  EM_CURSO: "Em curso",
  DISPENSADO: "Dispensado",
  ADMITIDO_A_EXAME: "Admitido a exame",
  EM_RECURSO: "Em recurso",
  EM_EXAME_ESPECIAL: "Em exame especial",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
};

export interface NotasCadeira {
  p1: number | null;
  p2: number | null;
  exame: number | null;
  recurso: number | null;
  exameEspecial: number | null;
}

export interface RegrasCadeira {
  /** Valores congelados em InscricaoCadeira.*Aplicada — nunca os atuais da CadeiraCurricular. */
  permiteDispensa: boolean;
  notaMinimaDispensa: number;
}

export interface ResultadoAvaliacao {
  estado: EstadoAvaliacao;
  /** (P1+P2)/2 — null enquanto faltar P1 ou P2. */
  notaFrequencia: number | null;
  /** A nota "oficial" da cadeira no estado atual — null enquanto pendente (EM_CURSO/ADMITIDO/EM_RECURSO/EM_EXAME_ESPECIAL sem a respetiva nota lançada). */
  notaFinal: number | null;
  /** null enquanto o resultado não estiver decidido. */
  aprovado: boolean | null;
}

/**
 * Função pura única — não espalhar esta fórmula por componentes/páginas (era o bug antes da
 * Fase 6: duas cópias divergentes de um cálculo de "nota geral" sem relação com o MD §10).
 *
 * Cascata: sem P1 ou P2 → EM_CURSO. `permiteDispensa && frequencia>=notaMinimaDispensa` →
 * DISPENSADO (aprovado). Senão precisa de Exame: `(P1+P2+Exame)/3 >= 10` → APROVADO. Senão
 * Recurso, depois Exame Especial — cada um conta **isolado** (nunca combinado com P1/P2/Exame).
 * Reprovado só depois de esgotado o Exame Especial.
 */
export function calcularNotaFinal(notas: NotasCadeira, regras: RegrasCadeira): ResultadoAvaliacao {
  if (notas.p1 === null || notas.p2 === null) {
    return { estado: "EM_CURSO", notaFrequencia: null, notaFinal: null, aprovado: null };
  }

  const notaFrequencia = (notas.p1 + notas.p2) / 2;

  if (regras.permiteDispensa && notaFrequencia >= regras.notaMinimaDispensa) {
    return { estado: "DISPENSADO", notaFrequencia, notaFinal: notaFrequencia, aprovado: true };
  }

  if (notas.exame === null) {
    return { estado: "ADMITIDO_A_EXAME", notaFrequencia, notaFinal: null, aprovado: null };
  }
  const notaComExame = (notas.p1 + notas.p2 + notas.exame) / 3;
  if (notaComExame >= NOTA_MINIMA_POSITIVA) {
    return { estado: "APROVADO", notaFrequencia, notaFinal: notaComExame, aprovado: true };
  }

  if (notas.recurso === null) {
    return { estado: "EM_RECURSO", notaFrequencia, notaFinal: null, aprovado: null };
  }
  if (notas.recurso >= NOTA_MINIMA_POSITIVA) {
    return { estado: "APROVADO", notaFrequencia, notaFinal: notas.recurso, aprovado: true };
  }

  if (notas.exameEspecial === null) {
    return { estado: "EM_EXAME_ESPECIAL", notaFrequencia, notaFinal: null, aprovado: null };
  }
  if (notas.exameEspecial >= NOTA_MINIMA_POSITIVA) {
    return { estado: "APROVADO", notaFrequencia, notaFinal: notas.exameEspecial, aprovado: true };
  }
  return { estado: "REPROVADO", notaFrequencia, notaFinal: notas.exameEspecial, aprovado: false };
}

/** Mapeia as Notas de uma InscricaoCadeira (cada uma ligada a uma Avaliacao com época) para NotasCadeira. */
export function extrairNotasPorEpoca(notas: { valor: number; avaliacao: { epoca: Epoca } }[]): NotasCadeira {
  const porEpoca = new Map(notas.map((n) => [n.avaliacao.epoca, n.valor]));
  return {
    p1: porEpoca.get("P1") ?? null,
    p2: porEpoca.get("P2") ?? null,
    exame: porEpoca.get("EXAME") ?? null,
    recurso: porEpoca.get("RECURSO") ?? null,
    exameEspecial: porEpoca.get("EXAME_ESPECIAL") ?? null,
  };
}
