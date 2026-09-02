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

/**
 * A prova já ficou para trás? Compara por DIA, pela mesma razão que motivoLancamentoFechado: a data
 * agendada é meia-noite do dia da prova, por isso `avaliacao.data < agora` dava "já passou" logo à
 * primeira hora da manhã do próprio dia — e o professor perdia a lista de presença justamente no dia
 * em que precisava dela para a sala (§pedido do cliente 2026-08-31).
 *
 * No dia da prova devolve false: só depois de o dia acabar é que a prova conta como dada.
 */
export function provaJaPassou(dataProva: Date, agora: Date): boolean {
  const diaDaProva = new Date(dataProva.getFullYear(), dataProva.getMonth(), dataProva.getDate());
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return hoje > diaDaProva;
}

/** Porque é que o lançamento de nota está fechado — ou null se estiver aberto. */
export type MotivoLancamentoFechado = "PROVA_POR_REALIZAR" | "LANCAMENTO_FECHADO";

/**
 * A janela em que o PROFESSOR pode lançar a nota. Duas condições, ambas necessárias:
 *
 * 1. LANCAMENTO_FECHADO — o DAAC/ADMIN tem de ter aberto a janela global
 *    (ConfiguracaoAcademica.lancamentoNotasAberto). §decisão do cliente 2026-09-02: voltou-se ao
 *    sistema manual, "onde se clica para poder permitir os professores introduzir as notas".
 *    Substitui o antigo PRAZO_EXPIRADO, que fechava sozinho N dias depois da prova.
 * 2. PROVA_POR_REALIZAR — a prova tem de já ter acontecido. Não veio abaixo com a mudança acima:
 *    continua a não fazer sentido lançar a nota de uma prova que ainda não se deu (§pedido do
 *    cliente 2026-08-28), por muito aberta que a janela esteja.
 *
 * A janela global é verificada PRIMEIRO: com ela fechada, dizer "a prova ainda não se realizou"
 * mandaria o professor esperar por uma data que não ia resolver nada.
 *
 * Abre no DIA da prova, não à hora: a hora agendada serve para o aluno saber quando comparecer, e
 * exigi-la aqui fechava o campo ao professor que corrige e lança logo a seguir, sempre que a hora
 * estivesse mal preenchida. O dia é a fronteira que toda a gente entende.
 *
 * O DAAC/ADMIN não passa por aqui (ver podeIgnorarJanela/podeLancarNota): ignora ambos os limites —
 * é o mecanismo de correção fora da janela, o mesmo de sempre.
 */
export function motivoLancamentoFechado(
  avaliacao: { data: Date },
  agora: Date,
  lancamentoAberto: boolean,
): MotivoLancamentoFechado | null {
  if (!lancamentoAberto) return "LANCAMENTO_FECHADO";
  const diaDaProva = new Date(avaliacao.data.getFullYear(), avaliacao.data.getMonth(), avaliacao.data.getDate());
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return hoje < diaDaProva ? "PROVA_POR_REALIZAR" : null;
}

/**
 * O mesmo, para uma época que ainda não tem Avaliacao formal (Recurso/Exame Especial por agendar).
 * Sem data de prova não há PROVA_POR_REALIZAR a validar, mas a janela global continua a valer.
 *
 * Existe para as duas leituras não divergirem: a UI (TurmaGradebook) e a barreira real
 * (lancarNotasEmLoteAction) faziam esta mesma decisão em sítios diferentes, e uma cópia que se
 * desatualizasse deixaria o campo aberto no ecrã e fechado no servidor — ou o contrário.
 */
export function motivoLancamentoFechadoOuAusente(
  avaliacao: { data: Date } | null | undefined,
  agora: Date,
  lancamentoAberto: boolean,
): MotivoLancamentoFechado | null {
  if (!avaliacao) return lancamentoAberto ? null : "LANCAMENTO_FECHADO";
  return motivoLancamentoFechado(avaliacao, agora, lancamentoAberto);
}

/** Porque é que uma época não pode ser agendada agora — ou null se puder. */
export type MotivoAgendamentoInvalido =
  | { tipo: "JA_AGENDADA" }
  | { tipo: "FALTA_ANTERIOR"; anterior: Epoca }
  | { tipo: "ANTES_DA_ANTERIOR"; anterior: Epoca; dataAnterior: Date };

/**
 * A ordem das épocas não é decorativa: P2 depois de P1, Exame depois das duas, Recurso depois do
 * Exame, Especial depois do Recurso — é a mesma cascata que calcularNotaFinal percorre. Agendar um
 * P2 sem P1, ou um Exame para antes do P2, produzia uma turma cuja pauta nunca podia fechar
 * (§pedido do cliente 2026-08-28: "podes marcar P2 mesmo não tendo P1").
 *
 * Só valida a ordem entre épocas — a data em si (dentro do ano letivo, dia útil) é outro assunto.
 * Recebe as avaliações JÁ existentes desta TurmaDisciplina; devolve null quando o agendamento é
 * coerente.
 */
export function motivoAgendamentoInvalido(
  epoca: Epoca,
  data: Date,
  existentes: { epoca: Epoca; data: Date }[],
): MotivoAgendamentoInvalido | null {
  const porEpoca = new Map(existentes.map((a) => [a.epoca, a.data]));
  if (porEpoca.has(epoca)) return { tipo: "JA_AGENDADA" };

  const indice = EPOCA_ORDEM.indexOf(epoca);
  if (indice <= 0) return null;
  const anterior = EPOCA_ORDEM[indice - 1];
  const dataAnterior = porEpoca.get(anterior);
  if (!dataAnterior) return { tipo: "FALTA_ANTERIOR", anterior };
  if (data < dataAnterior) return { tipo: "ANTES_DA_ANTERIOR", anterior, dataAnterior };
  return null;
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

/** Estados em que a cadeira ainda espera por uma prova que aconteça. */
const ESTADOS_PENDENTES: EstadoAvaliacao[] = ["EM_CURSO", "ADMITIDO_A_EXAME", "EM_RECURSO", "EM_EXAME_ESPECIAL"];

/**
 * Como mostrar o estado de uma cadeira, tendo em conta se o semestre dela já fechou.
 *
 * O fecho de semestre só atribui 0 a épocas que foram AGENDADAS (§decisão do cliente 2026-09-01:
 * "atribui só notas a que foi agendado") — não inventa provas que nunca existiram. Consequência: uma
 * cadeira cujo Recurso nunca foi marcado fica parada em EM_RECURSO, e num semestre já fechado esse
 * rótulo mente, porque não vai haver recurso nenhum.
 *
 * O estado calculado não muda — descreve bem onde a cascata parou, e é o que a gestão precisa de
 * saber para agendar a prova em falta. Muda só a leitura: num semestre fechado, "Em recurso" passa a
 * "Por concluir", que é a verdade.
 */
export function rotuloEstado(estado: EstadoAvaliacao, semestreFechado: boolean): string {
  if (semestreFechado && ESTADOS_PENDENTES.includes(estado)) return "Por concluir";
  return ESTADO_LABEL[estado];
}

/** Tom do badge, coerente com rotuloEstado — "Por concluir" não é um aviso passageiro. */
export function toneEstado(
  estado: EstadoAvaliacao,
  semestreFechado: boolean,
): "success" | "warning" | "danger" | "neutral" {
  if (semestreFechado && ESTADOS_PENDENTES.includes(estado)) return "danger";
  return estado === "DISPENSADO" || estado === "APROVADO"
    ? "success"
    : estado === "REPROVADO"
      ? "danger"
      : estado === "EM_CURSO"
        ? "neutral"
        : "warning";
}

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
