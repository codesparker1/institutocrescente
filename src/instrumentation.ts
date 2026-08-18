/**
 * DIAGNÓSTICO TEMPORÁRIO — uma corrida do cost-meter (simulação caótica do ano letivo) apanhou
 * um HTTP 500 em /admin/cursos sem conseguir capturar o stack trace real: o stdout do processo
 * `next start` neste workflow tem-se mostrado nada fiável a chegar ao ficheiro de log do CI
 * (corta sempre a meio, mesmo com stdbuf -oL). onRequestError é o mecanismo oficial do Next.js
 * para apanhar QUALQUER erro de renderização do lado do servidor, independentemente de qual
 * componente/rota o lançou — e grava direto em disco via fs, contornando o stdout por completo.
 * Remover depois de explicar o achado.
 *
 * IMPORTANTE: instrumentation.ts é empacotado tanto para o runtime Node.js como para o Edge
 * (usado por src/middleware.ts, que corre em quase todos os pedidos) — um `import` estático de
 * "node:fs" no topo do ficheiro parte o bundle Edge inteiro ("Native module not found: node:fs"),
 * derrubando a app toda. O guard por NEXT_RUNTIME + import() dinâmico evita isso.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | Array<string> | undefined> },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { appendFileSync } = await import("node:fs");
    const path = await import("node:path");
    const detalhe = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    appendFileSync(
      path.join(process.cwd(), "diagnostico-servidor.log"),
      `[diag-onRequestError] ${new Date().toISOString()} path=${request.path} method=${request.method}\n${detalhe}\n---\n`,
    );
  } catch {
    // Melhor perder o diagnóstico do que mascarar o erro original.
  }
}
