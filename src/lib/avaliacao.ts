import type { Epoca } from "@/generated/prisma/client";

/**
 * Motor de avaliação (MD §4.1, §10). Pesos fixos por contrato — (P1+P2)/2 para dispensa e para a
 * média de frequência, (média+Exame)/2 para aprovação por exame (revisto 2026-08-16: o exame conta
 * metade da nota final, não um terço) — não variam por cadeira, por isso ficam constantes aqui em
 * vez de campos de BD. Só a dispensa (permiteDispensa/notaMinimaDispensa) é configurável por
 * cadeira (§4.1.1); a nota positiva é a mesma para todos.
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

export interface DiasPrazoConfig {
  diasPrazoP1: number;
  diasPrazoP2: number;
  diasPrazoExame: number;
  diasPrazoRecurso: number;
  diasPrazoExameEspecial: number;
}

/** Dias corridos após a prova em que o prazo de lançamento fecha, por época — configurado pelo
 * DAAC em Configuração Académica. Congelado na Avaliacao no momento em que é agendada/criada. */
export function diasPrazoParaEpoca(config: DiasPrazoConfig, epoca: Epoca): number {
  switch (epoca) {
    case "P1":
      return config.diasPrazoP1;
    case "P2":
      return config.diasPrazoP2;
    case "EXAME":
      return config.diasPrazoExame;
    case "RECURSO":
      return config.diasPrazoRecurso;
    case "EXAME_ESPECIAL":
      return config.diasPrazoExameEspecial;
  }
}

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
  /** Notas de épocas posteriores ao ponto onde a cascata realmente terminou — sobraram de antes de
   * uma correção a montante (ex.: o Exame estava errado, dava Recurso; corrigido para cima, o
   * Exame já aprova sozinho e o Recurso lançado entretanto deixa de fazer sentido). A action de
   * gravação apaga estas notas; aqui só se deteta, de forma pura, quais são. */
  epocasOrfas: Epoca[];
}

export const EPOCA_PARA_CHAVE_NOTAS: Record<Epoca, keyof NotasCadeira> = {
  P1: "p1",
  P2: "p2",
  EXAME: "exame",
  RECURSO: "recurso",
  EXAME_ESPECIAL: "exameEspecial",
};

/**
 * Função pura única — não espalhar esta fórmula por componentes/páginas (era o bug antes da
 * Fase 6: duas cópias divergentes de um cálculo de "nota geral" sem relação com o MD §10).
 *
 * Cascata: sem P1 ou P2 → EM_CURSO. `permiteDispensa && frequencia>=notaMinimaDispensa` →
 * DISPENSADO (aprovado). Senão precisa de Exame: `(frequencia+Exame)/2 >= 10` → APROVADO. Senão
 * Recurso, depois Exame Especial — cada um conta **isolado** (nunca combinado com P1/P2/Exame).
 * Reprovado só depois de esgotado o Exame Especial.
 */
export function calcularNotaFinal(notas: NotasCadeira, regras: RegrasCadeira): ResultadoAvaliacao {
  function orfasApartirDe(epoca: Epoca): Epoca[] {
    return EPOCA_ORDEM.slice(EPOCA_ORDEM.indexOf(epoca)).filter((e) => notas[EPOCA_PARA_CHAVE_NOTAS[e]] !== null);
  }

  if (notas.p1 === null || notas.p2 === null) {
    return { estado: "EM_CURSO", notaFrequencia: null, notaFinal: null, aprovado: null, epocasOrfas: [] };
  }

  const notaFrequencia = (notas.p1 + notas.p2) / 2;

  if (regras.permiteDispensa && notaFrequencia >= regras.notaMinimaDispensa) {
    return { estado: "DISPENSADO", notaFrequencia, notaFinal: notaFrequencia, aprovado: true, epocasOrfas: orfasApartirDe("EXAME") };
  }

  if (notas.exame === null) {
    return { estado: "ADMITIDO_A_EXAME", notaFrequencia, notaFinal: null, aprovado: null, epocasOrfas: [] };
  }
  const notaComExame = (notaFrequencia + notas.exame) / 2;
  if (notaComExame >= NOTA_MINIMA_POSITIVA) {
    return { estado: "APROVADO", notaFrequencia, notaFinal: notaComExame, aprovado: true, epocasOrfas: orfasApartirDe("RECURSO") };
  }

  if (notas.recurso === null) {
    return { estado: "EM_RECURSO", notaFrequencia, notaFinal: null, aprovado: null, epocasOrfas: [] };
  }
  if (notas.recurso >= NOTA_MINIMA_POSITIVA) {
    return { estado: "APROVADO", notaFrequencia, notaFinal: notas.recurso, aprovado: true, epocasOrfas: orfasApartirDe("EXAME_ESPECIAL") };
  }

  if (notas.exameEspecial === null) {
    return { estado: "EM_EXAME_ESPECIAL", notaFrequencia, notaFinal: null, aprovado: null, epocasOrfas: [] };
  }
  if (notas.exameEspecial >= NOTA_MINIMA_POSITIVA) {
    return { estado: "APROVADO", notaFrequencia, notaFinal: notas.exameEspecial, aprovado: true, epocasOrfas: [] };
  }
  return { estado: "REPROVADO", notaFrequencia, notaFinal: notas.exameEspecial, aprovado: false, epocasOrfas: [] };
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

/** Para cada estado pendente, a época seguinte que ainda falta — define até onde a cascata mostra "por vir". */
const ESTADO_PROXIMA_EPOCA: Partial<Record<EstadoAvaliacao, Epoca>> = {
  EM_CURSO: "P2",
  ADMITIDO_A_EXAME: "EXAME",
  EM_RECURSO: "RECURSO",
  EM_EXAME_ESPECIAL: "EXAME_ESPECIAL",
};

/**
 * Quais épocas mostrar ao próprio aluno (dashboard, horário) — nunca a lista bruta de `Avaliacao`
 * agendadas para a turma-disciplina, que inclui Recurso/Exame Especial mesmo para quem já passou
 * ou foi dispensado. Regra: épocas já com nota lançada são facto histórico, mostram-se sempre;
 * além disso, se o estado ainda estiver pendente, mostra-se também a época seguinte da cascata
 * (mesmo sem nota — é a prova que falta). Estados terminais (DISPENSADO/APROVADO/REPROVADO) não
 * têm "seguinte" — só o que já foi lançado.
 */
export function epocasVisiveis(notas: NotasCadeira, estado: EstadoAvaliacao): Epoca[] {
  const comNota = EPOCA_ORDEM.filter((epoca) => notas[EPOCA_PARA_CHAVE_NOTAS[epoca]] !== null);
  const proxima = ESTADO_PROXIMA_EPOCA[estado];
  if (!proxima) return comNota;
  return EPOCA_ORDEM.slice(0, EPOCA_ORDEM.indexOf(proxima) + 1);
}

/**
 * A época exata em que o aluno está parado à espera de nota — usada para (a) só imprimir a lista
 * de presença de quem realmente vai a essa prova, e (b) atribuir 0 automático quando o prazo dessa
 * época expira sem nota lançada (§4.3). Diferente de ESTADO_PROXIMA_EPOCA/epocasVisiveis: aquela
 * mostra P1 *e* P2 como "por vir" mesmo só faltando o P1 (é uma vista de intervalo, para o aluno
 * ver o que aí vem); esta devolve um único ponto exato — P1 se for esse que falta, nunca P2 cedo
 * demais. Estados terminais (DISPENSADO/APROVADO/REPROVADO) devolvem null — não há nada pendente.
 */
export function proximaEpocaPendente(notas: NotasCadeira, estado: EstadoAvaliacao): Epoca | null {
  if (estado === "EM_CURSO" && notas.p1 === null) return "P1";
  return ESTADO_PROXIMA_EPOCA[estado] ?? null;
}
