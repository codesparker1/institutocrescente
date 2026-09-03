"use client";

import { useActionState } from "react";
import { IspcCrest } from "@/components/brand/IspcCrest";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { trocarSenhaAction, type TrocarSenhaState } from "@/actions/auth";

const initialState: TrocarSenhaState = {};

export function TrocarSenhaForm() {
  const [state, formAction, isPending] = useActionState(trocarSenhaAction, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <IspcCrest size={176} priority />
          <div>
            <h1 className="text-lg font-bold tracking-wide text-gold-300">Trocar senha</h1>
            <p className="text-xs uppercase tracking-wider text-texto-suave">
              Por segurança, defina uma senha só sua antes de continuar.
            </p>
          </div>
        </div>

        <form
          action={formAction}
          className="flex flex-col gap-4 rounded-xl border border-navy-800 bg-navy-900 p-6 shadow-xl"
        >
          <Field label="Nova senha" htmlFor="novaSenha" error={state.fieldErrors?.novaSenha} labelProps={{ className: "text-sm font-medium text-navy-100" }}>
            <Input id="novaSenha" name="novaSenha" type="password" required autoComplete="new-password" />
          </Field>

          <Field
            label="Confirmar nova senha"
            htmlFor="confirmarSenha"
            error={state.fieldErrors?.confirmarSenha}
            labelProps={{ className: "text-sm font-medium text-navy-100" }}
          >
            <Input id="confirmarSenha" name="confirmarSenha" type="password" required autoComplete="new-password" />
          </Field>

          {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}

          <Button type="submit" variant="secondary" disabled={isPending} className="mt-2 w-full">
            {isPending ? "A guardar..." : "Guardar e entrar novamente"}
          </Button>
        </form>
      </div>
    </main>
  );
}
