-- CreateEnum
CREATE TYPE "CategoriaEstudante" AS ENUM ('NORMAL', 'BOLSEIRO_INAGBE', 'COMPARTICIPADA');

-- AlterTable
ALTER TABLE "Aluno" ADD COLUMN     "categoria" "CategoriaEstudante" NOT NULL DEFAULT 'NORMAL';

