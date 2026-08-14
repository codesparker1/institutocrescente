import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { mesReferenciaLabel, type CobrancaAvulsa } from "@/lib/financeiro";
import { MultaChip } from "./MultaChip";

interface MultasPendentesProps {
  multas: CobrancaAvulsa[];
  editable: boolean;
}

export function MultasPendentes({ multas, editable }: MultasPendentesProps) {
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

              {editable ? (
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
