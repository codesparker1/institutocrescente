"use client";

import { useActionState } from "react";
import { CheckCircle2, KeyRound } from "lucide-react";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createStaffUserAction, type CreateStaffState } from "@/actions/admin";

const initialState: CreateStaffState = {};

export function CreateStaffForm() {
  const [state, formAction, isPending] = useActionState(createStaffUserAction, initialState);

  if (state.success) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3 rounded-lg bg-navy-50 px-4 py-3">
          <CheckCircle2 className="mt-0.5 shrink-0 text-navy-700" size={18} />
          <p className="text-sm font-medium text-navy-700">{state.success.nome} adicionado(a) com sucesso.</p>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-gold-300 bg-gold-50 px-4 py-3">
          <KeyRound className="mt-0.5 shrink-0 text-gold-600" size={18} />
          <div className="text-sm">
            <p className="font-semibold text-navy-800">Credenciais de acesso</p>
            <p className="mt-1 text-navy-600">
              Email: <span className="font-mono">{state.success.email}</span>
            </p>
            <p className="text-navy-600">
              Senha inicial: <span className="font-mono font-semibold">{state.success.senhaTemporaria}</span> (obrigatório
              trocar no primeiro login)
            </p>
          </div>
        </div>
        <div>
          <Button type="button" variant="ghost" onClick={() => window.location.reload()}>
            Adicionar outra conta
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={formAction}
      className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end"
    >
      <Field label="Nome" htmlFor="staff-nome" error={state.fieldErrors?.nome}>
        <Input id="staff-nome" name="nome" required placeholder="Ana Paula Domingos" defaultValue={state.values?.nome} />
      </Field>
      <Field label="Email" htmlFor="staff-email" error={state.fieldErrors?.email}>
        <Input id="staff-email" name="email" type="email" required placeholder="ana.domingos@ispc.ao" defaultValue={state.values?.email} />
      </Field>
      <Field label="Papel" htmlFor="staff-role" error={state.fieldErrors?.role}>
        <Select id="staff-role" name="role" defaultValue={state.values?.role ?? "SECRETARIA"}>
          <option value="SECRETARIA">Secretaria</option>
          <option value="DAAC">DAAC</option>
        </Select>
      </Field>
      {state.error ? <p className="sm:col-span-4 text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "A adicionar..." : "Adicionar"}
      </Button>
    </form>
  );
}
