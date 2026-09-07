"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { aplicarMonografiaATodosOsCursosAction } from "@/actions/admin";

const initialState: { error?: string; sucesso?: string } = {};

interface DisciplinaOpcao {
  id: string;
  nome: string;
  /** Curso onde foi criada — só para o DAAC saber qual é qual quando há nomes parecidos. */
  cursoOrigem: string;
  /** Já serve de monografia nalgum curso — é a escolha natural, e vem primeiro na lista. */
  jaEMonografia: boolean;
}

interface MonografiaTodosOsCursosProps {
  disciplinas: DisciplinaOpcao[];
  /** Cursos ainda sem monografia no último ano — a lista que este botão vai preencher. */
  cursosEmFalta: string[];
  totalCursos: number;
}

/**
 * Aplica a MESMA disciplina de monografia ao último ano de todos os cursos em falta
 * (§pedido do cliente 2026-09-07).
 *
 * O ponto é não haver uma "Monografia" por curso: a definição da disciplina fica única no sistema,
 * e o que se repete é a cadeira curricular de cada curso — que é o que tem de ser por curso, porque
 * é dela que pendem a turma, o professor e a pauta.
 */
export function MonografiaTodosOsCursos({ disciplinas, cursosEmFalta, totalCursos }: MonografiaTodosOsCursosProps) {
  const [state, formAction, isPending] = useActionState(aplicarMonografiaATodosOsCursosAction, initialState);

  // Nada em falta: uma linha de confirmação, sem controlo nenhum. Um botão que não tem o que fazer
  // é pior do que botão nenhum (§auditoria 2026-09-03).
  if (cursosEmFalta.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-texto-suave">
        <Check size={14} className="shrink-0 text-green-700" />
        Todos os {totalCursos} curso(s) têm monografia no último ano.
      </p>
    );
  }

  if (disciplinas.length === 0) {
    return (
      <p className="text-xs text-texto-suave">
        Para aplicar a monografia a todos os cursos, crie primeiro a disciplina em Disciplinas — uma só, partilhada
        por todos.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gold-200 bg-gold-50 px-4 py-3">
      <p className="text-xs text-gold-800">
        <strong>
          {cursosEmFalta.length} de {totalCursos} curso(s) ainda não têm monografia no último ano:
        </strong>{" "}
        {cursosEmFalta.join(", ")}. Aplique a mesma disciplina a todos — assim não fica uma
        &quot;Monografia&quot; repetida por curso.
      </p>
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <Select name="disciplinaId" required defaultValue={disciplinas[0]?.id} className="py-1 text-xs">
          {disciplinas.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome} — {d.cursoOrigem}
              {d.jaEMonografia ? " (já é monografia)" : ""}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" disabled={isPending} className="px-3 py-1.5 text-xs">
          {isPending ? "A aplicar..." : `Aplicar aos ${cursosEmFalta.length} em falta`}
        </Button>
      </form>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.sucesso ? <p className="text-xs text-green-700">{state.sucesso}</p> : null}
    </div>
  );
}
