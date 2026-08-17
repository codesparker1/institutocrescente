"use client";

import { Type } from "lucide-react";
import { useAcessibilidade, ESCALA_MIN, ESCALA_MAX } from "./AcessibilidadeContext";

/** Controla o tamanho do texto/espaçamento do Registo de Pagamentos — a única página pensada para acessibilidade. */
export function AcessibilidadeSlider() {
  const { escala, setEscala } = useAcessibilidade();

  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-navy-800 px-3 pt-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-navy-400">
        <Type size={14} />
        Tamanho · Registo de Pagamentos
      </div>
      <div className="flex items-center gap-2 px-1 pb-1">
        <span className="text-xs text-navy-400">A</span>
        <input
          type="range"
          min={ESCALA_MIN}
          max={ESCALA_MAX}
          step={0.05}
          value={escala}
          onChange={(e) => setEscala(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer accent-gold-400"
          aria-label="Tamanho do texto do Registo de Pagamentos"
        />
        <span className="text-base text-navy-400">A</span>
      </div>
    </div>
  );
}
