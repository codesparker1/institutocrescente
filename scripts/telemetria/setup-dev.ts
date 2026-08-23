import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const run = async () => {
  const hash = await bcrypt.hash("Ispc@2026", 10);
  const dev = await p.user.upsert({
    where: { email: "dev@ispc.ao" },
    update: {},
    create: { name: "DEV ISPC", email: "dev@ispc.ao", passwordHash: hash, role: "DEV" },
  });
  console.log("DEV user ready:", dev.email);
  // Ler config atual para referência
  const c = await p.configuracaoAcademica.findUnique({ where: { id: "config" } });
  console.log("Config atual:", JSON.stringify(
    { matriculaInicio: c?.matriculaInicio, matriculaFim: c?.matriculaFim, anoLetivoInicio: c?.anoLetivoInicio, anoLetivoFim: c?.anoLetivoFim, semestreAtual: c?.semestreAtual },
    null,
    2,
  ));
  await p.$disconnect();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
