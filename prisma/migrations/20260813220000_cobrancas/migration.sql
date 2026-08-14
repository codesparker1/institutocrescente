-- CreateEnum
CREATE TYPE "CobrancaStatus" AS ENUM ('PENDENTE', 'PAGO');

-- CreateEnum
CREATE TYPE "CobrancaTipo" AS ENUM ('INSCRICAO', 'CONFIRMACAO', 'MATRICULA', 'PROPINA', 'MULTA', 'EMOLUMENTO');

-- DropForeignKey
ALTER TABLE "Propina" DROP CONSTRAINT "Propina_alunoId_fkey";

-- DropForeignKey
ALTER TABLE "Propina" DROP CONSTRAINT "Propina_matriculaId_fkey";

-- DropForeignKey
ALTER TABLE "Propina" DROP CONSTRAINT "Propina_registadoPorId_fkey";

-- AlterTable
ALTER TABLE "ConfiguracaoFinanceira" DROP COLUMN "valorMensalPadrao",
ADD COLUMN     "diaVencimento" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "ultimaGeracaoEm" TIMESTAMP(3),
ADD COLUMN     "valorMulta" DECIMAL(10,2) NOT NULL DEFAULT 5000,
ALTER COLUMN "toleranciaDias" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "Curso" ADD COLUMN     "valorPropina" DECIMAL(10,2) NOT NULL DEFAULT 15000;

-- DropTable
DROP TABLE "Propina";

-- DropEnum
DROP TYPE "PropinaStatus";

-- CreateTable
CREATE TABLE "Cobranca" (
    "id" TEXT NOT NULL,
    "matriculaId" TEXT,
    "alunoId" TEXT NOT NULL,
    "tipo" "CobrancaTipo" NOT NULL,
    "mesReferencia" TIMESTAMP(3),
    "descricao" TEXT,
    "valorDevido" DECIMAL(10,2) NOT NULL,
    "valorPago" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "CobrancaStatus" NOT NULL DEFAULT 'PENDENTE',
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "registadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cobranca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cobranca_alunoId_status_idx" ON "Cobranca"("alunoId", "status");

-- CreateIndex
CREATE INDEX "Cobranca_status_idx" ON "Cobranca"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Cobranca_alunoId_tipo_mesReferencia_key" ON "Cobranca"("alunoId", "tipo", "mesReferencia");

-- AddForeignKey
ALTER TABLE "Cobranca" ADD CONSTRAINT "Cobranca_matriculaId_fkey" FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobranca" ADD CONSTRAINT "Cobranca_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobranca" ADD CONSTRAINT "Cobranca_registadoPorId_fkey" FOREIGN KEY ("registadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

