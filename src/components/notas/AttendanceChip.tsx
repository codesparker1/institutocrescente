"use client";

import { useState, useTransition } from "react";
import { toggleFrequenciaAction } from "@/actions/frequencia";
import { cn } from "@/lib/utils";

interface AttendanceChipProps {
  frequenciaId: string;
  nome: string;
  presenteInicial: boolean;
  disabled?: boolean;
}

export function AttendanceChip({ frequenciaId, nome, presenteInicial, disabled }: AttendanceChipProps) {
  const [presente, setPresente] = useState(presenteInicial);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (disabled) return;
    const formData = new FormData();
    formData.set("frequenciaId", frequenciaId);
    setPresente((v) => !v);
    startTransition(async () => {
      await toggleFrequenciaAction(formData);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isPending}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        presente
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-navy-100 bg-white text-navy-400 hover:bg-navy-50",
      )}
    >
      {nome}
    </button>
  );
}
