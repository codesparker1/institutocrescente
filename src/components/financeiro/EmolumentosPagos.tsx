import { formatCurrency, formatDate } from "@/lib/utils";
import { removerPagamentoEmolumentoAction } from "@/actions/financeiro";
import type { EmolumentoPago } from "@/lib/financeiro";

interface EmolumentosPagosProps {
  emolumentos: EmolumentoPago[];
  editable?: boolean;
}

export function EmolumentosPagos({ emolumentos, editable = false }: EmolumentosPagosProps) {
  if (emolumentos.length === 0) {
    return <p className="text-sm text-navy-400">Sem emolumentos pagos registados.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-navy-50">
      {emolumentos.map((e) => (
        <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-navy-800">{e.nome}</p>
            <p className="text-xs text-navy-400">Pago em {formatDate(e.dataPagamento)}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-navy-900">{formatCurrency(e.valor)}</span>
            {editable ? (
              <form action={removerPagamentoEmolumentoAction}>
                <input type="hidden" name="cobrancaId" value={e.id} />
                <button type="submit" className="text-xs font-medium text-red-500 hover:text-red-700">
                  Remover (enganado)
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
