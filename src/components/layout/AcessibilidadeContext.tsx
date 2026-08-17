"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const CHAVE_STORAGE = "acessibilidade-escala-registo";
const ESCALA_PADRAO = 1;
export const ESCALA_MIN = 0.8;
export const ESCALA_MAX = 1.3;

interface AcessibilidadeContextValue {
  escala: number;
  setEscala: (valor: number) => void;
}

const AcessibilidadeContext = createContext<AcessibilidadeContextValue | null>(null);

/**
 * Escala de texto/espaçamento do Registo de Pagamentos, controlada pelo slider na barra lateral.
 * Persistida em localStorage — a secretaria não devia ter de reajustar isto sempre que entra.
 */
export function AcessibilidadeProvider({ children }: { children: ReactNode }) {
  const [escala, setEscalaState] = useState(ESCALA_PADRAO);

  useEffect(() => {
    const guardado = window.localStorage.getItem(CHAVE_STORAGE);
    const valor = guardado ? Number(guardado) : NaN;
    // Ler o localStorage tem de esperar pelo mount (não existe no render do servidor) — este
    // setState não é estado derivado de props, é hidratação a partir de um sistema externo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!Number.isNaN(valor)) setEscalaState(Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, valor)));
  }, []);

  function setEscala(valor: number) {
    const limitado = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, valor));
    setEscalaState(limitado);
    window.localStorage.setItem(CHAVE_STORAGE, String(limitado));
  }

  return <AcessibilidadeContext.Provider value={{ escala, setEscala }}>{children}</AcessibilidadeContext.Provider>;
}

export function useAcessibilidade(): AcessibilidadeContextValue {
  const context = useContext(AcessibilidadeContext);
  if (!context) throw new Error("useAcessibilidade tem de ser usado dentro de AcessibilidadeProvider");
  return context;
}
