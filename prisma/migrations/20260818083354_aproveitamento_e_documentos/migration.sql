-- AlterTable
ALTER TABLE "InscricaoCadeira" ADD COLUMN     "creditada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "instituicaoOrigemCreditado" TEXT;

-- CreateTable
CREATE TABLE "DocumentoAluno" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "blobPathname" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "carregadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoAluno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentoAluno_alunoId_idx" ON "DocumentoAluno"("alunoId");

-- AddForeignKey
ALTER TABLE "DocumentoAluno" ADD CONSTRAINT "DocumentoAluno_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoAluno" ADD CONSTRAINT "DocumentoAluno_carregadoPorId_fkey" FOREIGN KEY ("carregadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
