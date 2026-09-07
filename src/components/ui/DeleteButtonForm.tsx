"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";

export interface DeleteButtonFormState {
  error?: string;
}

const initialState: DeleteButtonFormState = {};

interface DeleteButtonFormProps {
  /** Devolve `{ error }` quando não pode remover — ver a nota abaixo sobre porque não lança. */
  action: (formData: FormData) => Promise<void | DeleteButtonFormState>;
  id: string;
  /** Estilo de texto (ex. "remover" em ScheduleGrid) em vez do ícone-padrão usado nas tabelas de admin. */
  variant?: "icon" | "link";
  className?: string;
}

/**
 * Botão de remover partilhado por todos os ecrãs com uma tabela + eliminar-por-linha (cursos,
 * disciplinas, professores, turmas, turma-disciplina, emolumentos, provas, horário).
 *
 * As Server Actions DEVOLVEM `{ error }` em vez de lançarem (§bug reportado 2026-09-07). Lançar
 * funcionava em desenvolvimento e falhava em produção: o Next.js substitui a mensagem de qualquer
 * exceção que saia de uma Server Action por um erro genérico com digest, e o DAAC via um crash sem
 * explicação onde o código já tinha a frase certa escrita. Um valor devolvido são dados normais —
 * atravessa intacto.
 *
 * O try/catch fica como rede: uma ação que ainda lance (ou uma falha de rede) continua a mostrar
 * alguma coisa em vez de deixar o botão em silêncio.
 */
export function DeleteButtonForm({ action, id, variant = "icon", className }: DeleteButtonFormProps) {
  const [state, formAction, isPending] = useActionState(async (_prev: DeleteButtonFormState, formData: FormData) => {
    try {
      return (await action(formData)) ?? {};
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
