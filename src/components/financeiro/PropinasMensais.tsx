import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { mesReferenciaLabel, type PropinaMes } from "@/lib/financeiro";
import { PropinaMesChip } from "./PropinaMesChip";

interface PropinasMensaisProps {
  meses: PropinaMes[];
  editable: boolean;
}

export function PropinasMensais({ meses, editable }: PropinasMensaisProps) {
  if (meses.length === 0) {
    return <p className="text-sm text-navy-400">Sem mensalidades registadas.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-navy-50">
      {meses.map((mes) => (
        <div key={mes.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <span className="w-28 text-sm font-medium text-navy-800">{mesReferenciaLabel(mes.mesReferencia)}</span>
            <span className="text-xs text-navy-400">{formatCurrency(mes.valorDevido)}</span>
          </div>

          <div className="flex items-center gap-3">
            {mes.status === "PAGO" && mes.dataPagamento ? (
              <span className="text-xs text-navy-400">Pago em {formatDate(mes.dataPagamento)}</span>
            ) : null}

            {editable ? (
              <PropinaMesChip propinaId={mes.id} pagoInicial={mes.status === "PAGO"} />
            ) : (
              <Badge tone={mes.status === "PAGO" ? "success" : "danger"}>
                {mes.status === "PAGO" ? "Pago" : "Pendente"}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
