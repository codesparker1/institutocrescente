"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { atualizarRegrasCadeiraCurricularAction } from "@/actions/admin";

const initialState: { error?: string } = {};

interface EditarRegrasCadeiraCurricularProps {
  cadeiraCurricularId: string;
  permiteDispensa: boolean;
  notaMinimaDispensa: number;
}

export function EditarRegrasCadeiraCurricular({
  cadeiraCurricularId,
  permiteDispensa,
  notaMinimaDispensa,
}: EditarRegrasCadeiraCurricularProps) {
  const [state, formAction, isPending] = useActionState(atualizarRegrasCadeiraCurricularAction, initialState);

  return (
    <form action={formAction} className="flex items-center justify-end gap-1.5">
      <input type="hidden" name="cadeiraCurricularId" value={cadeiraCurricularId} />
      <Select name="permiteDispensa" defaultValue={String(permiteDispensa)} disabled={isPending} className="w-28 py-1 text-xs">
        <option value="true">Com dispensa</option>
        <option value="false">Sem dispensa</option>
      </Select>
      <Input
        name="notaMinimaDispensa"
        type="number"
        min={0}
        max={20}
        step="0.5"
        defaultValue={notaMinimaDispensa}
        disabled={isPending}
        className="w-16 py-1 text-right text-xs"
        title="Nota mínima para dispensa"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-navy-700 px-2.5 py-1.5 text-xs font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
      >
        {isPending ? "..." : "Guardar"}
      </button>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
