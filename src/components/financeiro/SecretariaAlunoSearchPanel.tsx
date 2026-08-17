"use client";

import { useEffect, useState, useTransition } from "react";
import { Search, Loader2 } from "lucide-react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
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

interface SecretariaAlunoSearchPanelProps {
  cursos: string[];
}

export function SecretariaAlunoSearchPanel({ cursos }: SecretariaAlunoSearchPanelProps) {
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

  function carregarEstado(aluno: AlunoResultadoPesquisa) {
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

  return (
    <Card>
      <CardHeader
        title="Pesquisa Rápida de Aluno"
        subtitle="Escreva o nome ou filtre por curso/ano/período para pesquisar automaticamente."
      />
      <CardBody className="flex flex-col gap-4">
        <div className="relative grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (aSelecionado) {
                  setASelecionado(null);
                  setEstado(null);
                }
              }}
              placeholder="Nome ou nº do aluno..."
              className="pl-9"
              autoComplete="off"
              name="pesquisa-aluno-secretaria"
            />
            {isSearching ? (
              <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-navy-300" />
            ) : null}
          </div>

          <Select value={filtroCurso} onChange={(e) => setFiltroCurso(e.target.value)}>
            <option value="">Todos os cursos</option>
            {cursos.map((curso) => (
              <option key={curso} value={curso}>
                {curso}
              </option>
            ))}
          </Select>

          <Select value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)}>
            <option value="">Todos os anos</option>
            {ANOS_CURRICULARES.map((ano) => (
              <option key={ano} value={ano}>
                {ano}º Ano
              </option>
            ))}
          </Select>

          <Select value={filtroPeriodo} onChange={(e) => setFiltroPeriodo(e.target.value)}>
            <option value="">Todos os períodos</option>
            {PERIODOS.map((periodo) => (
              <option key={periodo.value} value={periodo.value}>
                {periodo.label}
              </option>
            ))}
          </Select>

          {resultados.length > 0 ? (
            <div className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-navy-100 bg-white shadow-lg sm:w-auto sm:min-w-[28rem]">
              {resultados.map((aluno) => (
                <button
                  key={aluno.id}
                  type="button"
                  onClick={() => carregarEstado(aluno)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-navy-50"
                >
                  <span className="font-medium text-navy-900">{aluno.nome}</span>
                  <span className="shrink-0 text-xs text-navy-400">
                    {aluno.numeroEstudante} · {aluno.curso} · {aluno.anoCurricular}º Ano
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {aSelecionado ? (
          <div className="grid grid-cols-1 gap-4 border-t border-navy-50 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-lg font-bold text-navy-900">{aSelecionado.nome}</p>
                <p className="text-xs text-navy-400">{aSelecionado.numeroEstudante}</p>
              </div>
              <div className="flex flex-col gap-1.5 text-sm">
                <InfoRow label="Curso" value={aSelecionado.curso} />
                <InfoRow label="Ano" value={`${aSelecionado.anoCurricular}º Ano`} />
                <InfoRow label="Email" value={aSelecionado.email ?? "—"} />
              </div>
              {estado ? (
                <div
                  className={cn(
                    "mt-1 rounded-lg border px-3 py-2",
                    estado.saldoEmDivida > 0 ? "border-red-100 bg-red-50" : "border-emerald-100 bg-emerald-50",
                  )}
                >
                  <p className="text-xs text-navy-400">Dívida</p>
                  <p
                    className={cn(
                      "text-lg font-bold",
                      estado.saldoEmDivida > 0 ? "text-red-600" : "text-emerald-700",
                    )}
                  >
                    {formatCurrency(estado.saldoEmDivida)}
                  </p>
                </div>
              ) : null}
              <button
                type="button"
                onClick={novaPesquisa}
                className="self-start text-xs font-medium text-navy-400 hover:text-navy-600"
              >
                Nova pesquisa
              </button>
            </div>

            <div>
              {!estado || isLoadingEstado ? (
                <p className="text-sm text-navy-400">A carregar...</p>
              ) : (
                <PagamentosSecretariaPanel
                  alunoId={aSelecionado.id}
                  estado={estado}
                  catalogoEmolumentos={catalogoEmolumentos}
                  emolumentosPagos={emolumentosPagos}
                  onAtualizado={() => carregarEstado(aSelecionado)}
                />
              )}
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-navy-400">{label}</span>
      <span className="font-medium text-navy-800">{value}</span>
    </div>
  );
}
