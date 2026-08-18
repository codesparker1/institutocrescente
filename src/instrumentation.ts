import { appendFileSync } from "node:fs";
import path from "node:path";

/**
 * DIAGNÓSTICO TEMPORÁRIO — uma corrida do cost-meter (simulação caótica do ano letivo) apanhou
 * um HTTP 500 em /admin/cursos sem conseguir capturar o stack trace real: o stdout do processo
 * `next start` neste workflow tem-se mostrado nada fiável a chegar ao ficheiro de log do CI
 * (corta sempre a meio, mesmo com stdbuf -oL). onRequestError é o mecanismo oficial do Next.js
 * para apanhar QUALQUER erro de renderização do lado do servidor, independentemente de qual
 * componente/rota o lançou — e grava direto em disco via fs, contornando o stdout por completo.
 * Remover depois de explicar o achado.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | Array<string> | undefined> },
): Promise<void> {
  try {
    const detalhe = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    appendFileSync(
      path.join(process.cwd(), "diagnostico-servidor.log"),
      `[diag-onRequestError] ${new Date().toISOString()} path=${request.path} method=${request.method}\n${detalhe}\n---\n`,
    );
  } catch {
    // Melhor perder o diagnóstico do que mascarar o erro original.
  }
}
