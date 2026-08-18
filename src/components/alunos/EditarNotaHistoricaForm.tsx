"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { guardarNotaHistoricaAction, type GuardarNotaHistoricaState } from "@/actions/notas";

const initialState: GuardarNotaHistoricaState = {};

const CAMPOS: { name: "p1" | "p2" | "exame" | "recurso" | "exameEspecial"; label: string }[] = [
  { name: "p1", label: "P1" },
  { name: "p2", label: "P2" },
  { name: "exame", label: "Exame" },
  { name: "recurso", label: "Recurso" },
  { name: "exameEspecial", label: "Exame Esp." },
];

interface NotaAtual {
  p1?: number | null;
  p2?: number | null;
  exame?: number | null;
  recurso?: number | null;
  exameEspecial?: number | null;
}

interface EditarNotaHistoricaFormProps {
  inscricaoCadeiraId: string;
  notasAtuais: NotaAtual;
}

/** Corrige/lança notas de uma InscricaoCadeira específica (mesmo de anos anteriores) — cada campo vazio não altera essa época. */
export function EditarNotaHistoricaForm({ inscricaoCadeiraId, notasAtuais }: EditarNotaHistoricaFormProps) {
  const [state, formAction, isPending] = useActionState(guardarNotaHistoricaAction, initialState);
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-xs font-medium text-navy-500 hover:text-navy-700 hover:underline">
        editar
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="inscricaoCadeiraId" value={inscricaoCadeiraId} />
      {CAMPOS.map((campo) => (
        <div key={campo.name} className="flex flex-col gap-0.5">
          <label className="text-[10px] font-medium text-navy-400">{campo.label}</label>
          <Input
            type="number"
            name={campo.name}
            min={0}
            max={20}
            step={0.1}
            defaultValue={notasAtuais[campo.name] ?? ""}
            className="w-16 px-2 py-1 text-xs"
          />
        </div>
      ))}
      <Button type="submit" variant="secondary" disabled={isPending} className="px-2.5 py-1 text-xs">
        {isPending ? "A guardar..." : "Guardar"}
      </Button>
      <button type="button" onClick={() => setAberto(false)} className="text-xs text-navy-400 hover:text-navy-600">
        cancelar
      </button>
      {state.error ? <p className="w-full text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
