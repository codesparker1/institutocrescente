-- Telemetria da simulação + auditoria em tempo simulado (2026-08-21)

-- CreateEnum
CREATE TYPE "SimEventoTipo" AS ENUM ('SALTO_RELOGIO', 'REPOR_RELOGIO', 'JOB_GARANTIR', 'ACESSO_DASHBOARD', 'AGENTE_SIMULACAO');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "dataEvento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "SimEvento" (
    "id" TEXT NOT NULL,
    "tipo" "SimEventoTipo" NOT NULL,
    "dataSimulada" TIMESTAMP(3) NOT NULL,
    "dataReal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offsetMs" BIGINT NOT NULL,
    "userId" TEXT,
    "userRole" TEXT,
    "etiqueta" TEXT NOT NULL,
    "detalhes" JSONB,
    "duracaoMs" INTEGER,

    CONSTRAINT "SimEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SimEvento_tipo_idx" ON "SimEvento"("tipo");

-- CreateIndex
CREATE INDEX "SimEvento_dataSimulada_idx" ON "SimEvento"("dataSimulada");

-- CreateIndex
CREATE INDEX "SimEvento_tipo_dataSimulada_idx" ON "SimEvento"("tipo", "dataSimulada");
