-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'DAAC';

-- AlterTable
ALTER TABLE "Aluno" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "telefone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "numeroEstudante" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_numeroEstudante_key" ON "User"("numeroEstudante");

