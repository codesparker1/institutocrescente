import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Lê um inteiro de um searchParam sem confiar no valor — um URL editado à mão ou um bookmark
 * antigo (`?ano=abc`, `?ano=`) produz `NaN`, e passar `NaN` a um filtro Prisma rebenta com
 * PrismaClientValidationError em vez de simplesmente ignorar o filtro inválido.
 */
export function parseIntParam(valor: string | undefined): number | undefined {
  if (!valor) return undefined;
  const n = Number(valor);
  return Number.isInteger(n) ? n : undefined;
}

/** O ano letivo é armazenado como o ano civil de início (ex.: 2026), mas a instituição designa-o
 * sempre pelo par de anos que atravessa (ex.: "2026/2027") — nunca mostrar o número isolado. */
export function formatAnoLetivo(anoLetivo: number): string {
  return `${anoLetivo}/${anoLetivo + 1}`;
}

const CURRENCY = "Kz";

export function formatCurrency(value: number | string): string {
  const amount = typeof value === "string" ? Number(value) : value;
  return `${amount.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY}`;
}

const FUSO_ANGOLA = "Africa/Luanda";

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: FUSO_ANGOLA });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO_ANGOLA,
  });
}

const RELATIVE_UNITS: { limit: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { limit: 60, divisor: 1, unit: "second" },
  { limit: 3600, divisor: 60, unit: "minute" },
  { limit: 86400, divisor: 3600, unit: "hour" },
  { limit: 2592000, divisor: 86400, unit: "day" },
  { limit: 31536000, divisor: 2592000, unit: "month" },
  { limit: Infinity, divisor: 31536000, unit: "year" },
];

const relativeFormatter = new Intl.RelativeTimeFormat("pt-PT", { numeric: "auto" });

export function formatRelativeTime(date: Date | string, agora: Date = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffSegundos = Math.round((d.getTime() - agora.getTime()) / 1000);
  const abs = Math.abs(diffSegundos);
  const { divisor, unit } = RELATIVE_UNITS.find((u) => abs < u.limit) ?? RELATIVE_UNITS[RELATIVE_UNITS.length - 1];
  return relativeFormatter.format(Math.round(diffSegundos / divisor), unit);
}

const MESES_LABEL = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function mesReferenciaLabel(data: Date): string {
  return `${MESES_LABEL[data.getMonth()]}/${data.getFullYear()}`;
}

/** Chave de agrupamento por mês/ano — usada para casar uma multa por atraso com a mensalidade do mesmo mês. */
export function chaveMes(data: Date): string {
  return `${data.getFullYear()}-${data.getMonth()}`;
}

export const DIA_SEMANA_LABEL: Record<string, string> = {
  SEGUNDA: "Segunda",
  TERCA: "Terça",
  QUARTA: "Quarta",
  QUINTA: "Quinta",
  SEXTA: "Sexta",
  SABADO: "Sábado",
};

export const DIA_SEMANA_ORDEM = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"];

export const PERIODO_LABEL: Record<string, string> = {
  MATUTINO: "Matutino",
  VESPERTINO: "Vespertino",
  NOTURNO: "Noturno",
};

const JS_DAY_TO_DIA_SEMANA = ["DOMINGO", "SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"];

// `agora` como parâmetro (nunca lido internamente) para os chamadores do servidor poderem passar
// um relógio simulado (src/lib/tempo.ts) sem este ficheiro precisar de "server-only" — é
// importado por componentes cliente também, e esse import quebraria o build deles.
export function diaSemanaHoje(agora: Date = new Date()): string {
  return JS_DAY_TO_DIA_SEMANA[agora.getDay()];
}

export function diasAteProximo(diaSemana: string, agora: Date = new Date()): number {
  const hoje = JS_DAY_TO_DIA_SEMANA[agora.getDay()];
  const indiceHoje = DIA_SEMANA_ORDEM.indexOf(hoje);
  const indiceAlvo = DIA_SEMANA_ORDEM.indexOf(diaSemana);
  if (indiceHoje === -1 || indiceAlvo === -1) return 99;
  const diff = indiceAlvo - indiceHoje;
  return diff < 0 ? diff + 7 : diff;
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Inverso exato de `toIsoDate`: lê "aaaa-mm-dd" de um <input type="date"> como meia-noite LOCAL.
 * `new Date("2026-09-01")` não serve — a spec manda interpretar a forma só-data como meia-noite
 * UTC, enquanto toIsoDate lê de volta com getFullYear/getMonth/getDate, que são locais. Num
 * servidor a oeste de Greenwich (Vercel us-east, por exemplo) o par grava/lê perdia um dia: o DAAC
 * escolhia 01/09 e o formulário devolvia 31/08.
 * Devolve null para entrada malformada, para o chamador poder rejeitar em vez de gravar Invalid Date.
 */
export function fromIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const [, ano, mes, dia] = match;
  const data = new Date(Number(ano), Number(mes) - 1, Number(dia));
  // Rejeita datas que "transbordam" (ex.: 2026-02-31 viraria 3 de março).
  if (data.getFullYear() !== Number(ano) || data.getMonth() !== Number(mes) - 1 || data.getDate() !== Number(dia)) {
    return null;
  }
  return data;
}

export interface DataValida {
  iso: string;
  label: string;
}

/** Gera as próximas datas (a partir de hoje) cujo dia da semana coincide com os dias letivos informados. */
export function proximasDatasValidas(diasSemana: string[], quantidade = 8, agora: Date = new Date()): DataValida[] {
  const alvo = new Set(diasSemana);
  const datas: DataValida[] = [];
  const cursor = new Date(agora);

  for (let i = 0; datas.length < quantidade && i < 60; i += 1) {
    const dia = JS_DAY_TO_DIA_SEMANA[cursor.getDay()];
    if (alvo.has(dia)) {
      datas.push({ iso: toIsoDate(cursor), label: `${formatDate(cursor)} · ${DIA_SEMANA_LABEL[dia]}` });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return datas;
}

interface TurmaLabelInput {
  anoCurricular: number;
  periodo: string;
  anoLetivo: number;
  curso: { nome: string };
}

export function turmaLabel(turma: TurmaLabelInput): string {
  return `${turma.curso.nome} - ${turma.anoCurricular}º Ano - ${PERIODO_LABEL[turma.periodo]} - ${formatAnoLetivo(turma.anoLetivo)}`;
}
