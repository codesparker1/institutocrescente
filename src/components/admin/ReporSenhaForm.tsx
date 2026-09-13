"use client";

import { useActionState, useState } from "react";
import { KeyRound } from "lucide-react";
import { reporSenhaAction, type ReporSenhaState } from "@/actions/admin";

const initialState: ReporSenhaState = {};

interface ReporSenhaFormProps {
  /** User.id da conta — null quando a pessoa não tem conta de acesso criada. */
  userId: string | null;
  /** Aparece no pedido de confirmação, para não se repor a senha da pessoa errada. */
  nome: string;
  variant?: "icon" | "link";
}

/**
 * Repõe a senha de uma conta para a senha padrão (§pedido do cliente 2026-09-13). Partilhado pelas
 * três listagens onde uma conta aparece: Equipa, Professores e a ficha do aluno.
 *
 * Confirmação em dois passos, com o nome à frente. Não é destrutivo como apagar — nada se perde —
 * mas tira o acesso a uma pessoa até ela voltar a entrar, e um clique ao lado numa tabela densa
 * seria fácil de dar e difícil de perceber depois ("porque é que a minha senha deixou de servir?").
 * Ver o nome antes de confirmar é o que transforma isso num engano improvável.
 */
export function ReporSenhaForm({ userId, nome, variant = "icon" }: ReporSenhaFormProps) {
  const [state, formAction, isPending] = useActionState(reporSenhaAction, initialState);
  const [aConfirmar, setAConfirmar] = useState(false);

  // Sem conta não há senha a repor — dizer isso é mais útil do que um botão que só daria erro.
  if (!userId) {
    return <span className="text-xs text-texto-suave">Sem conta de acesso</span>;
  }

  if (state.sucesso) {
    return (
      <span className="flex flex-col items-end gap-0.5 text-xs">
        <span className="font-medium text-green-700">Senha reposta</span>
        <span className="text-texto-suave">
          Entra com <code className="rounded bg-navy-50 px-1 font-mono text-[11px] text-texto">{state.sucesso.senha}</code> e
          troca-a logo à entrada.
        </span>
      </span>
    );
  }

  if (!aConfirmar) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setAConfirmar(true)}
          className={
            variant === "icon"
              ? "rounded-md p-1.5 text-texto-suave hover:bg-gold-50 hover:text-gold-700"
              : "text-xs font-medium text-texto-suave hover:text-navy-700 hover:underline"
          }
          aria-label={variant === "icon" ? `Repor a senha de ${nome}` : undefined}
          title="Repor a senha para a senha padrão"
        >
          {variant === "icon" ? <KeyRound size={15} /> : "repor senha"}
        </button>
        {state.error ? <p className="max-w-48 text-right text-xs text-red-600">{state.error}</p> : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <span className="text-right text-xs text-texto-suave">
        Repor a senha de <strong className="text-texto">{nome}</strong>?
      </span>
      <span className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-navy-700 px-2.5 py-1 text-xs font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
        >
          {isPending ? "A repor..." : "Confirmar"}
        </button>
        <button type="button" onClick={() => setAConfirmar(false)} className="text-xs text-texto-suave hover:text-navy-600">
          cancelar
        </button>
      </span>
      {state.error ? <p className="max-w-48 text-right text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
