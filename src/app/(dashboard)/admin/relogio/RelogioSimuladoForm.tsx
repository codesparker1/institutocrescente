"use client";

import { useActionState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Field, Input } from "@/components/ui/Input";
import { avancarRelogioAction, reporRelogioAction, type AvancarRelogioState } from "@/actions/relogio";

const initialState: AvancarRelogioState = {};

const ATALHOS = [
  { label: "+1 dia", dias: 1 },
  { label: "+7 dias", dias: 7 },
  { label: "+30 dias", dias: 30 },
  { label: "+365 dias", dias: 365 },
];

export function RelogioSimuladoForm() {
  const [state, formAction, isPending] = useActionState(avancarRelogioAction, initialState);
  const [isReposicaoPending, startReposicao] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex max-w-sm flex-col gap-4">
        <Field label="Dias a avançar (negativo para recuar)" htmlFor="dias" error={state.fieldErrors?.dias}>
          <Input id="dias" name="dias" type="number" step={1} defaultValue={state.values?.dias} placeholder="Ex.: 30" />
        </Field>

        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        {state.success ? (
          <p className="flex items-center gap-1.5 text-sm text-green-700">
            <CheckCircle2 size={16} />
            Relógio avançado.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
        >
          {isPending ? "A avançar..." : "Avançar"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2 border-t border-navy-50 pt-4">
        {ATALHOS.map((atalho) => (
          <form key={atalho.dias} action={formAction}>
            <input type="hidden" name="dias" value={atalho.dias} />
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg border border-navy-100 px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-60"
            >
              {atalho.label}
            </button>
          </form>
        ))}
        <button
          type="button"
          disabled={isReposicaoPending}
          onClick={() => startReposicao(async () => { await reporRelogioAction(); })}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          {isReposicaoPending ? "A repor..." : "Repor hora real"}
        </button>
      </div>
    </div>
  );
}
