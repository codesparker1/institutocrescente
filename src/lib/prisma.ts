import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  // Cada função serverless da Vercel é o seu próprio processo — sem isto, cada invocação abre um
  // pool `pg` com o `max` por omissão (10), e sob concorrência isso esgota rapidamente o limite de
  // ligações do Neon. Em dev (processo único e persistente) o valor por omissão é o correto.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: process.env.VERCEL ? 1 : undefined,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
