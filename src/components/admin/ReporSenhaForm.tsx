"use client";

import { useActionState, useState } from "react";
import { KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { reporSenhaAction, type ReporSenhaState } from "@/actions/admin";

const initialState: ReporSenhaState = {};

interface ReporSenhaFormProps {
  /** User.id da conta — null quando a pessoa não tem conta de acesso criada. */
  userId: string | null;
  /** Aparece no pedido de confirmação, para não se repor a senha da pessoa errada. */
  nome: string;
  /**
   * A conta ainda está na senha padrão e tem de a trocar à entrada (User.deveTrocarSenha). É o
   * estado que o Badge mostra: informação que já existia na base desde sempre e nunca esteve à
   * vista de ninguém, apesar de ser a resposta a "esta pessoa já configurou a conta dela?".
   */
  deveTrocarSenha: boolean;
}

/**
 * Estado da senha de uma conta, e o botão para a repor (§pedido do cliente 2026-09-13).
 * Partilhado pelas três listagens onde uma conta aparece: Equipa, Professores e a ficha do aluno.
 *
 * O Badge vem antes do botão de propósito. A primeira pergunta de quem olha para a linha não é "o
 * que posso fazer aqui" — é "como está isto?"; e "Senha Padrão" contra "Senha Definida" responde
 * sozinho quem ainda não entrou na conta pela primeira vez.
 *
 * Confirmação em dois passos, com o nome à frente. Não é destrutivo — nada se perde — mas tira o
 * acesso a uma pessoa até ela voltar a entrar, e um clique ao lado numa tabela densa seria fácil
 * de dar e difícil de perceber depois ("porque é que a minha senha deixou de servir?").
 */
export function ReporSenhaForm({ userId, nome, deveTrocarSenha }: ReporSenhaFormProps) {
  const [state, formAction, isPending] = useActionState(reporSenhaAction, initialState);
  const [aConfirmar, setAConfirmar] = useState(false);

  // Sem conta não há senha nem estado a mostrar — dizê-lo é mais útil do que um botão que só daria erro.
  if (!userId) {
    return <Badge tone="neutral">Sem Conta de Acesso</Badge>;
  }

  if (state.sucesso) {
    return (
      // Painel, e não uma linha de texto miúdo (§reportado 2026-09-13: "isso é muito pequeno"). É
      // aqui que a senha aparece, e quem a está a ler vai ditá-la a alguém ao telefone ou copiá-la
      // para uma mensagem — tem de se ler de longe e sem confundir caracteres.
      <div className="flex flex-col items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <Badge tone="success">Senha Reposta</Badge>
        <p className="text-sm text-texto">
          Entra com{" "}
          <code className="select-all rounded border border-emerald-300 bg-white px-2 py-1 font-mono text-base font-semibold tracking-wide text-texto">
            {state.sucesso.senha}
          </code>
        </p>
        <p className="text-xs text-texto-suave">A troca é pedida logo à entrada.</p>
      </div>
    );
  }

  if (aConfirmar) {
    return (
      <form action={formAction} className="flex flex-col items-start gap-1.5">
        <input type="hidden" name="userId" value={userId} />
        <span className="text-xs text-texto">
          Repor a senha de <strong>{nome}</strong>?
        </span>
        <span className="flex items-center gap-2">
          <Button type="submit" variant="secondary" disabled={isPending} className="px-3 py-1.5 text-xs">
            {isPending ? "A Repor..." : "Confirmar"}
          </Button>
          <button
            type="button"
            onClick={() => setAConfirmar(false)}
            className="text-xs font-medium text-texto-suave hover:text-navy-700 hover:underline"
          >
            Cancelar
          </button>
        </span>
        {state.error ? <p className="max-w-56 text-xs text-red-600">{state.error}</p> : null}
      </form>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Badge tone={deveTrocarSenha ? "warning" : "neutral"}>{deveTrocarSenha ? "Senha Padrão" : "Senha Definida"}</Badge>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setAConfirmar(true)}
        className="gap-1.5 border border-navy-100 px-3 py-1.5 text-xs"
      >
        <KeyRound size={14} />
        Repor Senha
      </Button>
      {state.error ? <p className="max-w-56 text-xs text-red-600">{state.error}</p> : null}
    </div>
  );
}
