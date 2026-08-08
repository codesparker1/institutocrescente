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

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
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

export function diasAteProximo(diaSemana: string): number {
  const hoje = JS_DAY_TO_DIA_SEMANA[new Date().getDay()];
  const indiceHoje = DIA_SEMANA_ORDEM.indexOf(hoje);
  const indiceAlvo = DIA_SEMANA_ORDEM.indexOf(diaSemana);
  if (indiceHoje === -1 || indiceAlvo === -1) return 99;
  const diff = indiceAlvo - indiceHoje;
  return diff < 0 ? diff + 7 : diff;
}
