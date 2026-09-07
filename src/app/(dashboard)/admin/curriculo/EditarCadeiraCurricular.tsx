"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { atualizarCadeiraCurricularAction } from "@/actions/admin";

const initialState: { error?: string } = {};

interface EditarCadeiraCurricularProps {
  cadeiraCurricularId: string;
  anoCurricular: number;
  semestre: number;
  eMonografia: boolean;
  permiteDispensa: boolean;
  notaMinimaDispensa: number;
  /** Duração do curso — um curso de 3 anos não pode ter uma cadeira no 4º ano. */
  duracaoAnos: number;
}

/**
 * Edição em linha da cadeira do plano curricular: ano, semestre, tipo e regras de dispensa
 * (§pedido do cliente 2026-09-07). Antes só as regras eram editáveis, e corrigir o ano obrigava a
 * apagar a cadeira — impossível assim que ela chegava às turmas.
 *
 * Os selects mostram o valor atual: não há colunas separadas a repeti-lo. O que se lê é o que está
 * gravado, e é onde se corrige.
 */
export function EditarCadeiraCurricular({
  cadeiraCurricularId,
  anoCurricular,
  semestre,
  eMonografia,
  permiteDispensa,
  notaMinimaDispensa,
  duracaoAnos,
}: EditarCadeiraCurricularProps) {
  const [state, formAction, isPending] = useActionState(atualizarCadeiraCurricularAction, initialState);
  // Espelha o select do tipo para esconder o semestre numa monografia — a Server Action força
  // semestre=1 de qualquer forma, isto é só para não mostrar uma pergunta sem resposta certa.
  const [monografia, setMonografia] = useState(eMonografia);
  const anos = Array.from({ length: duracaoAnos }, (_, i) => i + 1);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="cadeiraCurricularId" value={cadeiraCurricularId} />
      {/* key em cada campo (§2026-09-06, mesma correção de EditarProfessorTurmaDisciplina): sem
          isto, ficavam parados no valor antigo depois de gravar. */}
      <Select
        key={`ano-${anoCurricular}`}
        name="anoCurricular"
        defaultValue={String(anoCurricular)}
        disabled={isPending}
        className="w-20 py-1 text-xs"
        title="Ano curricular"
      >
        {anos.map((ano) => (
          <option key={ano} value={ano}>
            {ano}º Ano
          </option>
        ))}
      </Select>
      {monografia ? (
        <>
          <input type="hidden" name="semestre" value="1" />
          <span className="text-xs text-texto-suave">Ano inteiro</span>
        </>
      ) : (
        <Select
          key={`sem-${semestre}`}
          name="semestre"
          defaultValue={String(semestre)}
          disabled={isPending}
          className="w-24 py-1 text-xs"
          title="Semestre"
        >
          <option value="1">1º Sem.</option>
          <option value="2">2º Sem.</option>
        </Select>
      )}
      <Select
        key={`tipo-${String(eMonografia)}`}
        name="eMonografia"
        defaultValue={String(eMonografia)}
        disabled={isPending}
        onChange={(e) => setMonografia(e.target.value === "true")}
        className="w-28 py-1 text-xs"
        title="Tipo de cadeira"
      >
        <option value="false">Normal</option>
        <option value="true">Monografia</option>
      </Select>
      <Select
        key={`disp-${String(permiteDispensa)}`}
        name="permiteDispensa"
        defaultValue={String(permiteDispensa)}
        disabled={isPending}
        className="w-28 py-1 text-xs"
        title="Regras de dispensa (§4.1.1)"
      >
        <option value="true">Com dispensa</option>
        <option value="false">Sem dispensa</option>
      </Select>
      <Input
        key={`nota-${notaMinimaDispensa}`}
        name="notaMinimaDispensa"
        type="number"
        min={0}
        max={20}
        step="0.5"
        defaultValue={notaMinimaDispensa}
        disabled={isPending}
        className="w-16 py-1 text-right text-xs"
        title="Nota mínima para dispensa"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-navy-700 px-2.5 py-1.5 text-xs font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
      >
        {isPending ? "..." : "Guardar"}
      </button>
      {state.error ? <p className="w-full text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
