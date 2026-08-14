"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, KeyRound } from "lucide-react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { DateSelect } from "@/components/ui/DateSelect";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Table";
import { createAlunoAction, type CreateAlunoState } from "@/actions/alunos";

const initialState: CreateAlunoState = {};

interface TurmaOption {
  id: string;
  label: string;
}

interface NovoAlunoFormProps {
  turmas: TurmaOption[];
}

export function NovoAlunoForm({ turmas }: NovoAlunoFormProps) {
  const [state, formAction, isPending] = useActionState(createAlunoAction, initialState);

  if (state.success) {
    return (
      <Card className="max-w-2xl">
        <CardHeader title="Aluno matriculado com sucesso" />
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-lg bg-navy-50 px-4 py-3">
            <CheckCircle2 className="mt-0.5 shrink-0 text-navy-700" size={18} />
            <div className="text-sm text-navy-700">
              <p className="font-medium">{state.success.nome}</p>
              <p className="text-navy-500">Nº de estudante: {state.success.numeroEstudante}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-gold-300 bg-gold-50 px-4 py-3">
            <KeyRound className="mt-0.5 shrink-0 text-gold-600" size={18} />
            <div className="text-sm">
              <p className="font-semibold text-navy-800">Credenciais de acesso (mostradas apenas agora)</p>
              <p className="mt-1 text-navy-600">
                Login: <span className="font-mono">{state.success.numeroEstudante}</span>
                {state.success.email ? (
                  <>
                    {" "}
                    ou <span className="font-mono">{state.success.email}</span>
                  </>
                ) : null}
              </p>
              <p className="text-navy-600">
                Senha temporária: <span className="font-mono font-semibold">{state.success.senhaTemporaria}</span>
              </p>
              <p className="mt-2 text-xs text-navy-400">
                Anote e comunique esta senha ao aluno agora — não será possível consultá-la de novo depois de sair
                desta página.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Link href="/alunos/novo">
              <Button type="button" variant="ghost">
                Matricular outro aluno
              </Button>
            </Link>
            <Link href={`/alunos/${state.success.alunoId}`}>
              <Button type="button">Ver ficha do aluno</Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader title="Dados do Aluno" />
      <CardBody>
        {turmas.length === 0 ? (
          <EmptyState message="Nenhuma turma cadastrada. Crie uma turma primeiro em Admin > Turmas para poder matricular alunos." />
        ) : (
          <form
            key={JSON.stringify(state.values ?? {})}
            action={formAction}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <Field label="Nome completo" htmlFor="nome" error={state.fieldErrors?.nome}>
              <Input id="nome" name="nome" required placeholder="Ex: Marta Kiala" defaultValue={state.values?.nome} />
            </Field>

            <Field label="Email (opcional)" htmlFor="email" error={state.fieldErrors?.email}>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="marta.kiala@aluno.ispc.ao"
                defaultValue={state.values?.email}
              />
            </Field>

            <Field label="Telefone (opcional)" htmlFor="telefone" error={state.fieldErrors?.telefone}>
              <PhoneInput id="telefone" name="telefone" defaultValue={state.values?.telefone} />
            </Field>

            <Field label="Data de nascimento" htmlFor="dataNascimento" error={state.fieldErrors?.dataNascimento}>
              <DateSelect
                name="dataNascimento"
                maxYear={new Date().getFullYear() - 15}
                defaultValue={state.values?.dataNascimento}
              />
            </Field>

            <Field label="Género" htmlFor="genero" error={state.fieldErrors?.genero}>
              <Select id="genero" name="genero" required defaultValue={state.values?.genero ?? "Feminino"}>
                <option value="Feminino">Feminino</option>
                <option value="Masculino">Masculino</option>
              </Select>
            </Field>

            <Field label="Categoria do estudante" htmlFor="categoria" error={state.fieldErrors?.categoria}>
              <Select id="categoria" name="categoria" defaultValue={state.values?.categoria ?? "NORMAL"}>
                <option value="NORMAL">Normal</option>
                <option value="BOLSEIRO_INAGBE">Bolseiro INAGBE</option>
                <option value="COMPARTICIPADA">Comparticipada</option>
              </Select>
            </Field>

            <Field label="Turma" htmlFor="turmaId" error={state.fieldErrors?.turmaId}>
              <Select id="turmaId" name="turmaId" required defaultValue={state.values?.turmaId ?? turmas[0]?.id}>
                {turmas.map((turma) => (
                  <option key={turma.id} value={turma.id}>
                    {turma.label}
                  </option>
                ))}
              </Select>
            </Field>

            {state.error ? <p className="sm:col-span-2 text-sm text-red-600">{state.error}</p> : null}

            <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
              <Link href="/alunos">
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </Link>
              <Button type="submit" disabled={isPending}>
                {isPending ? "A guardar..." : "Guardar aluno"}
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
