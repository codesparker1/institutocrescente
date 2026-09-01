"use client";

import { useActionState, useState } from "react";
import { Tr, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CelulaNota, COLUNAS_EPOCA, type NotaDeEpoca } from "@/components/notas/ColunasNotas";
import { rotuloEstado, toneEstado, type EstadoAvaliacao } from "@/lib/avaliacao";
import { guardarNotaHistoricaAction, type GuardarNotaHistoricaState } from "@/actions/notas";
import type { Epoca } from "@/generated/prisma/client";

const initialState: GuardarNotaHistoricaState = {};

const CAMPO_DA_EPOCA: Record<Epoca, "p1" | "p2" | "exame" | "recurso" | "exameEspecial"> = {
  P1: "p1",
  P2: "p2",
  EXAME: "exame",
  RECURSO: "recurso",
  EXAME_ESPECIAL: "exameEspecial",
};

interface LinhaPercursoEditavelProps {
  inscricaoCadeiraId: string;
  disciplinaNome: string;
  tentativa: number;
  ativa: boolean;
  creditada: boolean;
  instituicaoOrigemCreditado: string | null;
  notasPorEpoca: Record<Epoca, NotaDeEpoca | null>;
  notaFrequencia: number | null;
  notaFinal: number | null;
  estado: EstadoAvaliacao;
  /** O semestre desta cadeira já encerrou — muda a leitura do estado, não o cálculo. */
  semestreEncerrado: boolean;
  professorNome: string;
  temProfessor: boolean;
  editavel: boolean;
}

/**
 * Uma linha do Percurso Curricular, que alterna entre leitura e edição das notas.
 *
 * A linha inteira é um Client Component porque em edição os inputs têm de cair NAS COLUNAS das
 * épocas, alinhados com o cabeçalho, como no GradebookEditor (§pedido do cliente 2026-08-31). O
 * formulário antigo vivia dentro de uma só célula e empilhava os cinco campos na vertical, o que
 * deformava a linha e obrigava a adivinhar que campo era de que época.
 *
 * O `<form>` fica fora da tabela (um `<tr>` só aceita `<td>`; um form lá dentro é HTML inválido e o
 * browser move-o) e os inputs ligam-se a ele pelo atributo `form=`.
 */
export function LinhaPercursoEditavel({
  inscricaoCadeiraId,
  disciplinaNome,
  tentativa,
  ativa,
  creditada,
  instituicaoOrigemCreditado,
  notasPorEpoca,
  notaFrequencia,
  notaFinal,
  estado,
  semestreEncerrado,
  professorNome,
  temProfessor,
  editavel,
}: LinhaPercursoEditavelProps) {
  const [state, formAction, isPending] = useActionState(guardarNotaHistoricaAction, initialState);
  const [aberto, setAberto] = useState(false);

  const formId = `nota-historica-${inscricaoCadeiraId}`;

  const celulaDisciplina = (
    <Td className="font-medium text-navy-900">
      {disciplinaNome}
      {tentativa > 1 ? (
        <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-700">
          {tentativa}ª tentativa
        </span>
      ) : null}
      {!ativa ? (
        <span className="ml-2 rounded-full bg-navy-50 px-2 py-0.5 text-xs font-medium text-navy-400">Anterior</span>
      ) : null}
      {creditada ? (
        <span
          className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
          title={instituicaoOrigemCreditado ?? undefined}
        >
          Creditado
        </span>
      ) : null}
    </Td>
  );

  if (!aberto) {
    return (
      <Tr className={!ativa ? "opacity-60" : undefined}>
        {celulaDisciplina}
        {COLUNAS_EPOCA.map((coluna) => (
          <CelulaNota key={coluna.epoca} nota={notasPorEpoca[coluna.epoca]} />
        ))}
        <Td className="text-center text-navy-800">{notaFrequencia !== null ? notaFrequencia.toFixed(1) : "—"}</Td>
        <Td className="text-center font-semibold text-navy-900">{notaFinal !== null ? notaFinal.toFixed(1) : "—"}</Td>
        <Td>
          {/* Num semestre encerrado "Em curso"/"Em recurso" mentiriam — ver rotuloEstado. */}
          <Badge tone={toneEstado(estado, semestreEncerrado)}>{rotuloEstado(estado, semestreEncerrado)}</Badge>
        </Td>
        <Td className={temProfessor ? "text-xs" : "text-xs text-navy-400 italic"}>{professorNome}</Td>
        {editavel ? (
          <Td>
            <button
              type="button"
              onClick={() => setAberto(true)}
              className="text-xs font-medium text-navy-500 hover:text-navy-700 hover:underline"
            >
              editar
            </button>
          </Td>
        ) : null}
      </Tr>
    );
  }

  return (
    <>
      <Tr className="bg-gold-50/40">
        {celulaDisciplina}
        {/* Um input por coluna, debaixo do cabeçalho da sua época — a linha mantém a forma. */}
        {COLUNAS_EPOCA.map((coluna) => (
          <Td key={coluna.epoca} className="text-center">
            <input
              form={formId}
              type="number"
              name={CAMPO_DA_EPOCA[coluna.epoca]}
              min={0}
              max={20}
              step={0.1}
              defaultValue={notasPorEpoca[coluna.epoca]?.valor ?? ""}
              aria-label={`${coluna.label} — ${disciplinaNome}`}
              className="w-16 rounded-md border border-navy-100 px-2 py-1 text-center text-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100"
            />
          </Td>
        ))}
        {/* Média e Final saem do cálculo, não se editam — ficam vazias enquanto se edita, para não
            mostrar um valor que já não corresponde ao que está nos campos. */}
        <Td className="text-center text-navy-300">—</Td>
        <Td className="text-center text-navy-300">—</Td>
        <Td className="text-xs text-navy-400">a editar</Td>
        <Td className={temProfessor ? "text-xs" : "text-xs text-navy-400 italic"}>{professorNome}</Td>
        <Td>
          <div className="flex items-center gap-2">
            <Button form={formId} type="submit" variant="secondary" disabled={isPending} className="px-2.5 py-1 text-xs">
              {isPending ? "A guardar..." : "Guardar"}
            </Button>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="text-xs text-navy-400 hover:text-navy-600"
            >
              cancelar
            </button>
          </div>
        </Td>
      </Tr>
      {state.error ? (
        <tr>
          <td colSpan={COLUNAS_EPOCA.length + 5} className="px-4 pb-2 text-xs text-red-600">
            {state.error}
          </td>
        </tr>
      ) : null}
      {/* O form vive numa linha oculta: dentro de <tr> um <form> seria HTML inválido e o browser
          movia-o para fora da tabela, desligando-o dos inputs. Assim fica válido e os inputs das
          células ligam-se a ele pelo atributo form=. */}
      <tr hidden>
        <td colSpan={COLUNAS_EPOCA.length + 5}>
          <form id={formId} action={formAction}>
            <input type="hidden" name="inscricaoCadeiraId" value={inscricaoCadeiraId} />
          </form>
        </td>
      </tr>
    </>
  );
}
