"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface DateSelectProps {
  name: string;
  defaultValue?: string;
  minYear?: number;
  maxYear?: number;
  className?: string;
}

const DIAS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));
const MESES = [
  { valor: "01", label: "Jan" },
  { valor: "02", label: "Fev" },
  { valor: "03", label: "Mar" },
  { valor: "04", label: "Abr" },
  { valor: "05", label: "Mai" },
  { valor: "06", label: "Jun" },
  { valor: "07", label: "Jul" },
  { valor: "08", label: "Ago" },
  { valor: "09", label: "Set" },
  { valor: "10", label: "Out" },
  { valor: "11", label: "Nov" },
  { valor: "12", label: "Dez" },
];

const selectClassName =
  "rounded-lg border border-navy-100 bg-white px-2 py-2 text-sm text-navy-900 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100";

export function DateSelect({ name, defaultValue, minYear = 1950, maxYear = new Date().getFullYear(), className }: DateSelectProps) {
  const [anoInicial, mesInicial, diaInicial] = defaultValue?.split("-") ?? [];
  const [dia, setDia] = useState(diaInicial ?? "");
  const [mes, setMes] = useState(mesInicial ?? "");
  const [ano, setAno] = useState(anoInicial ?? "");

  const anos = Array.from({ length: maxYear - minYear + 1 }, (_, i) => String(maxYear - i));
  const valor = dia && mes && ano ? `${ano}-${mes}-${dia}` : "";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <select aria-label="Dia" className={selectClassName} value={dia} onChange={(e) => setDia(e.target.value)}>
        <option value="" disabled>
          Dia
        </option>
        {DIAS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select aria-label="Mês" className={selectClassName} value={mes} onChange={(e) => setMes(e.target.value)}>
        <option value="" disabled>
          Mês
        </option>
        {MESES.map((m) => (
          <option key={m.valor} value={m.valor}>
            {m.label}
          </option>
        ))}
      </select>
      <select aria-label="Ano" className={selectClassName} value={ano} onChange={(e) => setAno(e.target.value)}>
        <option value="" disabled>
          Ano
        </option>
        {anos.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <input type="hidden" name={name} value={valor} />
    </div>
  );
}
