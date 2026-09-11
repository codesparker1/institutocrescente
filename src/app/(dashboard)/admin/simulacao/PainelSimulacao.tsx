"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import {
  derivarFluxos,
  entidadesMaisAtravessadas,
  RAIAS_VISIVEIS,
  RAIA_LABEL,
  type RaiaSimulacao,
} from "@/lib/simulacao";

export interface CorridaResumo {
  runId: string;
  eventos: number;
  inicio: string;
  fim: string;
}

export interface EventoPainel {
  id: string;
  raia: RaiaSimulacao;
  tipo: string;
  acao: string;
  papel: string | null;
  rota: string | null;
  anomalia: string | null;
  entidade: string | null;
  escrita: boolean;
  dataSimulada: string;
  dataReal: string;
  duracaoMs: number | null;
}

interface PainelSimulacaoProps {
  corridas: CorridaResumo[];
  runIdAtual: string;
  eventos: EventoPainel[];
}

/** Cor por raia. Tons discretos de propósito — a cor saturada fica reservada à severidade, senão
 *  o painel grita todo ao mesmo tempo e a anomalia deixa de saltar à vista. */
const COR_RAIA: Record<RaiaSimulacao, string> = {
  aluno: "#1f7d84",
  secretaria: "#4f46a8",
  professor: "#96562f",
  daac: "#9c3f61",
  sistema: "#8a6d33",
};

const INTERVALO_AO_VIVO_MS = 3000;

function horaSimulada(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dataSimuladaCompleta(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Duração real decorrida desde o início da corrida, em h:mm:ss. */
function decorrido(desde: string, ate: string): string {
  const ms = Math.max(0, new Date(ate).getTime() - new Date(desde).getTime());
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * A sala de comando. Client Component porque as setas precisam de medir o DOM (getBoundingClientRect)
 * depois de as colunas assentarem — não há como as posicionar do servidor.
 *
 * Ao vivo é `router.refresh()` em intervalo, não uma rota de API própria: o painel já é um Server
 * Component a ler da BD, e o refresh volta a correr essa leitura. Uma segunda fonte de dados (rota
 * + componente) seria outro sítio onde a forma dos eventos poderia divergir.
 */
export function PainelSimulacao({ corridas, runIdAtual, eventos }: PainelSimulacaoProps) {
  const router = useRouter();
  const [aoVivo, setAoVivo] = useState(false);
  const [filtro, setFiltro] = useState<"tudo" | "escrita" | "anomalia">("tudo");
  /** null = nunca foi arrastada; segue o fim da corrida sozinha. */
  const [posicaoManual, setPosicaoManual] = useState<number | null>(null);

  const palcoRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const chipsRef = useRef(new Map<string, HTMLElement>());

  // Derivada, não guardada num efeito: ao vivo a posição é sempre o fim (parar no evento 40
  // enquanto entram o 41 e o 42 seria um "ao vivo" que não mostra o que está a acontecer), e sem
  // arrasto nenhum também. Um useEffect a chamar setPosicao daria um render em cascata a cada
  // sondagem — e a regra react-hooks/set-state-in-effect proíbe-o, com razão.
  const posicao = aoVivo || posicaoManual === null ? eventos.length : Math.min(posicaoManual, eventos.length);

  useEffect(() => {
    if (!aoVivo) return;
    const id = setInterval(() => router.refresh(), INTERVALO_AO_VIVO_MS);
    return () => clearInterval(id);
  }, [aoVivo, router]);

  const visiveis = eventos.slice(0, posicao);
  const atravessadas = entidadesMaisAtravessadas(visiveis, 4);
  const anomalias = visiveis.filter((e) => e.anomalia).length;
  const escritas = visiveis.filter((e) => e.escrita).length;
  const ultimo = visiveis[visiveis.length - 1];
  const corrida = corridas.find((c) => c.runId === runIdAtual);

  /**
   * Desenha as setas depois do layout. `useLayoutEffect` e não `useEffect` porque medir antes de o
   * browser pintar evita o frame em que as setas aparecem no sítio errado.
   *
   * Tudo dentro do efeito — os fluxos recalculam-se aqui a partir de `eventos`/`posicao` em vez de
   * virem numa `useCallback`. Um array criado a cada render como dependência impede o React
   * Compiler de preservar a memoização (regra preserve-manual-memoization), e a memoização não
   * trazia nada: o trabalho é medir o DOM, que tem de acontecer a cada mudança de layout na mesma.
   */
  useLayoutEffect(() => {
    const svg = svgRef.current;
    const palco = palcoRef.current;
    if (!svg || !palco) return;

    const chips = chipsRef.current;
    const NS = "http://www.w3.org/2000/svg";

    const desenhar = () => {
      const caixa = palco.getBoundingClientRect();
      svg.setAttribute("viewBox", `0 0 ${caixa.width} ${caixa.height}`);
      svg.setAttribute("width", String(caixa.width));
      svg.setAttribute("height", String(caixa.height));
      svg.replaceChildren();

      for (const fluxo of derivarFluxos(eventos.slice(0, posicao))) {
        const de = chips.get(fluxo.deId);
        const para = chips.get(fluxo.paraId);
        if (!de || !para) continue;

        const a = de.getBoundingClientRect();
        const b = para.getBoundingClientRect();
        const daEsquerda = a.left < b.left;
        const x1 = (daEsquerda ? a.right : a.left) - caixa.left;
        const x2 = (daEsquerda ? b.left : b.right) - caixa.left;
        const y1 = a.top - caixa.top + a.height / 2;
        const y2 = b.top - caixa.top + b.height / 2;
        const mx = (x1 + x2) / 2;
        const cor = COR_RAIA[fluxo.paraRaia];
        const d = `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;

        // Halo da cor do fundo por baixo do traço: sem ele a seta lê-se mal ao passar por cima
        // de um cartão de outra raia.
        const halo = document.createElementNS(NS, "path");
        halo.setAttribute("d", d);
        halo.setAttribute("fill", "none");
        halo.setAttribute("stroke", "#f5f3ec");
        halo.setAttribute("stroke-width", "6");

        const traco = document.createElementNS(NS, "path");
        traco.setAttribute("d", d);
        traco.setAttribute("fill", "none");
        traco.setAttribute("stroke", cor);
        traco.setAttribute("stroke-width", "1.5");
        traco.setAttribute("stroke-dasharray", "3 3");
        traco.setAttribute("opacity", "0.8");

        const ponta = document.createElementNS(NS, "circle");
        ponta.setAttribute("cx", String(x2));
        ponta.setAttribute("cy", String(y2));
        ponta.setAttribute("r", "2.5");
        ponta.setAttribute("fill", cor);

        svg.append(halo, traco, ponta);
      }
    };

    desenhar();
    window.addEventListener("resize", desenhar);
    return () => window.removeEventListener("resize", desenhar);
  }, [eventos, posicao]);

  const linhasLog = visiveis.filter((e) => {
    if (filtro === "anomalia") return Boolean(e.anomalia);
    if (filtro === "escrita") return e.escrita;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de comando */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-navy-100 bg-white px-4 py-3">
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-texto-suave">Relógio simulado</span>
          <span className="font-mono text-xl font-semibold text-gold-700 tabular-nums">
            {ultimo ? dataSimuladaCompleta(ultimo.dataSimulada) : "—"}
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-texto-suave">Tempo real</span>
          <span className="font-mono text-sm tabular-nums text-texto">
            {corrida && ultimo ? decorrido(corrida.inicio, ultimo.dataReal) : "—"}
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-texto-suave">Escritas</span>
          <span className="font-mono text-sm tabular-nums text-texto">{escritas}</span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-texto-suave">Anomalias</span>
          <span className={`font-mono text-sm tabular-nums ${anomalias > 0 ? "font-semibold text-red-600" : "text-texto"}`}>
            {anomalias}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Select
            value={runIdAtual}
            onChange={(e) => router.push(`/admin/simulacao?corrida=${encodeURIComponent(e.target.value)}`)}
            className="py-1.5 text-xs"
            aria-label="Corrida"
          >
            {corridas.map((c) => (
              <option key={c.runId} value={c.runId}>
                {c.runId} ({c.eventos})
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={() => setAoVivo((v) => !v)}
            aria-pressed={aoVivo}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
              aoVivo ? "border-red-300 bg-red-50 text-red-700" : "border-navy-100 bg-navy-50 text-texto hover:border-navy-300"
            }`}
          >
            {aoVivo ? "● Ao vivo" : "Ao vivo"}
          </button>
        </div>
      </div>

      {/* Linha temporal */}
      <div className="flex items-center gap-3 rounded-lg border border-navy-100 bg-white px-4 py-2.5">
        <span className="whitespace-nowrap font-mono text-xs tabular-nums text-texto-suave">
          evento {posicao} / {eventos.length}
        </span>
        <input
          type="range"
          min={0}
          max={eventos.length}
          value={posicao}
          disabled={aoVivo}
          onChange={(e) => setPosicaoManual(Number(e.target.value))}
          className="flex-1 accent-gold-600 disabled:opacity-40"
          aria-label="Posição na corrida"
        />
        {atravessadas.length > 0 ? (
          <span className="hidden whitespace-nowrap font-mono text-[11px] text-texto-suave lg:inline">
            mais atravessada: {atravessadas[0].entidade} ({atravessadas[0].raias} raias)
          </span>
        ) : null}
      </div>

      {/* Raias + setas */}
      <div ref={palcoRef} className="relative">
        <svg ref={svgRef} className="pointer-events-none absolute inset-0 z-10 overflow-visible" aria-hidden="true" />
        <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {RAIAS_VISIVEIS.map((raia) => {
            const daRaia = visiveis.filter((e) => e.raia === raia);
            return (
              <div key={raia} className="flex min-w-0 flex-col">
                <div
                  className="sticky top-0 z-20 flex items-baseline gap-2 border-b-2 bg-background pb-2 pt-2"
                  style={{ borderColor: COR_RAIA[raia] }}
                >
                  <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: COR_RAIA[raia] }}>
                    {RAIA_LABEL[raia]}
                  </h2>
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-texto-suave">{daRaia.length}</span>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  {daRaia.map((evento) => (
                    <article
                      key={evento.id}
                      ref={(el) => {
                        if (el) chipsRef.current.set(evento.id, el);
                        else chipsRef.current.delete(evento.id);
                      }}
                      className={`relative z-20 rounded-md border border-l-2 px-2.5 py-2 shadow-sm ${
                        evento.anomalia ? "border-red-300 bg-red-50" : "border-navy-100 bg-white"
                      }`}
                      style={evento.anomalia ? undefined : { borderLeftColor: COR_RAIA[raia] }}
                    >
                      <div className="flex items-baseline gap-2">
                        <time className="font-mono text-[10px] tabular-nums text-texto-suave">
                          {horaSimulada(evento.dataSimulada)}
                        </time>
                        {evento.escrita ? (
                          <span className="rounded bg-gold-100 px-1 text-[9px] font-semibold uppercase tracking-wide text-gold-800">
                            escreve
                          </span>
                        ) : null}
                        {evento.duracaoMs !== null ? (
                          <span className="ml-auto font-mono text-[10px] tabular-nums text-texto-suave">
                            {evento.duracaoMs}ms
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-0.5 text-xs font-medium leading-snug text-texto">{evento.acao}</p>
                      {evento.papel ? <p className="text-[10px] text-texto-suave">{evento.papel}</p> : null}

                      {evento.entidade ? (
                        <span
                          className="mt-1.5 inline-block rounded border px-1.5 py-px font-mono text-[9px]"
                          style={{ color: COR_RAIA[raia], borderColor: `${COR_RAIA[raia]}55` }}
                        >
                          {evento.entidade}
                        </span>
                      ) : null}

                      {evento.anomalia ? (
                        <p className="mt-1.5 border-t border-dashed border-red-300 pt-1.5 text-[11px] leading-snug text-red-700">
                          {evento.anomalia}
                        </p>
                      ) : null}
                    </article>
                  ))}

                  {daRaia.length === 0 ? (
                    <p className="rounded-md border border-dashed border-navy-100 px-2.5 py-3 text-center text-[11px] text-texto-suave">
                      Sem eventos
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Marcos do sistema — jobs e saltos de relógio não pertencem a nenhuma coluna. */}
      {visiveis.some((e) => e.raia === "sistema") ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-navy-100 bg-white p-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-texto-suave">Marcos do sistema</h2>
          {visiveis
            .filter((e) => e.raia === "sistema")
            .slice(-8)
            .map((e) => (
              <div key={e.id} className="flex items-baseline gap-3 font-mono text-[11px]">
                <span className="tabular-nums text-gold-700">{horaSimulada(e.dataSimulada)}</span>
                <span className="text-texto">{e.acao}</span>
                {e.duracaoMs !== null ? <span className="ml-auto tabular-nums text-texto-suave">{e.duracaoMs}ms</span> : null}
              </div>
            ))}
        </div>
      ) : null}

      {/* Log */}
      <div className="rounded-lg border border-navy-100 bg-white">
        <div className="flex items-center gap-2 border-b border-navy-50 px-4 py-2.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-texto">Log da corrida</h2>
          <span className="font-mono text-[11px] text-texto-suave">{linhasLog.length} linhas</span>
          <div className="ml-auto flex gap-1.5">
            {(["tudo", "escrita", "anomalia"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                aria-pressed={filtro === f}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                  filtro === f ? "border-navy-700 bg-navy-700 text-gold-100" : "border-navy-100 text-texto-suave hover:border-navy-300"
                }`}
              >
                {f === "tudo" ? "Tudo" : f === "escrita" ? "Escritas" : "Anomalias"}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-64 overflow-auto px-4 py-2 font-mono text-[11px] leading-relaxed">
          {linhasLog.length === 0 ? (
            <p className="py-2 text-texto-suave">Nada com este filtro.</p>
          ) : (
            linhasLog
              .slice()
              .reverse()
              .map((e) => (
                <div key={e.id} className="grid grid-cols-[88px_84px_1fr_56px] gap-3 py-px tabular-nums">
                  <span className="text-gold-700">{horaSimulada(e.dataSimulada)}</span>
                  <span style={{ color: COR_RAIA[e.raia] }}>{e.papel ?? RAIA_LABEL[e.raia]}</span>
                  <span className={`truncate ${e.anomalia ? "font-medium text-red-600" : "text-texto"}`}>
                    {e.acao}
                    {e.entidade ? ` · ${e.entidade}` : ""}
                  </span>
                  <span className="text-right text-texto-suave">{e.duracaoMs !== null ? `${e.duracaoMs}ms` : ""}</span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
