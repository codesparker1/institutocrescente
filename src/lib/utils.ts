import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

export function diaSemanaHoje(): string {
  return JS_DAY_TO_DIA_SEMANA[new Date().getDay()];
}

export function diasAteProximo(diaSemana: string): number {
  const hoje = JS_DAY_TO_DIA_SEMANA[new Date().getDay()];
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

export interface DataValida {
  iso: string;
  label: string;
}

/** Gera as próximas datas (a partir de hoje) cujo dia da semana coincide com os dias letivos informados. */
export function proximasDatasValidas(diasSemana: string[], quantidade = 8): DataValida[] {
  const alvo = new Set(diasSemana);
  const datas: DataValida[] = [];
  const cursor = new Date();

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
  curso: { nome: string };
}

export function turmaLabel(turma: TurmaLabelInput): string {
  return `${turma.curso.nome} - ${turma.anoCurricular}º Ano - ${PERIODO_LABEL[turma.periodo]}`;
}
