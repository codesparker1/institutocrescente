"use client";

import { useState } from "react";
import { Pencil, Printer } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { DeleteButtonForm } from "@/components/ui/DeleteButtonForm";
import { deleteProvaAction } from "@/actions/horario";
import { formatDate, cn } from "@/lib/utils";
import { EPOCA_LABEL } from "@/lib/avaliacao";
import { EditarProvaForm } from "./EditarProvaForm";
import type { Epoca } from "@/generated/prisma/client";

interface ProvaRowProps {
  id: string;
  epoca: Epoca;
  disciplinaNome: string;
  data: Date;
  /** Data da prova em ISO — o Server Component converte, para o cliente não reinterpretar fusos. */
  dataIso: string;
  sala: string | null;
  cursoAnoLabel?: string;
  emRepeticao?: boolean;
  /** Já passou o dia da prova (calculado no servidor, com o relógio simulado). */
  passada: boolean;
  canPrint: boolean;
  editable: boolean;
  /** Janela remarcável — null quando não há ano letivo a decorrer, e aí não se edita. */
  janela: { minIso: string; maxIso: string } | null;
}

export function ProvaRow({
  id,
  epoca,
  disciplinaNome,
  data,
  dataIso,
  sala,
  cursoAnoLabel,
  emRepeticao,
  passada,
  canPrint,
  editable,
  janela,
}: ProvaRowProps) {
  const [aEditar, setAEditar] = useState(false);

  // Remarcar só enquanto a prova não passou: depois de dada, a data é registo do que aconteceu.
  // A Server Action volta a verificar — isto é só para não oferecer um botão que ia recusar.
  const podeEditar = editable && !passada && janela !== null;

  return (
    <div className={cn("rounded-lg border border-navy-50", passada && "opacity-50")}>
      <div className="flex items-center justify-between px-4 py-2.5 text-sm">
        <div>
          <p className={cn("font-medium", passada ? "text-navy-500" : "text-navy-800")}>
            {EPOCA_LABEL[epoca]} · {disciplinaNome}
            {/* Aqui a lista fica cronológica (é o que interessa numa época de provas) —
                a repetição assinala-se com etiqueta, não separando em duas listas. */}
            {emRepeticao ? (
              <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-700">repetição</span>
            ) : null}
          </p>
          <p className="text-xs text-navy-400">
            {cursoAnoLabel ? `${cursoAnoLabel} · ` : ""}
            {sala ?? "Sala a confirmar"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={passada ? "neutral" : "info"}>{formatDate(data)}</Badge>
          {canPrint ? (
            passada ? (
              <span
                className="cursor-not-allowed rounded-md p-1 text-navy-200"
                aria-label="Prova já dada — lista de presença indisponível"
                title="Prova já dada — já não é possível imprimir a lista de presença"
              >
                <Printer size={14} />
              </span>
            ) : (
              <a
                href={`/api/lista-presenca/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md p-1 text-navy-300 hover:bg-navy-50 hover:text-navy-600"
                aria-label="Imprimir lista de presença"
                title="Imprimir lista de presença"
              >
                <Printer size={14} />
              </a>
            )
          ) : null}
          {editable ? (
            podeEditar ? (
              <button
                type="button"
                onClick={() => setAEditar((aberto) => !aberto)}
                className="rounded-md p-1 text-navy-300 hover:bg-navy-50 hover:text-navy-600"
                aria-label="Remarcar prova"
                aria-expanded={aEditar}
                title="Remarcar prova"
              >
                <Pencil size={14} />
              </button>
            ) : (
              <span
                className="cursor-not-allowed rounded-md p-1 text-navy-200"
                aria-label="Prova já dada — já não pode ser remarcada"
                title="Prova já dada — já não pode ser remarcada"
              >
                <Pencil size={14} />
              </span>
            )
          ) : null}
          {editable ? <DeleteButtonForm action={deleteProvaAction} id={id} /> : null}
        </div>
      </div>
      {aEditar && janela ? (
        <EditarProvaForm
          provaId={id}
          dataIso={dataIso}
          salaAtual={sala}
          minIso={janela.minIso}
          maxIso={janela.maxIso}
          onFechar={() => setAEditar(false)}
        />
      ) : null}
    </div>
  );
}
