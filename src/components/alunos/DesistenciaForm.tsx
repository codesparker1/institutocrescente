"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  marcarDesistenteAction,
  reativarDesistenteAction,
  type MarcarDesistenteState,
  type ReativarDesistenteState,
} from "@/actions/academico";

interface DesistenciaFormProps {
  alunoId: string;
  /** Estado atual do aluno (AlunoStatus) — decide que formulário mostrar. */
  status: "ATIVO" | "TRANCADO" | "FORMADO" | "DESISTENTE";
  /** ADMIN ou DAAC — pode marcar a desistência. */
  podeMarcar: boolean;
  /** Só a ADMIN reativa um desistente (§decisão do cliente 2026-08-25). */
  podeReativar: boolean;
}

/**
 * Desistência na ficha do aluno:
 * - ATIVO + ADMIN/DAAC → formulário de desistência com motivo obrigatório;
 * - DESISTENTE + ADMIN → botão de reativação (volta a ATIVO, sem matricular em nada);
 * - qualquer outro caso → nada (FORMADO/TRANCADO não desistem; SECRETARIA não vê nada).
 * A confirmação é feita pelo browser (confirm) antes do submit — ação irreversível
 * sem passar pela reativação.
 */
export function DesistenciaForm({ alunoId, status, podeMarcar, podeReativar }: DesistenciaFormProps) {
  const [estadoDesistencia, actionDesistencia, pendenteDesistencia] = useActionState(marcarDesistenteAction, {});
  const [estadoReativacao, actionReativacao, pendenteReativacao] = useActionState(reativarDesistenteAction, {});

  if (status === "ATIVO" && podeMarcar) {
    return (
      <form
        action={actionDesistencia}
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          if (!window.confirm("Marcar este aluno como DESISTENTE? A matrícula fecha e o regresso só é possível por reativação da ADMIN.")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="alunoId" value={alunoId} />
        <label htmlFor={`motivo-${alunoId}`} className="text-xs font-medium text-navy-600">
          Motivo da desistência (obrigatório)
        </label>
        <textarea
          id={`motivo-${alunoId}`}
          name="motivo"
          required
          minLength={3}
          maxLength={500}
          rows={2}
          placeholder="Ex.: abandonou as aulas e deixou de responder aos contactos"
          className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pendenteDesistencia}
          className="self-start rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
        >
          {pendenteDesistencia ? "A processar..." : "Marcar como Desistente"}
        </button>
        {estadoDesistencia.error ? <p className="text-sm text-red-600">{estadoDesistencia.error}</p> : null}
        {estadoDesistencia.resultado ? (
          <p className="flex items-start gap-1.5 text-sm text-green-700">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            {estadoDesistencia.resultado}
          </p>
        ) : null}
      </form>
    );
  }

  if (status === "DESISTENTE" && podeReativar) {
    return (
      <form
        action={actionReativacao}
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          if (!window.confirm("Reativar este aluno? Ele volta a ATIVO (sem turma/inscrições) e poderá ser rematriculado.")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="alunoId" value={alunoId} />
        <button
          type="submit"
          disabled={pendenteReativacao}
          className="self-start rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800 disabled:opacity-60"
        >
          {pendenteReativacao ? "A processar..." : "Reativar Aluno"}
        </button>
        {estadoReativacao.error ? <p className="text-sm text-red-600">{estadoReativacao.error}</p> : null}
        {estadoReativacao.resultado ? (
          <p className="flex items-start gap-1.5 text-sm text-green-700">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            {estadoReativacao.resultado}
          </p>
        ) : null}
      </form>
    );
  }

  if (status === "DESISTENTE" && !podeReativar) {
    return <p className="text-xs text-navy-400">Aluno desistente — a reativação é um poder exclusivo da ADMIN.</p>;
  }

  return null;
}
