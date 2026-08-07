"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { lancarNotaAction } from "@/actions/notas";
import { cn } from "@/lib/utils";

interface GradeCellProps {
  turmaId: string;
  avaliacaoId: string;
  matriculaId: string;
  valorInicial: number | null;
  disabled?: boolean;
}

export function GradeCell({ turmaId, avaliacaoId, matriculaId, valorInicial, disabled }: GradeCellProps) {
  const [valor, setValor] = useState(valorInicial?.toString() ?? "");
  const [savedFlash, setSavedFlash] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleBlur() {
    if (disabled || valor === "") return;
    const formData = new FormData();
    formData.set("turmaId", turmaId);
    formData.set("avaliacaoId", avaliacaoId);
    formData.set("matriculaId", matriculaId);
    formData.set("valor", valor);

    startTransition(async () => {
      const result = await lancarNotaAction({}, formData);
      if (!result.error) {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1200);
      }
    });
  }

  return (
    <form ref={formRef} className="flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        max={20}
        step="0.5"
        value={valor}
        disabled={disabled}
        onChange={(e) => setValor(e.target.value)}
        onBlur={handleBlur}
        className={cn(
          "w-16 rounded-md border border-navy-100 px-2 py-1 text-center text-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100",
          disabled && "cursor-not-allowed bg-navy-50 text-navy-300",
        )}
      />
      {isPending ? (
        <Loader2 size={14} className="animate-spin text-navy-300" />
      ) : savedFlash ? (
        <Check size={14} className="text-emerald-600" />
      ) : null}
    </form>
  );
}
