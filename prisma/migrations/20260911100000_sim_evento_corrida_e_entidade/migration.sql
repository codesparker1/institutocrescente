-- Painel de simulação (§pedido do cliente 2026-09-11): identidade da corrida e correlação por
-- entidade nos eventos de telemetria. Só ADD COLUMN com valor por omissão / nullable — sem perda
-- de dados e sem reescrita da tabela.

-- AlterTable
ALTER TABLE "SimEvento" ADD COLUMN     "runId" TEXT,
ADD COLUMN     "entidade" TEXT,
ADD COLUMN     "escrita" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "SimEvento_runId_idx" ON "SimEvento"("runId");

-- CreateIndex
CREATE INDEX "SimEvento_runId_entidade_idx" ON "SimEvento"("runId", "entidade");
