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
