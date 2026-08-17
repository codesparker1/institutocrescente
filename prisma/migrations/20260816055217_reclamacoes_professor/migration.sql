-- DropForeignKey
ALTER TABLE "Reclamacao" DROP CONSTRAINT "Reclamacao_alunoId_fkey";

-- AlterTable
ALTER TABLE "Reclamacao" ADD COLUMN     "professorId" TEXT,
ALTER COLUMN "alunoId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Reclamacao_professorId_idx" ON "Reclamacao"("professorId");

-- AddForeignKey
ALTER TABLE "Reclamacao" ADD CONSTRAINT "Reclamacao_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reclamacao" ADD CONSTRAINT "Reclamacao_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
