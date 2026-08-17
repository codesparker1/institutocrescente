import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatDate, mesReferenciaLabel } from "@/lib/utils";
import type { CobrancaAvulsa } from "@/lib/financeiro";
import { MultaChip } from "./MultaChip";

interface MultasPendentesProps {
  multas: CobrancaAvulsa[];
  editable: boolean;
  /** Ver PropinasMensais — mesma lógica de seleção em lote para multas PENDENTE. */
  selecionados?: Set<string>;
  onToggleSelecionado?: (id: string, valor: number) => void;
}

export function MultasPendentes({ multas, editable, selecionados, onToggleSelecionado }: MultasPendentesProps) {
  if (multas.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Multas por atraso</p>
      <div className="flex flex-col divide-y divide-navy-50">
        {multas.map((multa) => (
          <div key={multa.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-navy-800">
                {multa.mesReferencia ? mesReferenciaLabel(multa.mesReferencia) : (multa.descricao ?? "Multa")}
              </span>
              <span className="text-xs text-navy-400">{formatCurrency(multa.valorDevido)}</span>
            </div>

            <div className="flex items-center gap-3">
              {multa.status === "PAGO" && multa.dataPagamento ? (
                <span className="text-xs text-navy-400">Pago em {formatDate(multa.dataPagamento)}</span>
              ) : null}

              {editable && onToggleSelecionado && multa.status === "PENDENTE" ? (
                <label className="flex items-center gap-2 text-xs font-medium text-navy-600">
                  <input
                    type="checkbox"
                    checked={selecionados?.has(multa.id) ?? false}
                    onChange={() => onToggleSelecionado(multa.id, multa.valorDevido)}
                    className="h-4 w-4 rounded border-navy-200 text-navy-700 focus:ring-navy-500"
                  />
                  Selecionar
                </label>
              ) : editable ? (
                <MultaChip multaId={multa.id} pagoInicial={multa.status === "PAGO"} />
              ) : (
                <Badge tone={multa.status === "PAGO" ? "success" : "danger"}>
                  {multa.status === "PAGO" ? "Pago" : "Pendente"}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
