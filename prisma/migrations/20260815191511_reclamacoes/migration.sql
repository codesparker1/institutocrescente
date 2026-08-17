-- CreateEnum
CREATE TYPE "ReclamacaoCategoria" AS ENUM ('SUGESTAO', 'RECLAMACAO', 'PROBLEMA_TECNICO', 'OUTRO');

-- CreateEnum
CREATE TYPE "ReclamacaoStatus" AS ENUM ('PENDENTE', 'EM_ANALISE', 'RESOLVIDO');

-- CreateTable
CREATE TABLE "Reclamacao" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "categoria" "ReclamacaoCategoria" NOT NULL DEFAULT 'OUTRO',
    "assunto" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "status" "ReclamacaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "resposta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reclamacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reclamacao_alunoId_idx" ON "Reclamacao"("alunoId");

-- CreateIndex
CREATE INDEX "Reclamacao_status_idx" ON "Reclamacao"("status");

-- AddForeignKey
ALTER TABLE "Reclamacao" ADD CONSTRAINT "Reclamacao_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
