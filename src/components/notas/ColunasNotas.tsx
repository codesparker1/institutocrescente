import { Td } from "@/components/ui/Table";
import type { EstadoAvaliacao } from "@/lib/avaliacao";
import type { Epoca } from "@/generated/prisma/client";

/**
 * Peças partilhadas pelas pautas em coluna (§pedido do cliente 2026-08-31): Minhas Notas, do lado do
 * aluno, e o Percurso Curricular, do lado do Admin/DAAC. As duas mostram as mesmas notas — se as
 * colunas divergirem, a mesma cadeira passa a ler-se de forma diferente conforme quem a vê.
 */

export const ESTADO_TONE: Record<EstadoAvaliacao, "success" | "warning" | "danger" | "neutral"> = {
  EM_CURSO: "neutral",
  DISPENSADO: "success",
  ADMITIDO_A_EXAME: "warning",
  EM_RECURSO: "warning",
  EM_EXAME_ESPECIAL: "warning",
  APROVADO: "success",
  REPROVADO: "danger",
};

/** Uma coluna por época, na ordem da cascata — a leitura em linha segue o percurso da cadeira. */
export const COLUNAS_EPOCA: { epoca: Epoca; label: string }[] = [
  { epoca: "P1", label: "P1" },
  { epoca: "P2", label: "P2" },
  { epoca: "EXAME", label: "Exame" },
  { epoca: "RECURSO", label: "Recurso" },
  { epoca: "EXAME_ESPECIAL", label: "Ex. Especial" },
];

export interface NotaDeEpoca {
  valor: number | null;
  automatica: boolean;
}

/**
 * A nota de uma época, para a sua própria coluna. Distingue três casos que a leitura em coluna
 * torna importantes: nota lançada, época agendada mas ainda sem nota ("—"), e época que nem sequer
 * se aplica a esta cadeira (fica vazia, não "—", para a linha não sugerir que falta algo).
 */
export function notaDaEpoca(
  inscricao: {
    notas: { valor: unknown; automatica: boolean; avaliacao: { epoca: Epoca } }[];
    turmaDisciplina: { avaliacoes: { epoca: Epoca }[] };
  },
  epoca: Epoca,
): NotaDeEpoca | null {
  const nota = inscricao.notas.find((n) => n.avaliacao.epoca === epoca);
  if (nota) return { valor: Number(nota.valor), automatica: nota.automatica };
  const agendada = inscricao.turmaDisciplina.avaliacoes.some((av) => av.epoca === epoca);
  return agendada ? { valor: null, automatica: false } : null;
}

/**
 * Célula de nota. Vazia quando a época não se aplica à cadeira, "—" quando está agendada mas ainda
 * sem nota, e a vermelho quando é um 0 automático por prazo expirado (quem lê tem de perceber que
 * aquele zero não foi uma prova feita).
 */
export function CelulaNota({ nota }: { nota: NotaDeEpoca | null }) {
  if (!nota) return <Td className="text-center text-texto-suave">{""}</Td>;
  if (nota.valor === null) return <Td className="text-center text-texto-suave">—</Td>;
  return (
    <Td className={`text-center font-medium ${nota.automatica ? "text-red-600" : "text-texto"}`}>
      <span title={nota.automatica ? "0 automático — prazo de lançamento expirado sem nota entregue" : undefined}>
        {nota.valor.toFixed(1)}
        {nota.automatica ? "*" : ""}
      </span>
    </Td>
  );
}
