"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createCadeiraCurricularAction, type CreateCadeiraCurricularState } from "@/actions/admin";

const initialState: CreateCadeiraCurricularState = {};

interface Opcao {
  id: string;
  nome: string;
  /**
   * Nome do curso onde a disciplina foi criada, quando NÃO é este — a partilha fica visível na
   * própria opção, para o DAAC não escolher "Matemática I" sem reparar que é a de Gestão.
   * `null` nas do próprio curso, que são a maioria e não precisam de anotação.
   */
  cursoOrigem: string | null;
}

interface CreateCadeiraCurricularFormProps {
  cursoId: string;
  disciplinas: Opcao[];
  /** Duração do curso — limita os anos oferecidos: um curso de 3 anos não tem 4º ano. */
  duracaoAnos: number;
}

export function CreateCadeiraCurricularForm({ cursoId, disciplinas, duracaoAnos }: CreateCadeiraCurricularFormProps) {
  const [state, formAction, isPending] = useActionState(createCadeiraCurricularAction, initialState);
  const anosDisponiveis = Array.from({ length: duracaoAnos }, (_, i) => i + 1);
  // §pedido do cliente 2026-09-05: a monografia dura o ano inteiro, não "pertence" a um semestre —
  // por isso não faz sentido perguntar qual. A Server Action força semestre=1 quando eMonografia,
  // de qualquer forma (nunca confia só neste hidden input); aqui é só para não mostrar uma pergunta
  // sem resposta certa.
  const [eMonografia, setEMonografia] = useState(state.values?.eMonografia === "true");

  // As do próprio curso primeiro: são o caso normal, e enterrá-las no meio das dos outros cursos
  // tornaria mais lento o que se faz todos os dias para facilitar o que se faz de vez em quando.
  const doCurso = disciplinas.filter((d) => d.cursoOrigem === null);
  const deOutrosCursos = disciplinas.filter((d) => d.cursoOrigem !== null);

  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={formAction}
      className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end"
    >
      <input type="hidden" name="cursoId" value={cursoId} />
      <Field label="Disciplina" htmlFor="cc-disciplina" error={state.fieldErrors?.disciplinaId}>
        <Select id="cc-disciplina" name="disciplinaId" required defaultValue={state.values?.disciplinaId}>
          {doCurso.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
          {deOutrosCursos.length > 0 ? (
            <optgroup label="De outros cursos (partilhada)">
              {deOutrosCursos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome} — {d.cursoOrigem}
                </option>
              ))}
            </optgroup>
          ) : null}
        </Select>
      </Field>
      <Field label="Ano curricular" htmlFor="cc-ano" error={state.fieldErrors?.anoCurricular}>
        <Select id="cc-ano" name="anoCurricular" required defaultValue={state.values?.anoCurricular ?? "1"}>
          {anosDisponiveis.map((ano) => (
            <option key={ano} value={ano}>
              {ano}º Ano
            </option>
          ))}
        </Select>
      </Field>
      {eMonografia ? (
        // Sem seletor de semestre: o valor seria arbitrário, e mostrar um choice que não muda nada
        // ensinaria o DAAC a decidir algo que não existe.
        <>
          <input type="hidden" name="semestre" value="1" />
          <div className="text-xs text-texto-suave sm:pb-2.5">Semestre: <strong>não se aplica</strong> — dura o ano inteiro.</div>
        </>
      ) : (
        <Field label="Semestre" htmlFor="cc-semestre" error={state.fieldErrors?.semestre}>
          <Select id="cc-semestre" name="semestre" required defaultValue={state.values?.semestre ?? "1"}>
            <option value="1">1º Semestre</option>
            <option value="2">2º Semestre</option>
          </Select>
        </Field>
      )}
      {/* Select e não checkbox, como em EditarRegrasCadeiraCurricular: a caixa não marcada não é
          enviada no FormData, e o valor ficaria indistinguível de "campo em falta". */}
      <Field label="Tipo" htmlFor="cc-monografia" error={state.fieldErrors?.eMonografia}>
        <Select
          id="cc-monografia"
          name="eMonografia"
          required
          defaultValue={state.values?.eMonografia ?? "false"}
          onChange={(e) => setEMonografia(e.target.value === "true")}
        >
          <option value="false">Cadeira normal</option>
          <option value="true">Monografia (defesa)</option>
        </Select>
      </Field>
      {state.error ? <p className="sm:col-span-5 text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "A adicionar..." : "Adicionar ao plano"}
      </Button>
    </form>
  );
}
