"use client";

import { useEffect, useState, useTransition } from "react";
import { Search, Loader2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { cn, formatCurrency } from "@/lib/utils";
import { PagamentosSecretariaPanel } from "./PagamentosSecretariaPanel";
import {
  searchAlunosAction,
  getEstadoFinanceiroAlunoAction,
  getCatalogoEmolumentosAction,
  getEmolumentosPagosAction,
  type AlunoResultadoPesquisa,
} from "@/actions/financeiro";
import type { EstadoFinanceiroAluno, EmolumentoCatalogo, EmolumentoPago } from "@/lib/financeiro";

const ANOS_CURRICULARES = [1, 2, 3, 4, 5, 6];
const PERIODOS = [
  { value: "MATUTINO", label: "Matutino" },
  { value: "VESPERTINO", label: "Vespertino" },
  { value: "NOTURNO", label: "Noturno" },
] as const;

interface RegistoPagamentosBuscaProps {
  cursos: string[];
}

/**
 * Busca do aluno para o Registo de Pagamentos — mais acessível (letras e espaçamento maiores) do
 * que a Página Inicial, com escala ajustável pelo slider da barra lateral (AcessibilidadeSlider).
 */
export function RegistoPagamentosBusca({ cursos }: RegistoPagamentosBuscaProps) {
  const [query, setQuery] = useState("");
  const [filtroCurso, setFiltroCurso] = useState("");
  const [filtroAno, setFiltroAno] = useState("");
  const [filtroPeriodo, setFiltroPeriodo] = useState("");
  const [resultados, setResultados] = useState<AlunoResultadoPesquisa[]>([]);
  const [aSelecionado, setASelecionado] = useState<AlunoResultadoPesquisa | null>(null);
  const [estado, setEstado] = useState<EstadoFinanceiroAluno | null>(null);
  const [catalogoEmolumentos, setCatalogoEmolumentos] = useState<EmolumentoCatalogo[]>([]);
  const [emolumentosPagos, setEmolumentosPagos] = useState<EmolumentoPago[]>([]);
  const [isSearching, startSearch] = useTransition();
  const [isLoadingEstado, startLoadEstado] = useTransition();

  useEffect(() => {
    if (aSelecionado) return;
    const temFiltro = Boolean(filtroCurso || filtroAno || filtroPeriodo);
    const timeout = setTimeout(() => {
      if (query.trim().length < 2 && !temFiltro) {
        setResultados([]);
        return;
      }
      startSearch(async () => {
        const found = await searchAlunosAction({
          query,
          curso: filtroCurso || undefined,
          anoCurricular: filtroAno ? Number(filtroAno) : undefined,
          periodo: (filtroPeriodo || undefined) as "MATUTINO" | "VESPERTINO" | "NOTURNO" | undefined,
        });
        setResultados(found);
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, filtroCurso, filtroAno, filtroPeriodo, aSelecionado]);

  function carregarHistorico(aluno: AlunoResultadoPesquisa) {
    setASelecionado(aluno);
    setResultados([]);
    startLoadEstado(async () => {
      const [dados, catalogo, pagos] = await Promise.all([
        getEstadoFinanceiroAlunoAction(aluno.id),
        getCatalogoEmolumentosAction(),
        getEmolumentosPagosAction(aluno.id),
      ]);
      setEstado(dados);
      setCatalogoEmolumentos(catalogo);
      setEmolumentosPagos(pagos);
    });
  }

  function novaPesquisa() {
    setASelecionado(null);
    setEstado(null);
    setCatalogoEmolumentos([]);
    setEmolumentosPagos([]);
    setQuery("");
    setFiltroCurso("");
    setFiltroAno("");
    setFiltroPeriodo("");
    setResultados([]);
  }

  const selectClassName = "!py-3 !text-base";

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-2">
        <CardBody className="p-6">
          <label htmlFor="busca-registo-pagamentos" className="mb-2 block text-lg font-semibold text-navy-800">
            Nome do aluno
          </label>
          <div className="relative">
            <Search size={22} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-navy-300" />
            <input
              id="busca-registo-pagamentos"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (aSelecionado) {
                  setASelecionado(null);
                  setEstado(null);
                }
              }}
              placeholder="Escreva o nome do aluno..."
              autoComplete="off"
              className="w-full rounded-xl border-2 border-navy-200 bg-white py-4 pl-12 pr-12 text-xl text-navy-900 placeholder:text-navy-300 focus:border-navy-500 focus:outline-none focus:ring-4 focus:ring-navy-100"
            />
            {isSearching ? (
              <Loader2 size={22} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-navy-300" />
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select
              value={filtroCurso}
              onChange={(e) => setFiltroCurso(e.target.value)}
              className={selectClassName}
              aria-label="Filtrar por curso"
            >
              <option value="">Todos os cursos</option>
              {cursos.map((curso) => (
                <option key={curso} value={curso}>
                  {curso}
                </option>
              ))}
            </Select>

            <Select value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)} className={selectClassName} aria-label="Filtrar por ano">
              <option value="">Todos os anos</option>
              {ANOS_CURRICULARES.map((ano) => (
                <option key={ano} value={ano}>
                  {ano}º Ano
                </option>
              ))}
            </Select>

            <Select
              value={filtroPeriodo}
              onChange={(e) => setFiltroPeriodo(e.target.value)}
              className={selectClassName}
              aria-label="Filtrar por período"
            >
              <option value="">Todos os períodos</option>
              {PERIODOS.map((periodo) => (
                <option key={periodo.value} value={periodo.value}>
                  {periodo.label}
                </option>
              ))}
            </Select>
          </div>

          {resultados.length > 0 ? (
            <div className="mt-3 flex flex-col divide-y-2 divide-navy-50 overflow-hidden rounded-xl border-2 border-navy-100">
              {resultados.map((aluno) => (
                <button
                  key={aluno.id}
                  type="button"
                  onClick={() => carregarHistorico(aluno)}
                  className="flex flex-col items-start gap-1 px-5 py-3 text-left hover:bg-navy-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-lg font-semibold text-navy-900">{aluno.nome}</span>
                  <span className="text-base text-navy-500">
                    {aluno.numeroEstudante} · {aluno.curso} · {aluno.anoCurricular}º Ano
                  </span>
                </button>
              ))}
            </div>
          ) : query.trim().length >= 2 && !isSearching && !aSelecionado ? (
            <p className="mt-3 text-base text-navy-400">Nenhum aluno encontrado.</p>
          ) : null}
        </CardBody>
      </Card>

      {aSelecionado ? (
        <Card className="border-2">
          <div className="flex items-start justify-between gap-4 border-b-2 border-navy-50 px-6 py-5">
            <div>
              <h2 className="text-xl font-bold text-navy-900">{aSelecionado.nome}</h2>
              <p className="mt-0.5 text-base text-navy-500">
                {aSelecionado.numeroEstudante} · {aSelecionado.curso} · {aSelecionado.anoCurricular}º Ano
              </p>
            </div>
            <button type="button" onClick={novaPesquisa} className="shrink-0 text-base font-medium text-navy-400 hover:text-navy-600">
              Nova pesquisa
            </button>
          </div>

          <CardBody className="flex flex-col gap-5 p-6">
            {!estado || isLoadingEstado ? (
              <p className="text-base text-navy-400">A carregar histórico de pagamentos...</p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <InfoStatAcessivel label="Total pago" value={formatCurrency(estado.totalPago)} />
                  <InfoStatAcessivel
                    label="Dívida"
                    value={formatCurrency(estado.saldoEmDivida)}
                    destaque={estado.saldoEmDivida > 0}
                  />
                </div>

                <PagamentosSecretariaPanel
                  alunoId={aSelecionado.id}
                  estado={estado}
                  catalogoEmolumentos={catalogoEmolumentos}
                  emolumentosPagos={emolumentosPagos}
                  onAtualizado={() => carregarHistorico(aSelecionado)}
                />
              </>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function InfoStatAcessivel({ label, value, destaque }: { label: string; value: string; destaque?: boolean }) {
  return (
    <div className="rounded-xl border-2 border-navy-100 px-5 py-3">
      <p className="text-base text-navy-500">{label}</p>
      <p className={cn("text-2xl font-bold", destaque ? "text-red-600" : "text-navy-900")}>{value}</p>
    </div>
  );
}
