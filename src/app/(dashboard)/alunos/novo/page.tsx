"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createAlunoAction, type CreateAlunoState } from "@/actions/alunos";

const initialState: CreateAlunoState = {};

const CURSOS = ["Engenharia Informática", "Gestão de Empresas"];

export default function NovoAlunoPage() {
  const [state, formAction, isPending] = useActionState(createAlunoAction, initialState);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/alunos" className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-700">
          <ArrowLeft size={16} />
          Voltar para Alunos
        </Link>
        <h1 className="mt-2 text-xl font-bold text-navy-900">Nova Matrícula</h1>
      </div>

      <Card className="max-w-2xl">
        <CardHeader title="Dados do Aluno" />
        <CardBody>
          <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome completo" htmlFor="nome" error={state.fieldErrors?.nome}>
              <Input id="nome" name="nome" required placeholder="Ex: Marta Kiala" />
            </Field>

            <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
              <Input id="email" name="email" type="email" required placeholder="marta.kiala@aluno.ispc.ao" />
            </Field>

            <Field label="Telefone" htmlFor="telefone" error={state.fieldErrors?.telefone}>
              <Input id="telefone" name="telefone" required placeholder="923 000 000" />
            </Field>

            <Field label="Data de nascimento" htmlFor="dataNascimento" error={state.fieldErrors?.dataNascimento}>
              <Input id="dataNascimento" name="dataNascimento" type="date" required />
            </Field>

            <Field label="Género" htmlFor="genero" error={state.fieldErrors?.genero}>
              <Select id="genero" name="genero" required defaultValue="Feminino">
                <option value="Feminino">Feminino</option>
                <option value="Masculino">Masculino</option>
              </Select>
            </Field>

            <Field label="Curso" htmlFor="curso" error={state.fieldErrors?.curso}>
              <Select id="curso" name="curso" required defaultValue={CURSOS[0]}>
                {CURSOS.map((curso) => (
                  <option key={curso} value={curso}>
                    {curso}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Ano de ingresso" htmlFor="anoIngresso" error={state.fieldErrors?.anoIngresso}>
              <Input id="anoIngresso" name="anoIngresso" type="number" required defaultValue={new Date().getFullYear()} />
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
        </CardBody>
      </Card>
    </div>
  );
}
