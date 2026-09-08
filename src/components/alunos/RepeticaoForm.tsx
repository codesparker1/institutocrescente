"use client";

import { useState, useActionState } from "react";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { criarTentativaRepeticaoAction, type CriarTentativaRepeticaoState } from "@/actions/curriculo";
import { formatAnoLetivo, nomeProfessor } from "@/lib/utils";

const initialState: CriarTentativaRepeticaoState = {};

interface CadeiraRepetivel {
  cadeiraCurricularId: string;
  disciplinaNome: string;
  /** Estado da tentativa mais recente ("Reprovado", "Em curso", ...) — mostrado ao lado do nome. */
  estadoLabel: string;
  reprovada: boolean;
}

interface Oferta {
  id: string;
  cadeiraCurricularId: string;
  disciplina: { nome: string };
  professor: { nome: string } | null;
  turma: { anoCurricular: number; anoLetivo: number; curso: { nome: string } };
}

interface RepeticaoFormProps {
  alunoId: string;
  /** Já vem sem duplicados e com as reprovadas primeiro — ver a nota em alunos/[id]/page.tsx. */
  cadeiras: CadeiraRepetivel[];
  ofertas: Oferta[];
}

export function RepeticaoForm({ alunoId, cadeiras, ofertas }: RepeticaoFormProps) {
  const [state, formAction, isPending] = useActionState(criarTentativaRepeticaoAction, initialState);
  const [cadeiraSelecionada, setCadeiraSelecionada] = useState(cadeiras[0]?.cadeiraCurricularId ?? "");
  const ofertasDaCadeira = ofertas.filter((o) => o.cadeiraCurricularId === cadeiraSelecionada);

  // Dois grupos, e não uma lista corrida: o motivo normal de vir aqui é uma cadeira reprovada, e a
  // separação evita escolher uma cadeira em curso por engano quando as duas se chamam parecido.
  const reprovadas = cadeiras.filter((c) => c.reprovada);
  const outras = cadeiras.filter((c) => !c.reprovada);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
      <input type="hidden" name="alunoId" value={alunoId} />
      <input type="hidden" name="cadeiraCurricularId" value={cadeiraSelecionada} />

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-texto">Cadeira</label>
        <Select value={cadeiraSelecionada} onChange={(e) => setCadeiraSelecionada(e.target.value)}>
          {reprovadas.length > 0 ? (
            <optgroup label="Reprovadas">
              {reprovadas.map((c) => (
                <option key={c.cadeiraCurricularId} value={c.cadeiraCurricularId}>
                  {c.disciplinaNome}
                </option>
              ))}
            </optgroup>
          ) : null}
          {outras.length > 0 ? (
            <optgroup label="Outras cadeiras do percurso">
              {outras.map((c) => (
                <option key={c.cadeiraCurricularId} value={c.cadeiraCurricularId}>
                  {c.disciplinaNome} — {c.estadoLabel}
                </option>
              ))}
            </optgroup>
          ) : null}
        </Select>
      </div>

      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className="text-xs font-medium text-texto">Turma de destino</label>
        <Select name="turmaDisciplinaId" required disabled={ofertasDaCadeira.length === 0}>
          {ofertasDaCadeira.length === 0 ? (
            <option value="">Sem outras turmas a lecionar esta cadeira</option>
          ) : (
            ofertasDaCadeira.map((o) => (
              <option key={o.id} value={o.id}>
                {formatAnoLetivo(o.turma.anoLetivo)} · {o.turma.curso.nome} · {o.turma.anoCurricular}º Ano ·{" "}
                {nomeProfessor(o.professor)}
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
