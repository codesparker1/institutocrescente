import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

p.user
  .findMany({
    where: { email: { in: ["dev@ispc.ao", "admin@ispc.ao"] } },
    select: { email: true, role: true, deveTrocarSenha: true },
  })
  .then(async (us) => {
    console.log(JSON.stringify(us, null, 1));
    await p.$disconnect();
  })
  .catch(async (e) => {
    console.error("ERRO:", e instanceof Error ? e.message : e);
    await p.$disconnect();
    process.exit(1);
  });
