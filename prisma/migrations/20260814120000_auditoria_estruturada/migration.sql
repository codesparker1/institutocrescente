-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "details",
ADD COLUMN     "valorAnterior" TEXT,
ADD COLUMN     "valorNovo" TEXT;

