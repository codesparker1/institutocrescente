/**
 * Guarda de segurança: os scripts de simulação escrevem no relógio partilhado e apagam/reseedam
 * dados — nunca devem correr contra uma BD Neon "real". §2026-08-24: o deploy de teste na Vercel
 * usa uma Neon ALTERNATIVA (conta nova, ep-old-wind-axst3xo7) criada exatamente para isto, por
 * isso essa é permitida; as outras continuam bloqueadas.
 */
const NEON_PERMITIDA = "ep-old-wind-axst3xo7";

export function garantirNaoENeon(): void {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].filter((u): u is string => Boolean(u));
  const urlNeon = urls.find((u) => u.includes("neon.tech") && !u.includes(NEON_PERMITIDA));
  if (urlNeon) {
    throw new Error(
      `DATABASE_URL/DIRECT_URL aponta para um host Neon não permitido (${new URL(urlNeon).hostname}). ` +
        `Só a Neon de teste (${NEON_PERMITIDA}) é autorizada — corrige o .env antes de continuar.`,
    );
  }
}
