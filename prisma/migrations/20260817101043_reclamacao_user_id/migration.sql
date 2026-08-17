-- AlterTable
ALTER TABLE "Reclamacao" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "Reclamacao_userId_idx" ON "Reclamacao"("userId");

-- AddForeignKey
ALTER TABLE "Reclamacao" ADD CONSTRAINT "Reclamacao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
