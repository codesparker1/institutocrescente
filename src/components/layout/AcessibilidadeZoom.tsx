"use client";

import type { ReactNode } from "react";
import { useAcessibilidade } from "./AcessibilidadeContext";

/** Aplica a escala do AcessibilidadeSlider a todo o conteúdo — texto, espaçamento e bordas juntos. */
export function AcessibilidadeZoom({ children }: { children: ReactNode }) {
  const { escala } = useAcessibilidade();
  return <div style={{ zoom: escala }}>{children}</div>;
}
