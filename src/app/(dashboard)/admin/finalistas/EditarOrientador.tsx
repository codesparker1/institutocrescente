"use client";

import { useActionState } from "react";
import { Select } from "@/components/ui/Select";
import { atribuirOrientadorAction } from "@/actions/admin";

const initialState: { error?: string } = {};

interface OpcaoProfessor {
  id: string;
  nome: string;
  /** Quantas monografias ativas já orienta — mostrado na opção para o DAAC ver a carga antes de escolher. */
  orientandos: number;
}

interface EditarOrientadorProps {
  inscricaoId: string;
  /** null enquanto ninguém tiver sido atribuído. */
  orientadorAtualId: string | null;
  professores: OpcaoProfessor[];
  /** 0 = sem limite. Só serve para o rótulo "3/5"; quem valida é a Server Action. */
  limite: number;
}

/**
 * Seletor de orientador, um por linha da página Finalistas (§pedido do cliente 2026-09-04).
 * Mesmo molde de EditarProfessorTurmaDisciplina: form não-controlado com defaultValue, erro
 * inline, tudo desativado enquanto grava.
 */
export function EditarOrientador({ inscricaoId, orientadorAtualId, professores, limite }: EditarOrientadorProps) {
  const [state, formAction, isPending] = useActionState(atribuirOrientadorAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="inscricaoId" value={inscricaoId} />
      <Select
        name="orientadorId"
        defaultValue={orientadorAtualId ?? ""}
        disabled={isPending}
        // Âmbar quando falta atribuir — o mesmo sinal de "por preencher" usado no seletor de
        // professor da turma.
        className={orientadorAtualId ? "py-1 text-xs" : "py-1 text-xs border-gold-300 bg-gold-50"}
      >
        <option value="">Sem orientador</option>
        {professores.map((professor) => {
          // Um professor no limite continua a aparecer, mas marcado: o DAAC vê logo porque é que
          // aquela escolha vai ser recusada, em vez de tentar e levar com o erro.
          const cheio = limite > 0 && professor.orientandos >= limite && professor.id !== orientadorAtualId;
          return (
            <option key={professor.id} value={professor.id} disabled={cheio}>
              {professor.nome} ({professor.orientandos}
              {limite > 0 ? `/${limite}` : ""}){cheio ? " — cheio" : ""}
            </option>
          );
        })}
      </Select>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-navy-700 px-2.5 py-1.5 text-xs font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
      >
        {isPending ? "..." : "Guardar"}
      </button>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
