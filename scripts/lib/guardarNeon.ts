/**
 * Guarda dura contra apontar seeds/simulações/CI para o Neon — ao contrário do aviso em
 * scripts/stress/run.mjs (warnIfLooksLikeNeon), esta lança erro e para o processo. Scripts que
 * apagam e recriam dados em massa (seed grande, reset completo) não podem correr contra o Neon
 * de forma alguma — ver feedback_migracoes_local_batch_neon. Chamar isto como primeira linha do
 * `main()` de qualquer script desse tipo.
 */
export function garantirNaoENeon(): void {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].filter((u): u is string => Boolean(u));
  const urlNeon = urls.find((u) => u.includes("neon.tech"));
  if (urlNeon) {
    throw new Error(
      `DATABASE_URL/DIRECT_URL aponta para um host Neon (${new URL(urlNeon).hostname}). ` +
        "Este script nunca pode correr contra o Neon — corrige o .env antes de continuar.",
    );
  }
}
