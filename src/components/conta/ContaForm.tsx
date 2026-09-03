"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Field, Input } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { atualizarContaAction, type ContaState } from "@/actions/conta";

const initialState: ContaState = {};

interface ContaFormProps {
  emailAtual: string | null;
  telefoneAtual: string | null;
  emailObrigatorio: boolean;
  telefoneObrigatorio: boolean;
}

export function ContaForm({ emailAtual, telefoneAtual, emailObrigatorio, telefoneObrigatorio }: ContaFormProps) {
  const [state, formAction, isPending] = useActionState(atualizarContaAction, initialState);

  return (
    <form key={JSON.stringify(state.values ?? {})} action={formAction} className="flex max-w-md flex-col gap-4">
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          required={emailObrigatorio}
          defaultValue={state.values?.email ?? emailAtual ?? ""}
        />
      </Field>

      <div className="flex flex-col gap-1">
        <label htmlFor="telefone" className="text-sm font-medium text-texto">
          Telefone
        </label>
        <PhoneInput
          id="telefone"
          name="telefone"
          required={telefoneObrigatorio}
          defaultValue={state.values?.telefone ?? telefoneAtual ?? ""}
        />
        {state.fieldErrors?.telefone ? <p className="text-xs text-red-600">{state.fieldErrors.telefone}</p> : null}
      </div>

      <div className="mt-2 border-t border-navy-50 pt-4">
        <Field label="Senha atual" htmlFor="senhaAtual" error={state.fieldErrors?.senhaAtual}>
          <Input id="senhaAtual" name="senhaAtual" type="password" required autoComplete="current-password" />
        </Field>
        <p className="mt-1 text-xs text-texto-suave">Necessária para confirmar qualquer alteração nesta página.</p>
      </div>

      <div className="border-t border-navy-50 pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-texto-suave">Alterar senha (opcional)</p>
        <div className="flex flex-col gap-4">
          <Field label="Nova senha" htmlFor="novaSenha" error={state.fieldErrors?.novaSenha}>
            <Input id="novaSenha" name="novaSenha" type="password" autoComplete="new-password" />
          </Field>
          <Field label="Confirmar nova senha" htmlFor="confirmarNovaSenha" error={state.fieldErrors?.confirmarNovaSenha}>
            <Input id="confirmarNovaSenha" name="confirmarNovaSenha" type="password" autoComplete="new-password" />
          </Field>
        </div>
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      {state.success ? (
        <p className="flex items-center gap-1.5 text-sm text-green-700">
          <CheckCircle2 size={16} />
          Dados da conta atualizados.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
      >
        {isPending ? "A guardar..." : "Guardar"}
      </button>
    </form>
  );
}
