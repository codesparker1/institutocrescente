-- CreateEnum
CREATE TYPE "RegraRetencao" AS ENUM ('SO_REPROVADAS', 'ANO_INTEIRO');

-- CreateTable
CREATE TABLE "ConfiguracaoAcademica" (
    "id" TEXT NOT NULL DEFAULT 'config',
    "limiteReprovacoes" INTEGER NOT NULL DEFAULT 2,
    "regraRetencao" "RegraRetencao" NOT NULL DEFAULT 'SO_REPROVADAS',
    "matriculaInicio" TIMESTAMP(3),
    "matriculaFim" TIMESTAMP(3),
    "ultimaSuspensaoEm" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedPorId" TEXT,

    CONSTRAINT "ConfiguracaoAcademica_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ConfiguracaoAcademica" ADD CONSTRAINT "ConfiguracaoAcademica_updatedPorId_fkey" FOREIGN KEY ("updatedPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

