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

/**
 * O ano letivo corrente, derivado da fronteira que o DAAC configura (anoLetivoInicio/anoLetivoFim) —
 * não de `agora.getFullYear()`, que muda a meio do ano letivo: em Fevereiro de 2027, o ano letivo
 * ainda e 2026/2027, mas o ano civil ja e 2027.
 *
 * Devolvido como o ano civil de INICIO (2026 = "2026/2027"), a mesma convencao de Turma.anoLetivo,
 * para poderem ser comparados diretamente.
 *
 * Fora do intervalo configurado (ferias entre anos letivos, ou config por preencher) devolve null:
 * o chamador decide se recusa a operacao ou se recorre ao ano civil. Preferir null a adivinhar —
 * era isso que deixava marcar provas na turma do ano passado sem ninguem reparar.
 */
export function anoLetivoCorrente(
  agora: Date,
  config: { anoLetivoInicio: Date | null; anoLetivoFim: Date | null } | null,
): number | null {
  if (!config?.anoLetivoInicio || !config.anoLetivoFim) return null;
  if (agora < config.anoLetivoInicio || agora > config.anoLetivoFim) return null;
  return config.anoLetivoInicio.getFullYear();
}

/**
 * O semestre de uma cadeira já fechou? Fechado = já não entra nota nenhuma nele.
 *
 * É o caso de qualquer semestre de um ano letivo anterior, e do 1º semestre do ano corrente quando
 * o sistema já avançou para o 2º — a mesma fronteira que alterarSemestreAction usa para fechar as
 * cadeiras a zeros (§2026-08-31/09-01).
 *
 * Serve para a leitura: numa cadeira de um semestre fechado, "Em recurso" ou "Em curso" mentem, e
 * passam a "Por concluir" (ver rotuloEstado em lib/avaliacao.ts).
 */
export function semestreFechado(
  cadeira: { anoLetivo: number; semestre: number },
  corrente: { anoLetivo: number | null; semestreAtual: number },
): boolean {
  if (corrente.anoLetivo === null) return false;
  if (cadeira.anoLetivo < corrente.anoLetivo) return true;
  if (cadeira.anoLetivo > corrente.anoLetivo) return false;
  return cadeira.semestre < corrente.semestreAtual;
}

/**
 * As datas do ano seguinte: as mesmas, um ano à frente. Um ano letivo que ia de 1/Set/2026 a
 * 31/Jul/2027 passa a 1/Set/2027 – 31/Jul/2028, e a janela de matrícula acompanha.
 *
 * Existe porque, sem isto, quando o ano letivo acabava a configuração continuava a apontar para o
 * ano velho: anoLetivoCorrente devolvia null, o Horário bloqueava e o sistema ficava parado até
 * alguém ir mexer nas datas à mão — logo no momento em que as matrículas abrem e é preciso marcar
 * os horários. O DAAC corrige depois se as datas reais forem outras; o que não pode é o sistema
 * ficar de rastos à espera disso.
 *
 * §2026-09-03: as datas de MATRÍCULA passaram a avançar também. Antes só o ano letivo avançava, e
 * a janela de matrícula ficava inteira no passado — processarRematriculaAction recusava toda a
 * rematrícula ("fora do período"), exatamente na altura de rematricular. Só a ADMIN passava, por
 * ter podeForaDaJanela; a Secretaria, que é quem faz este trabalho, ficava bloqueada.
 *
 * As de matrícula são opcionais no schema (ao contrário das do ano letivo, que o rollover só corre
 * tendo): por preencher, ficam por preencher — avançar um null inventaria uma janela que o DAAC
 * nunca definiu.
 *
 * O dia é preservado tal como está: 29/Fev daria 1/Mar no ano seguinte (o Date normaliza), e é o
 * comportamento certo — nenhum ano letivo começa a 29 de Fevereiro por acaso, e forçar 28 seria
 * inventar.
 */
export function datasDoAnoLetivoSeguinte(config: {
  anoLetivoInicio: Date;
  anoLetivoFim: Date;
  matriculaInicio?: Date | null;
  matriculaFim?: Date | null;
}): {
  anoLetivoInicio: Date;
  anoLetivoFim: Date;
  matriculaInicio: Date | null;
  matriculaFim: Date | null;
} {
  const maisUmAno = (d: Date) => new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
  return {
    anoLetivoInicio: maisUmAno(config.anoLetivoInicio),
    anoLetivoFim: maisUmAno(config.anoLetivoFim),
    matriculaInicio: config.matriculaInicio ? maisUmAno(config.matriculaInicio) : null,
    matriculaFim: config.matriculaFim ? maisUmAno(config.matriculaFim) : null,
  };
}

/**
 * Que trabalho de fim de ano é preciso fazer agora. Duas fronteiras DIFERENTES, e confundi-las foi
 * o que trancou 12 alunos de uma vez (§2026-09-03):
 *
 * - `rollover` no fim do ANO LETIVO: as turmas e as datas do ano novo têm de existir antes de as
 *   matrículas abrirem, senão não há para onde rematricular ninguém.
 * - `suspender` no fim da JANELA DE MATRÍCULA: só depois de a janela fechar é que "não veio
 *   renovar" é verdade. Antes disso — incluindo no intervalo entre o fim do ano letivo e a abertura
 *   das matrículas — quem não renovou está a tempo.
 *
 * Na configuração real do cliente o ano letivo acabava a 24/Jun e as matrículas abriam a 30/Ago:
 * com as duas coisas presas ao fim do ano letivo, os alunos eram trancados a 25/Jun por não terem
 * cumprido um prazo que só começava dois meses depois.
 *
 * Sem `matriculaFim` não suspende ninguém: sem fronteira não há como distinguir quem faltou de quem
 * ainda vai a tempo, e trancar por omissão tira o acesso a quem não fez nada de errado.
 */
export function trabalhoDeFimDeAno(
  agora: Date,
  config: { anoLetivoFim: Date | null; matriculaFim: Date | null },
): { rollover: boolean; suspender: boolean } {
  return {
    rollover: config.anoLetivoFim !== null && agora > config.anoLetivoFim,
    suspender: config.matriculaFim !== null && agora > config.matriculaFim,
  };
}

/** A data cai dentro do ano letivo configurado? Usado para recusar provas agendadas fora dele. */
export function dentroDoAnoLetivo(
  data: Date,
  config: { anoLetivoInicio: Date | null; anoLetivoFim: Date | null } | null,
): boolean {
  if (!config?.anoLetivoInicio || !config.anoLetivoFim) return true;
  return data >= config.anoLetivoInicio && data <= config.anoLetivoFim;
}
