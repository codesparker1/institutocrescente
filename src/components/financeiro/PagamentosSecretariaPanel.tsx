"use client";

import { useState, useTransition } from "react";
import { cn, formatCurrency, chaveMes } from "@/lib/utils";
import { confirmarPagamentosEmLoteAction, registarEmolumentosEmLoteAction } from "@/actions/financeiro";
import { PropinasMensais } from "./PropinasMensais";
import { MultasPendentes } from "./MultasPendentes";
import { EmolumentosPagos } from "./EmolumentosPagos";
import type { EstadoFinanceiroAluno, EmolumentoCatalogo, EmolumentoPago } from "@/lib/financeiro";

type Tab = "propinas" | "emolumentos";

interface PagamentosSecretariaPanelProps {
  alunoId: string;
  estado: EstadoFinanceiroAluno;
  catalogoEmolumentos: EmolumentoCatalogo[];
  emolumentosPagos: EmolumentoPago[];
  onAtualizado: () => void;
  /** Só ADMIN vê mensalidade e multa como checkboxes independentes (§pedido do cliente 2026-08-18) — Secretaria/DAAC continuam com a multa sempre embutida e junta automaticamente. */
  isAdmin?: boolean;
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
  isAdmin = false,
}: PagamentosSecretariaPanelProps) {
  const [tab, setTab] = useState<Tab>("propinas");
  // IDs de mensalidade (PROPINA) e de multa (MULTA) PENDENTE selecionados na tab Propinas — o mesmo
  // Set serve para os dois tipos porque confirmarPagamentosEmLoteAction aceita cobrancaIds mistos.
  // Para ADMIN, mensalidade e multa são sempre checkboxes independentes (§pedido do cliente
  // 2026-08-18: voltar ao layout com tickbox próprio para juntar cada uma ao lote); só a Secretaria/
  // DAAC continuam com a multa do mesmo mês embutida e junta automaticamente no servidor.
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

  // Multa por atraso é embutida na linha da mensalidade do mesmo mês (como no lado do aluno) só para
  // Secretaria/DAAC — o valor mostrado e o total do lote já contam com ela. Para ADMIN, mensalidade
  // e multa são sempre linhas e checkboxes independentes (ver JSX abaixo), por isso o valor da
  // mensalidade nunca inclui a multa aqui.
  const multaPendentePorChaveMes = new Map(
    estado.multas.filter((m) => m.status === "PENDENTE" && m.mesReferencia).map((m) => [chaveMes(m.mesReferencia!), m]),
  );

  const valorPorIdPropina = new Map(
    estado.meses
      .filter((mes) => mes.status === "PENDENTE")
      .map((mes) => {
        if (isAdmin) return [mes.id, mes.valorDevido] as const;
        const multa = multaPendentePorChaveMes.get(chaveMes(mes.mesReferencia));
        return [mes.id, mes.valorDevido + (multa?.valorDevido ?? 0)] as const;
      }),
  );
  const valorPorIdMulta = new Map(estado.multas.filter((m) => m.status === "PENDENTE").map((m) => [m.id, m.valorDevido]));
  const valorPorIdEmolumento = new Map(catalogoEmolumentos.map((e) => [e.id, e.valor]));

  // Multas sem mensalidade correspondente no mesmo mês (mesReferencia nulo, ou o mês da propina já
  // não existe) — só relevante para Secretaria/DAAC, que veem a mensalidade e a multa embutidas
  // numa única lista e por isso precisam de uma secção à parte para as multas "órfãs". Para ADMIN a
  // lista de multas já é sempre uma secção própria (todas, órfãs ou não).
  const mesesChaves = new Set(estado.meses.map((mes) => chaveMes(mes.mesReferencia)));
  const multasOrfas = estado.multas.filter((m) => !m.mesReferencia || !mesesChaves.has(chaveMes(m.mesReferencia)));

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

  const valorPorIdSelecao = new Map([...valorPorIdPropina, ...valorPorIdMulta]);
  const totalSelecionado =
    [...selecionadosPropinas].reduce((soma, id) => soma + (valorPorIdSelecao.get(id) ?? 0), 0) +
    [...selecionadosEmolumentos].reduce((soma, id) => soma + (valorPorIdEmolumento.get(id) ?? 0), 0);
  const totalItens = selecionadosPropinas.size + selecionadosEmolumentos.size;

  function handleConfirmar() {
    setErro(null);
    startTransition(async () => {
      try {
        const idsConfirmados: string[] = [];

        if (selecionadosPropinas.size > 0) {
          // Para ADMIN a seleção já é granular (mensalidade e multa são checkboxes independentes),
          // por isso semMulta vai sempre true — nunca deixar o servidor juntar sozinho uma multa que
          // o ADMIN decidiu não marcar. Secretaria/DAAC continuam com o comportamento anterior: a
          // multa do mesmo mês junta-se sempre no servidor, mesmo sem seleção explícita.
          const formData = new FormData();
          formData.set("alunoId", alunoId);
          if (isAdmin) formData.set("semMulta", "true");
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
      } catch (error) {
        // As ações lançam Error diretamente em alguns casos (ex. sessão desatualizada em
        // requireSessao) — sem isto o botão parecia não fazer nada.
        setErro(error instanceof Error ? error.message : "Não foi possível confirmar os pagamentos.");
      }
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
              multas={isAdmin ? [] : estado.multas}
              editable
              selecionados={selecionadosPropinas}
              onToggleSelecionado={toggleSelecionadoPropina}
            />
          </div>

          {isAdmin ? (
            // ADMIN: mensalidade e multa são sempre secções e checkboxes independentes — tickar a
            // mensalidade, a multa, ou ambas junta-as no mesmo lote (§pedido do cliente 2026-08-18).
            estado.multas.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
                  Multas por atraso (selecione as pendentes para confirmar em conjunto)
                </p>
                <MultasPendentes
                  multas={estado.multas}
                  editable
                  selecionados={selecionadosPropinas}
                  onToggleSelecionado={toggleSelecionadoPropina}
                />
              </div>
            ) : null
          ) : multasOrfas.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
                Outras multas (sem mensalidade correspondente no mesmo mês)
              </p>
              {/* Só ADMIN paga uma multa órfã isolada (§pedido do cliente 2026-08-18) — a
                  Secretaria vê que está pendente, mas não a consegue marcar como paga sozinha. */}
              <MultasPendentes multas={multasOrfas} editable={false} />
            </div>
          ) : null}
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
