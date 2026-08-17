"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { criarReclamacaoAction, type CriarReclamacaoState } from "@/actions/reclamacoes";

const initialState: CriarReclamacaoState = {};

export function ReclamacaoForm() {
  const [state, formAction, isPending] = useActionState(criarReclamacaoAction, initialState);

  return (
    <form key={JSON.stringify(state.values ?? {})} action={formAction} className="flex flex-col gap-4">
      <Field label="Categoria" htmlFor="categoria" error={state.fieldErrors?.categoria}>
        <Select id="categoria" name="categoria" defaultValue={state.values?.categoria ?? "SUGESTAO"}>
          <option value="SUGESTAO">Sugestão de melhoria</option>
          <option value="RECLAMACAO">Reclamação</option>
          <option value="PROBLEMA_TECNICO">Problema técnico</option>
          <option value="OUTRO">Outro</option>
        </Select>
      </Field>

      <Field label="Assunto" htmlFor="assunto" error={state.fieldErrors?.assunto}>
        <Input id="assunto" name="assunto" required defaultValue={state.values?.assunto} placeholder="Resuma em poucas palavras" />
      </Field>

      <Field label="Mensagem" htmlFor="mensagem" error={state.fieldErrors?.mensagem}>
        <textarea
          id="mensagem"
          name="mensagem"
          required
          rows={5}
          defaultValue={state.values?.mensagem}
          placeholder="Descreva com detalhe — quanto mais contexto, mais fácil é ajudar."
          className="rounded-lg border border-navy-100 bg-white px-3 py-2 text-sm text-navy-900 placeholder:text-navy-300 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100"
        />
      </Field>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      {state.success ? (
        <p className="flex items-center gap-1.5 text-sm text-green-700">
          <CheckCircle2 size={16} />
          Enviado. Obrigado pelo feedback.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
      >
        {isPending ? "A enviar..." : "Enviar"}
      </button>
    </form>
  );
}
