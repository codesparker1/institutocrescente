-- AlterTable
ALTER TABLE "Aluno" ADD COLUMN     "cadeirasReprovadasAnoAnterior" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ConfiguracaoFinanceira" ADD COLUMN     "percentagemAgravamentoPorCadeira" DECIMAL(5,2) NOT NULL DEFAULT 0;
