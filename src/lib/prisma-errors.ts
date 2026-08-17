import { Prisma } from "@/generated/prisma/client";

/** True quando o erro é uma violação de chave estrangeira (P2003) — ex: apagar um registo ainda referenciado por outro. */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

/** True quando o erro é uma violação de unicidade (P2002) — ex: email já usado por outra conta. */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
