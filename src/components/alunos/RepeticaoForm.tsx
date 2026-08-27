"use client";

import { useMemo, useState, useActionState } from "react";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { criarTentativaRepeticaoAction, type CriarTentativaRepeticaoState } from "@/actions/curriculo";
import { nomeProfessor } from "@/lib/utils";

const initialState: CriarTentativaRepeticaoState = {};

interface CadeiraAtiva {
  cadeiraCurricularId: string;
  disciplinaNome: string;
}

interface Oferta {
  id: string;
  cadeiraCurricularId: string;
  disciplina: { nome: string };
  professor: { nome: string } | null;
  turma: { anoCurricular: number; curso: { nome: string } };
}

interface RepeticaoFormProps {
  alunoId: string;
  cadeirasAtivas: CadeiraAtiva[];
  ofertas: Oferta[];
}

export function RepeticaoForm({ alunoId, cadeirasAtivas, ofertas }: RepeticaoFormProps) {
  const [state, formAction, isPending] = useActionState(criarTentativaRepeticaoAction, initialState);
  const cadeirasUnicas = useMemo(() => {
    const vistas = new Set<string>();
    return cadeirasAtivas.filter((c) => {
      if (vistas.has(c.cadeiraCurricularId)) return false;
      vistas.add(c.cadeiraCurricularId);
      return true;
    });
  }, [cadeirasAtivas]);

  const [cadeiraSelecionada, setCadeiraSelecionada] = useState(cadeirasUnicas[0]?.cadeiraCurricularId ?? "");
  const ofertasDaCadeira = ofertas.filter((o) => o.cadeiraCurricularId === cadeiraSelecionada);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
      <input type="hidden" name="alunoId" value={alunoId} />
      <input type="hidden" name="cadeiraCurricularId" value={cadeiraSelecionada} />

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-navy-500">Cadeira</label>
        <Select value={cadeiraSelecionada} onChange={(e) => setCadeiraSelecionada(e.target.value)}>
          {cadeirasUnicas.map((c) => (
            <option key={c.cadeiraCurricularId} value={c.cadeiraCurricularId}>
              {c.disciplinaNome}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className="text-xs font-medium text-navy-500">Turma de destino</label>
        <Select name="turmaDisciplinaId" required disabled={ofertasDaCadeira.length === 0}>
          {ofertasDaCadeira.length === 0 ? (
            <option value="">Sem outras turmas a lecionar esta cadeira</option>
          ) : (
            ofertasDaCadeira.map((o) => (
              <option key={o.id} value={o.id}>
                {o.turma.curso.nome} · {o.turma.anoCurricular}º Ano · {nomeProfessor(o.professor)}
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
