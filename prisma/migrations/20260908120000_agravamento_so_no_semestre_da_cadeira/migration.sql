-- Aditiva, sem perda de dados: novo booleano de configuração + novo contador por aluno.

-- AlterTable
ALTER TABLE "Aluno" ADD COLUMN "cadeirasReprovadasSemestre2AnoAnterior" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ConfiguracaoFinanceira" ADD COLUMN "agravamentoSoNoSemestreDaCadeira" BOOLEAN NOT NULL DEFAULT false;
