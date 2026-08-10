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
