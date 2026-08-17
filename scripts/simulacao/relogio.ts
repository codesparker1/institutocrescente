/**
 * Lado do orquestrador do relógio simulado (contraparte de `getAgora()` em `src/lib/tempo.ts`).
 * Não importa esse ficheiro diretamente — está marcado `server-only` e o caminho aqui é
 * independente por desenho: este script fala com o `next dev`/`next start` só por HTTP, nunca
 * partilha módulos com ele. O caminho TEM de coincidir com `RELOGIO_PATH` em `src/lib/tempo.ts`.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const RELOGIO_PATH = path.join(process.cwd(), "scripts", "simulacao", ".relogio");

export function avancarRelogio(data: Date): void {
  mkdirSync(path.dirname(RELOGIO_PATH), { recursive: true });
  writeFileSync(RELOGIO_PATH, data.toISOString());
}
