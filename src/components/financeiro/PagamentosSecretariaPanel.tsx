"use client";

import { useState, useTransition } from "react";
import { cn, formatCurrency, chaveMes } from "@/lib/utils";
import { confirmarPagamentosEmLoteAction, registarEmolumentosEmLoteAction } from "@/actions/financeiro";
import { PropinasMensais } from "./PropinasMensais";
import { EmolumentosPagos } from "./EmolumentosPagos";
import type { EstadoFinanceiroAluno, EmolumentoCatalogo, EmolumentoPago } from "@/lib/financeiro";

type Tab = "propinas" | "emolumentos";

interface PagamentosSecretariaPanelProps {
  alunoId: string;
  estado: EstadoFinanceiroAluno;
  catalogoEmolumentos: EmolumentoCatalogo[];
  emolumentosPagos: EmolumentoPago[];
  onAtualizado: () => void;
}

/**
 * Painel único de confirmação de pagamentos em lote, partilhado por /financeiro/registo e pelo
 * painel de pesquisa rápida do dashboard da secretaria. As tabs Propinas/Emolumentos são só
 * categorias — a seleção sobrevive à troca de tab e sai tudo junto num único recibo.
 */
export function PagamentosSecretariaPanel({
  alunoId,
  estado,
  catalogoEmolumentos,
  emolumentosPagos,
  onAtualizado,
}: PagamentosSecretariaPanelProps) {
  const [tab, setTab] = useState<Tab>("propinas");
  // IDs de mensalidade (PROPINA) PENDENTE selecionados na tab Propinas. A multa por atraso do mesmo
  // mês nunca é selecionada à parte — confirmarPagamentosEmLoteAction junta-a sempre no servidor.
  const [selecionadosPropinas, setSelecionadosPropinas] = useState<Set<string>>(new Set());
  const [selecionadosEmolumentos, setSelecionadosEmolumentos] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Ajusta o estado durante o render (em vez de um useEffect) quando o aluno muda — padrão
  // recomendado pelo React para "resetar estado quando uma prop muda" sem re-render em cascata.
  // A troca de tab NÃO reseta nada: as duas tabs são categorias do mesmo recibo, não páginas.
  const [alunoAnterior, setAlunoAnterior] = useState(alunoId);
  if (alunoAnterior !== alunoId) {
    setAlunoAnterior(alunoId);
    setSelecionadosPropinas(new Set());
    setSelecionadosEmolumentos(new Set());
    setErro(null);
  }

  // Multa por atraso é embutida na linha da mensalidade do mesmo mês (como no lado do aluno) — o
  // valor mostrado e o total do lote já contam com ela, mesmo sem uma checkbox própria para a multa.
  const multaPendentePorChaveMes = new Map(
    estado.multas.filter((m) => m.status === "PENDENTE" && m.mesReferencia).map((m) => [chaveMes(m.mesReferencia!), m]),
  );

  const valorPorIdPropina = new Map(
    estado.meses
      .filter((mes) => mes.status === "PENDENTE")
      .map((mes) => {
        const multa = multaPendentePorChaveMes.get(chaveMes(mes.mesReferencia));
        return [mes.id, mes.valorDevido + (multa?.valorDevido ?? 0)] as const;
      }),
  );
  const valorPorIdEmolumento = new Map(catalogoEmolumentos.map((e) => [e.id, e.valor]));

  function toggleSelecionadoPropina(id: string) {
    setErro(null);
    setSelecionadosPropinas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function toggleSelecionadoEmolumento(id: string) {
    setErro(null);
    setSelecionadosEmolumentos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const totalSelecionado =
    [...selecionadosPropinas].reduce((soma, id) => soma + (valorPorIdPropina.get(id) ?? 0), 0) +
    [...selecionadosEmolumentos].reduce((soma, id) => soma + (valorPorIdEmolumento.get(id) ?? 0), 0);
  const totalItens = selecionadosPropinas.size + selecionadosEmolumentos.size;

  function handleConfirmar() {
    setErro(null);
    startTransition(async () => {
      const idsConfirmados: string[] = [];

      if (selecionadosPropinas.size > 0) {
        // Não é preciso juntar a multa aqui: confirmarPagamentosEmLoteAction inclui-a sempre no
        // servidor quando existir, para o mesmo mês de uma mensalidade selecionada.
        const formData = new FormData();
        formData.set("alunoId", alunoId);
        selecionadosPropinas.forEach((id) => formData.append("cobrancaIds", id));

        const resultado = await confirmarPagamentosEmLoteAction(formData);
        if (resultado.error) {
          setErro(resultado.error);
          return;
        }
        idsConfirmados.push(...(resultado.cobrancaIds ?? []));
      }

      if (selecionadosEmolumentos.size > 0) {
        const formData = new FormData();
        formData.set("alunoId", alunoId);
        selecionadosEmolumentos.forEach((id) => formData.append("emolumentoIds", id));

        const resultado = await registarEmolumentosEmLoteAction(formData);
        if (resultado.error) {
          // As propinas já confirmadas acima não podem ser desfeitas — emite o recibo do que
          // já ficou pago e mostra o erro dos emolumentos, em vez de perder o registo do sucesso parcial.
          if (idsConfirmados.length > 0) window.open(`/api/recibo?ids=${idsConfirmados.join(",")}`, "_blank");
          setErro(resultado.error);
          setSelecionadosPropinas(new Set());
          onAtualizado();
          return;
        }
        idsConfirmados.push(...(resultado.cobrancaIds ?? []));
      }

      if (idsConfirmados.length > 0) {
        window.open(`/api/recibo?ids=${idsConfirmados.join(",")}`, "_blank");
      }
      setSelecionadosPropinas(new Set());
      setSelecionadosEmolumentos(new Set());
      onAtualizado();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 border-b border-navy-50 pb-2">
        <TabButton label="Propinas" active={tab === "propinas"} onClick={() => setTab("propinas")} />
        <TabButton label="Emolumentos" active={tab === "emolumentos"} onClick={() => setTab("emolumentos")} />
      </div>

      {tab === "propinas" ? (
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
              Mensalidades (selecione as pendentes para confirmar em conjunto)
            </p>
            <PropinasMensais
              meses={estado.meses}
              multas={estado.multas}
              editable
              selecionados={selecionadosPropinas}
              onToggleSelecionado={toggleSelecionadoPropina}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
              Catálogo (selecione os serviços pedidos)
            </p>
            {catalogoEmolumentos.length === 0 ? (
              <p className="text-sm text-navy-400">Nenhum emolumento ativo no catálogo.</p>
            ) : (
              <div className="flex flex-col divide-y divide-navy-50">
                {catalogoEmolumentos.map((e) => (
                  <label key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selecionadosEmolumentos.has(e.id)}
                        onChange={() => toggleSelecionadoEmolumento(e.id)}
                        className="h-4 w-4 rounded border-navy-200 text-navy-700 focus:ring-navy-500"
                      />
                      <span className="font-medium text-navy-800">{e.nome}</span>
                    </div>
                    <span className="text-xs text-navy-400">{formatCurrency(e.valor)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">Histórico</p>
            <EmolumentosPagos emolumentos={emolumentosPagos} editable />
          </div>
        </div>
      )}

      {totalItens > 0 ? (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-navy-100 bg-navy-50 px-4 py-3">
          <span className="text-sm font-medium text-navy-800">
            {totalItens} selecionado{totalItens > 1 ? "s" : ""} · {formatCurrency(totalSelecionado)}
          </span>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={isPending}
            className="rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-gold-100 hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "A confirmar..." : "Confirmar e emitir recibo"}
          </button>
        </div>
      ) : null}

      {erro ? <p className="text-sm text-red-600">{erro}</p> : null}
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors",
        active ? "bg-navy-700 text-gold-100" : "text-navy-400 hover:bg-navy-50 hover:text-navy-700",
      )}
    >
      {label}
    </button>
  );
}
