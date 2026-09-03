"use client";

import { useActionState, useState } from "react";
import { IspcCrest } from "@/components/brand/IspcCrest";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { loginAction, type LoginState } from "@/actions/auth";
import { DemoAccountsPanel } from "./DemoAccountsPanel";

const initialState: LoginState = {};

interface LoginFormProps {
  callbackUrl: string;
}

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const [identificador, setIdentificador] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-12">
      <DemoAccountsPanel
        onSelect={(demoEmail, demoPassword) => {
          setIdentificador(demoEmail);
          setPassword(demoPassword);
        }}
      />

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <IspcCrest size={176} priority />
          <div>
            <h1 className="text-lg font-bold tracking-wide text-gold-300">ISPC</h1>
            <p className="text-xs uppercase tracking-wider text-texto-suave">
              Instituto Superior Politécnico Crescente
            </p>
          </div>
        </div>

        <form
          action={(formData) => {
            // O FormData já foi serializado neste ponto, por isso limpar a senha aqui é seguro:
            // numa tentativa falhada o email fica preenchido e só a senha é reintroduzida.
            formAction(formData);
            setPassword("");
          }}
          className="flex flex-col gap-4 rounded-xl border border-navy-800 bg-navy-900 p-6 shadow-xl"
        >
          <input type="hidden" name="callbackUrl" value={callbackUrl} />

          <Field
            label="Email ou nº de estudante"
            htmlFor="identificador"
            labelProps={{ className: "text-sm font-medium text-navy-100" }}
          >
            <Input
              id="identificador"
              name="identificador"
              type="text"
              required
              placeholder="secretaria@ispc.ao ou ISPC2026-0001"
              autoComplete="username"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
            />
          </Field>

          <Field label="Senha" htmlFor="password" labelProps={{ className: "text-sm font-medium text-navy-100" }}>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}

          <Button type="submit" variant="secondary" disabled={isPending} className="mt-2 w-full">
            {isPending ? "A entrar..." : "Entrar"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-texto-suave">
          Acesso reservado à comunidade académica do ISPC.
        </p>
      </div>
    </main>
  );
}
