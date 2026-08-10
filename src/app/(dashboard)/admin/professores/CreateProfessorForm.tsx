"use client";

import { useActionState } from "react";
import { CheckCircle2, KeyRound } from "lucide-react";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createProfessorAction, type CreateProfessorState } from "@/actions/admin";

const initialState: CreateProfessorState = {};

export function CreateProfessorForm() {
  const [state, formAction, isPending] = useActionState(createProfessorAction, initialState);

  if (state.success) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3 rounded-lg bg-navy-50 px-4 py-3">
          <CheckCircle2 className="mt-0.5 shrink-0 text-navy-700" size={18} />
          <p className="text-sm font-medium text-navy-700">{state.success.nome} adicionado com sucesso.</p>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-gold-300 bg-gold-50 px-4 py-3">
          <KeyRound className="mt-0.5 shrink-0 text-gold-600" size={18} />
          <div className="text-sm">
            <p className="font-semibold text-navy-800">Credenciais de acesso (mostradas apenas agora)</p>
            <p className="mt-1 text-navy-600">
              Email: <span className="font-mono">{state.success.email}</span>
            </p>
            <p className="text-navy-600">
              Senha temporária: <span className="font-mono font-semibold">{state.success.senhaTemporaria}</span>
            </p>
            <p className="mt-2 text-xs text-navy-400">
              Anote e comunique esta senha ao professor agora — não será possível consultá-la de novo depois de sair
              desta página.
            </p>
          </div>
        </div>
        <div>
          <Button type="button" variant="ghost" onClick={() => window.location.reload()}>
            Adicionar outro professor
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end">
      <Field label="Nome" htmlFor="prof-nome" error={state.fieldErrors?.nome}>
        <Input id="prof-nome" name="nome" required placeholder="Eng. Carlos Neto" />
      </Field>
      <Field label="Email" htmlFor="prof-email" error={state.fieldErrors?.email}>
        <Input id="prof-email" name="email" type="email" required placeholder="carlos.neto@ispc.ao" />
      </Field>
      <Field label="Telefone" htmlFor="prof-telefone" error={state.fieldErrors?.telefone}>
        <Input id="prof-telefone" name="telefone" required placeholder="923 000 000" />
      </Field>
      <Field label="Especialidade" htmlFor="prof-especialidade" error={state.fieldErrors?.especialidade}>
        <Input id="prof-especialidade" name="especialidade" required placeholder="Engenharia Civil" />
      </Field>
      {state.error ? <p className="sm:col-span-5 text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "A adicionar..." : "Adicionar"}
      </Button>
    </form>
  );
}
