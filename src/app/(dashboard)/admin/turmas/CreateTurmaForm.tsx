"use client";

import { useActionState, useState } from "react";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createTurmaAction, type CreateTurmaState } from "@/actions/admin";

const initialState: CreateTurmaState = {};

interface CursoOption {
  id: string;
  nome: string;
  duracaoAnos: number;
}

interface CreateTurmaFormProps {
  cursos: CursoOption[];
  /** Ano letivo corrente (getAgora no servidor) — não se criam turmas para anos já passados. */
  anoLetivoMinimo: number;
}

export function CreateTurmaForm({ cursos, anoLetivoMinimo }: CreateTurmaFormProps) {
  const [state, formAction, isPending] = useActionState(createTurmaAction, initialState);
  // O curso é escolhido dentro deste formulário, por isso os anos oferecidos têm de reagir à
  // seleção: um curso de 3 anos não oferece 4º ano.
  const [cursoIdSelecionado, setCursoIdSelecionado] = useState(state.values?.cursoId ?? cursos[0]?.id ?? "");
  const [anoCurricular, setAnoCurricular] = useState(state.values?.anoCurricular ?? "1");
  const cursoSelecionado = cursos.find((c) => c.id === cursoIdSelecionado) ?? cursos[0];
  const duracaoAnos = cursoSelecionado?.duracaoAnos ?? 1;
  const anosDisponiveis = Array.from({ length: duracaoAnos }, (_, i) => i + 1);
  // Trocar para um curso mais curto pode deixar o ano escolhido fora da lista (5º Ano num curso de
  // 3 anos) — derivado durante o render, sem efeito: o valor exibido cai para o último ano válido.
  const anoValido = anosDisponiveis.includes(Number(anoCurricular)) ? anoCurricular : String(duracaoAnos);

  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={formAction}
      className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end"
    >
      <Field label="Curso" htmlFor="turma-curso" error={state.fieldErrors?.cursoId}>
        <Select
          id="turma-curso"
          name="cursoId"
          required
          value={cursoIdSelecionado}
          onChange={(e) => setCursoIdSelecionado(e.target.value)}
        >
          {cursos.map((curso) => (
            <option key={curso.id} value={curso.id}>
              {curso.nome}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ano curricular" htmlFor="turma-anocurricular" error={state.fieldErrors?.anoCurricular}>
        <Select
          id="turma-anocurricular"
          name="anoCurricular"
          required
          value={anoValido}
          onChange={(e) => setAnoCurricular(e.target.value)}
        >
          {anosDisponiveis.map((ano) => (
            <option key={ano} value={ano}>
              {ano}º Ano
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Período" htmlFor="turma-periodo" error={state.fieldErrors?.periodo}>
        <Select id="turma-periodo" name="periodo" required defaultValue={state.values?.periodo ?? "MATUTINO"}>
          <option value="MATUTINO">Matutino</option>
          <option value="VESPERTINO">Vespertino</option>
          <option value="NOTURNO">Noturno</option>
        </Select>
      </Field>
      <Field label="Ano letivo (ano de início — ex.: 2026 = 2026/2027)" htmlFor="turma-ano" error={state.fieldErrors?.anoLetivo}>
        <Input
          id="turma-ano"
          name="anoLetivo"
          type="number"
          required
          min={anoLetivoMinimo}
          defaultValue={state.values?.anoLetivo ?? anoLetivoMinimo}
        />
      </Field>
      {state.error ? <p className="sm:col-span-5 text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "A criar..." : "Criar turma"}
      </Button>
    </form>
  );
}
