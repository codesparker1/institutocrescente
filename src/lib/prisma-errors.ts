import { Prisma } from "@/generated/prisma/client";

/**
 * SQLSTATE do PostgreSQL para violação de chave estrangeira: `23503` no caso normal, `23001` quando
 * a chave é ON DELETE RESTRICT — que é o caso de quase todas as deste sistema.
 */
const SQLSTATE_CHAVE_ESTRANGEIRA = new Set(["23503", "23001"]);

/** Procura um SQLSTATE de FK no erro embrulhado pelo adaptador, sem assumir a forma exata do objeto. */
function sqlStateDeChaveEstrangeira(valor: unknown, profundidade = 0): boolean {
  if (profundidade > 4 || valor === null || typeof valor !== "object") return false;
  const registo = valor as Record<string, unknown>;
  if (typeof registo.code === "string" && SQLSTATE_CHAVE_ESTRANGEIRA.has(registo.code)) return true;
  return ["cause", "driverAdapterError", "meta"].some((chave) =>
    sqlStateDeChaveEstrangeira(registo[chave], profundidade + 1),
  );
}

/**
 * True quando o erro é uma violação de chave estrangeira — ex: apagar um registo ainda referenciado
 * por outro.
 *
 * Não chega verificar `P2003` (§bug reportado 2026-09-07): o Prisma 7 com o adaptador `pg` deixa de
 * traduzir estes erros e entrega-os como `P2039`, com o SQLSTATE real enterrado em
 * `meta.driverAdapterError.cause`. Enquanto só se olhava ao P2003, TODAS as mensagens de "não é
 * possível remover" ficavam mortas e o utilizador levava com o erro cru da base de dados.
 *
 * Três camadas, da mais fiável para a menos: o código do Prisma, o SQLSTATE embrulhado, e por fim o
 * texto da mensagem — que o Prisma inclui no formato "Database error. Code: `23001`".
 */
export function isForeignKeyViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2003") return true;
  if (sqlStateDeChaveEstrangeira(error.meta)) return true;
  return /violates .{0,40}foreign key constraint|Code: `230(01|03)`/.test(error.message);
}

/** True quando o erro é uma violação de unicidade (P2002) — ex: email já usado por outra conta. */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
