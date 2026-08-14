-- CreateEnum
CREATE TYPE "Epoca" AS ENUM ('P1', 'P2', 'EXAME', 'RECURSO', 'EXAME_ESPECIAL');

-- AlterTable
ALTER TABLE "Avaliacao" DROP COLUMN "nome",
DROP COLUMN "peso",
DROP COLUMN "tipo",
ADD COLUMN     "epoca" "Epoca" NOT NULL,
ADD COLUMN     "prazoLancamento" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "CadeiraCurricular" ADD COLUMN     "notaMinimaDispensa" DECIMAL(4,2) NOT NULL DEFAULT 14,
ADD COLUMN     "permiteDispensa" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "InscricaoCadeira" ADD COLUMN     "notaMinimaDispensaAplicada" DECIMAL(4,2) NOT NULL,
ADD COLUMN     "permiteDispensaAplicada" BOOLEAN NOT NULL;

-- DropEnum
DROP TYPE "AvaliacaoTipo";

-- CreateIndex
CREATE UNIQUE INDEX "Avaliacao_turmaDisciplinaId_epoca_key" ON "Avaliacao"("turmaDisciplinaId", "epoca");

