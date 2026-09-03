"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DeleteButtonForm } from "@/components/ui/DeleteButtonForm";
import { formatDate } from "@/lib/utils";
import { carregarDocumentoAlunoAction, apagarDocumentoAlunoAction, type CarregarDocumentoState } from "@/actions/documentos";

const initialState: CarregarDocumentoState = {};

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Documento {
  id: string;
  nome: string;
  tamanhoBytes: number;
  createdAt: Date;
  carregadoPor: { name: string } | null;
}

interface DocumentosAlunoCardProps {
  alunoId: string;
  documentos: Documento[];
}

export function DocumentosAlunoCard({ alunoId, documentos }: DocumentosAlunoCardProps) {
  const [state, formAction, isPending] = useActionState(carregarDocumentoAlunoAction, initialState);

  return (
    <div className="flex flex-col gap-4">
      {documentos.length === 0 ? (
        <p className="text-sm text-texto-suave">Sem documentos carregados.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documentos.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 border-b border-navy-50 pb-2 last:border-0 last:pb-0">
              <div className="flex flex-col">
                <a href={`/api/documentos/${doc.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-texto hover:underline">
                  {doc.nome}
                </a>
                <span className="text-xs text-texto-suave">
                  {formatarTamanho(doc.tamanhoBytes)} · {formatDate(doc.createdAt)} · {doc.carregadoPor?.name ?? "—"}
                </span>
              </div>
              <DeleteButtonForm action={apagarDocumentoAlunoAction} id={doc.id} />
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-2 border-t border-navy-50 pt-4">
        <input type="hidden" name="alunoId" value={alunoId} />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-texto">Descrição</label>
          <Input type="text" name="nome" required placeholder="Ex.: Certificado de transferência" className="w-56" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-texto">Ficheiro (PDF, JPG, PNG — máx. 10MB)</label>
          <Input type="file" name="ficheiro" required accept=".pdf,.jpg,.jpeg,.png" className="w-64" />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "A carregar..." : "Carregar"}
        </Button>
        {state.error ? <p className="w-full text-sm text-red-600">{state.error}</p> : null}
      </form>
    </div>
  );
}
