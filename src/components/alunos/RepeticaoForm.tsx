"use client";

import { useState, useActionState } from "react";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { criarTentativaRepeticaoAction, type CriarTentativaRepeticaoState } from "@/actions/curriculo";

const initialState: CriarTentativaRepeticaoState = {};

interface CadeiraRepetivel {
  cadeiraCurricularId: string;
  disciplinaNome: string;
}

interface Oferta {
  id: string;
  cadeiraCurricularId: string;
  disciplina: { nome: string };
  turma: { anoCurricular: number; curso: { nome: string } };
}

interface RepeticaoFormProps {
  alunoId: string;
  /** Só as cadeiras REPROVADAS — ver a nota em alunos/[id]/page.tsx. */
  cadeiras: CadeiraRepetivel[];
  /** Só do ano letivo atual — ver a mesma nota. */
  ofertas: Oferta[];
}

export function RepeticaoForm({ alunoId, cadeiras, ofertas }: RepeticaoFormProps) {
  const [state, formAction, isPending] = useActionState(criarTentativaRepeticaoAction, initialState);
  const [cadeiraSelecionada, setCadeiraSelecionada] = useState(cadeiras[0]?.cadeiraCurricularId ?? "");
  const ofertasDaCadeira = ofertas.filter((o) => o.cadeiraCurricularId === cadeiraSelecionada);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
      <input type="hidden" name="alunoId" value={alunoId} />
      <input type="hidden" name="cadeiraCurricularId" value={cadeiraSelecionada} />

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-texto">Cadeira reprovada</label>
        <Select value={cadeiraSelecionada} onChange={(e) => setCadeiraSelecionada(e.target.value)}>
          {cadeiras.map((c) => (
            <option key={c.cadeiraCurricularId} value={c.cadeiraCurricularId}>
              {c.disciplinaNome}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className="text-xs font-medium text-texto">Turma de destino (ano letivo atual)</label>
        <Select name="turmaDisciplinaId" required disabled={ofertasDaCadeira.length === 0}>
          {ofertasDaCadeira.length === 0 ? (
            <option value="">Sem turma a lecionar esta cadeira no ano letivo atual</option>
          ) : (
            ofertasDaCadeira.map((o) => (
              <option key={o.id} value={o.id}>
                {o.turma.curso.nome} · {o.turma.anoCurricular}º Ano
              </option>
            ))
          )}
        </Select>
      </div>

      <Button type="submit" disabled={isPending || ofertasDaCadeira.length === 0}>
        {isPending ? "A inscrever..." : "Repetir cadeira"}
      </Button>

      {state.error ? <p className="sm:col-span-4 text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
