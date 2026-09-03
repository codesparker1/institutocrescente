"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";

export interface DeleteButtonFormState {
  error?: string;
}

const initialState: DeleteButtonFormState = {};

interface DeleteButtonFormProps {
  action: (formData: FormData) => Promise<void>;
  id: string;
  /** Estilo de texto (ex. "remover" em ScheduleGrid) em vez do ícone-padrão usado nas tabelas de admin. */
  variant?: "icon" | "link";
  className?: string;
}

/**
 * Botão de remover partilhado por todos os ecrãs com uma tabela + eliminar-por-linha (cursos,
 * disciplinas, professores, turmas, turma-disciplina, emolumentos, provas, horário). As Server
 * Actions já apanham violações de FK e lançam um Error com mensagem amigável ("ainda tem turmas
 * associadas...") — mas um `<form action={...}>` sem useActionState não tem onde mostrar esse
 * erro, e o Error propaga como um crash a sério (500 + boundary de erro do React), não como a
 * mensagem amigável que o código já tinha pronta. Achado pela corrida do cost-meter: apagar um
 * curso com turmas dava HTTP 500 em vez da mensagem.
 */
export function DeleteButtonForm({ action, id, variant = "icon", className }: DeleteButtonFormProps) {
  const [state, formAction, isPending] = useActionState(async (_prev: DeleteButtonFormState, formData: FormData) => {
    try {
      await action(formData);
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Não foi possível remover." };
    }
  }, initialState);

  return (
    <form action={formAction} className={className ?? "flex flex-col items-end gap-1"}>
      <input type="hidden" name="id" value={id} />
      {variant === "icon" ? (
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md p-1.5 text-texto-suave hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Remover"
        >
          <Trash2 size={15} />
        </button>
      ) : (
        <button type="submit" disabled={isPending} className="text-[10px] font-medium text-red-500 hover:text-red-700 disabled:opacity-60">
          remover
        </button>
      )}
      {state.error ? <p className="max-w-48 text-right text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
