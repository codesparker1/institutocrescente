import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

p.configuracaoAcademica
  .findUnique({
    where: { id: "config" },
    select: { anoLetivoInicio: true, anoLetivoFim: true, semestreAtual: true, matriculaInicio: true, matriculaFim: true },
  })
  .then(async (c) => {
    console.log(JSON.stringify(c, null, 1));
    const [ativos, trancados, turmas] = await Promise.all([
      p.aluno.count({ where: { status: "ATIVO" } }),
      p.aluno.count({ where: { status: "TRANCADO" } }),
      p.turma.findMany({ orderBy: { anoLetivo: "desc" }, take: 3, select: { id: true, anoLetivo: true, _count: { select: { matriculas: true } } } }),
    ]);
    console.log("Alunos ATIVO:", ativos, "| TRANCADO:", trancados);
    console.log("Últimas turmas:", JSON.stringify(turmas.map((t) => ({ ano: t.anoLetivo, matriculas: t._count.matriculas }))));
    await p.$disconnect();
  })
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await p.$disconnect();
    process.exit(1);
  });
