import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface AvisoNotasBloqueadasProps {
  saldoEmDivida: number;
}

export function AvisoNotasBloqueadas({ saldoEmDivida }: AvisoNotasBloqueadasProps) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <p>
        Tem propinas em atraso ({formatCurrency(saldoEmDivida)}). Regularize o pagamento na secretaria para poder
        consultar as suas notas.
      </p>
    </div>
  );
}
