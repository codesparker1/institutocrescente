import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatDate, mesReferenciaLabel, chaveMes } from "@/lib/utils";
import { ESTADO_COBRANCA_LABEL, ESTADO_COBRANCA_TONE } from "@/lib/estado-cobranca";
import type { PropinaMes, CobrancaAvulsa } from "@/lib/financeiro";
import { PropinaMesChip } from "./PropinaMesChip";

interface PropinasMensaisProps {
  meses: PropinaMes[];
  /** Multa por atraso do mesmo mês — mostrada embutida na linha da mensalidade, tal como no lado do aluno. */
  multas?: CobrancaAvulsa[];
  editable: boolean;
  /**
   * Quando fornecido junto de onToggleSelecionado, meses PENDENTE ganham uma checkbox de seleção em
   * lote em vez do botão de confirmação instantânea — PAGO continua a usar o chip de reverter. A
   * multa por atraso do mesmo mês nunca é uma escolha à parte: o valor passado ao callback já a
   * inclui, e confirmarPagamentosEmLoteAction junta-a sempre no servidor, mesmo sem seleção explícita.
   */
  selecionados?: Set<string>;
  onToggleSelecionado?: (id: string, valor: number) => void;
  /** Recarregar o estado depois de reverter um mês pago — ver nota em PropinaMesChip. */
  onAtualizado?: () => void;
  /**
   * Reverter um pagamento já confirmado é exclusivo do ADMIN (podeAlterarPagamentoIndividual) — a
   * Secretaria tem de o pedir ao ADMIN (§regra confirmada 2026-09-01). Sem isto o chip aparecia
   * clicável à Secretaria, a action rejeitava, e o clique rebentava em vez de explicar.
   */
  podeReverter?: boolean;
}

export function PropinasMensais({
  meses,
  multas = [],
  editable,
  selecionados,
  onToggleSelecionado,
  onAtualizado,
  podeReverter = true,
}: PropinasMensaisProps) {
  if (meses.length === 0) {
    return <p className="text-sm text-navy-400">Sem mensalidades registadas.</p>;
  }

  const multaPorMes = new Map(
    multas.filter((m): m is CobrancaAvulsa & { mesReferencia: Date } => m.mesReferencia !== null).map((m) => [chaveMes(m.mesReferencia), m]),
  );

  return (
    <div className="flex flex-col divide-y divide-navy-50" data-secao="propinas-mensais">
      {meses.map((mes) => {
        const multa = multaPorMes.get(chaveMes(mes.mesReferencia));
        const valorTotal = mes.valorDevido + (multa?.valorDevido ?? 0);
        const valorSelecao = mes.valorDevido + (multa?.status === "PENDENTE" ? multa.valorDevido : 0);

        return (
          <div key={mes.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-28 text-sm font-medium text-navy-800">{mesReferenciaLabel(mes.mesReferencia)}</span>
              <span className="text-xs text-navy-400">{formatCurrency(valorTotal)}</span>
              {multa ? (
                <Badge tone="warning">
                  Inclui multa por atraso ({formatCurrency(multa.valorDevido)}, {multa.status === "PAGO" ? "paga" : "pendente"})
                </Badge>
              ) : null}
              {mes.descricao ? <Badge tone="warning">{mes.descricao}</Badge> : null}
            </div>

            <div className="flex items-center gap-3">
              {mes.status === "PAGO" && mes.dataPagamento ? (
                <span className="text-xs text-navy-400">Pago em {formatDate(mes.dataPagamento)}</span>
              ) : null}

              {editable && onToggleSelecionado && mes.status === "PENDENTE" ? (
                <label className="flex items-center gap-2 text-xs font-medium text-navy-600">
                  <input
                    type="checkbox"
                    checked={selecionados?.has(mes.id) ?? false}
                    onChange={() => onToggleSelecionado(mes.id, valorSelecao)}
                    className="h-4 w-4 rounded border-navy-200 text-navy-700 focus:ring-navy-500"
                  />
                  Selecionar
                </label>
              ) : editable && podeReverter ? (
                <PropinaMesChip
                  propinaId={mes.id}
                  pago={mes.status === "PAGO"}
                  estadoVisual={mes.estadoVisual}
                  onAtualizado={onAtualizado}
                />
              ) : (
                <Badge
                  tone={ESTADO_COBRANCA_TONE[mes.estadoVisual]}
                  // Quem não pode reverter tem de saber a quem pedir, senão fica a clicar num
                  // rótulo que não responde a pensar que o sistema está avariado.
                  title={
                    editable && !podeReverter && mes.status === "PAGO"
                      ? "Só o Admin pode reverter um pagamento já confirmado — peça ao Admin."
                      : undefined
                  }
                >
                  {ESTADO_COBRANCA_LABEL[mes.estadoVisual]}
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
