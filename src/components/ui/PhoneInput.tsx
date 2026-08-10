"use client";

import type { ChangeEvent } from "react";
import { cn } from "@/lib/utils";

interface PhoneInputProps {
  id?: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  className?: string;
}

function formatarNumeroLocal(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 9);
  return [digitos.slice(0, 3), digitos.slice(3, 6), digitos.slice(6, 9)].filter(Boolean).join(" ");
}

function extrairNumeroLocal(valorComPrefixo?: string): string {
  if (!valorComPrefixo) return "";
  return formatarNumeroLocal(valorComPrefixo.replace(/^\+?244/, ""));
}

export function PhoneInput({ id, name, required, defaultValue, className }: PhoneInputProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    e.currentTarget.value = formatarNumeroLocal(e.currentTarget.value);
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="shrink-0 rounded-lg border border-navy-100 bg-navy-50 px-3 py-2 text-sm text-navy-500">
        +244
      </span>
      <input
        id={id}
        name={name}
        type="tel"
        inputMode="numeric"
        required={required}
        defaultValue={extrairNumeroLocal(defaultValue)}
        onChange={handleChange}
        placeholder="9XX XXX XXX"
        maxLength={11}
        className="min-w-0 flex-1 rounded-lg border border-navy-100 bg-white px-3 py-2 text-sm text-navy-900 placeholder:text-navy-300 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100"
      />
    </div>
  );
}
