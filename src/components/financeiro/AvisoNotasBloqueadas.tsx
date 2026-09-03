import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface AvisoNotasBloqueadasProps {
  /** Só propinas — é o que bloqueia as notas. */
  saldoEmDivida: number;
  /** Só multas. Não bloqueiam, mas o aluno tem de as pagar na mesma. */
  saldoMultas: number;
  /** Propinas + multas — o que se paga de facto ao balcão. */
  saldoTotal: number;
}

/**
 * §pedido do cliente 2026-09-03: o aviso dizia só o valor das propinas. Quem devia 85.000 de
 * propina e 25.000 de multa lia "85.000" e ia à secretaria com a conta errada — a multa não
 * aparecia em lado nenhum. Agora as três linhas: o que bloqueia, o que não bloqueia mas se deve,
 * e o total.
 */
export function AvisoNotasBloqueadas({ saldoEmDivida, saldoMultas, saldoTotal }: AvisoNotasBloqueadasProps) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div className="flex flex-col gap-1">
        <p>
          Tem propinas em atraso ({formatCurrency(saldoEmDivida)}). Regularize o pagamento na secretaria para poder
          consultar as suas notas.
        </p>
        {saldoMultas > 0 ? (
          <p className="text-red-600">
            Tem também <strong>{formatCurrency(saldoMultas)}</strong> em multas — não bloqueiam as notas, mas fazem parte
            da dívida. <strong>Total a pagar: {formatCurrency(saldoTotal)}</strong>.
          </p>
        ) : null}
      </div>
    </div>
  );
}
