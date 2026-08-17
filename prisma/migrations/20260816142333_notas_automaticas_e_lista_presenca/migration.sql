-- AlterTable
ALTER TABLE "ConfiguracaoAcademica" ADD COLUMN     "ultimaVerificacaoNotasEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Nota" ADD COLUMN     "automatica" BOOLEAN NOT NULL DEFAULT false;
