-- DropForeignKey
ALTER TABLE "Frequencia" DROP CONSTRAINT "Frequencia_matriculaId_fkey";

-- DropForeignKey
ALTER TABLE "Nota" DROP CONSTRAINT "Nota_matriculaId_fkey";

-- DropIndex
DROP INDEX "Frequencia_aulaId_matriculaId_key";

-- DropIndex
DROP INDEX "Nota_avaliacaoId_matriculaId_key";

-- AlterTable
ALTER TABLE "Frequencia" DROP COLUMN "matriculaId",
ADD COLUMN     "inscricaoCadeiraId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Nota" DROP COLUMN "matriculaId",
ADD COLUMN     "inscricaoCadeiraId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TurmaDisciplina" ADD COLUMN     "cadeiraCurricularId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "CadeiraCurricular" (
    "id" TEXT NOT NULL,
    "cursoId" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "anoCurricular" INTEGER NOT NULL,
    "semestre" INTEGER NOT NULL,

    CONSTRAINT "CadeiraCurricular_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InscricaoCadeira" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "cadeiraCurricularId" TEXT NOT NULL,
    "turmaDisciplinaId" TEXT NOT NULL,
    "tentativa" INTEGER NOT NULL DEFAULT 1,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InscricaoCadeira_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CadeiraCurricular_cursoId_disciplinaId_anoCurricular_semest_key" ON "CadeiraCurricular"("cursoId", "disciplinaId", "anoCurricular", "semestre");

-- CreateIndex
CREATE UNIQUE INDEX "InscricaoCadeira_alunoId_cadeiraCurricularId_tentativa_key" ON "InscricaoCadeira"("alunoId", "cadeiraCurricularId", "tentativa");

-- CreateIndex
CREATE UNIQUE INDEX "Frequencia_aulaId_inscricaoCadeiraId_key" ON "Frequencia"("aulaId", "inscricaoCadeiraId");

-- CreateIndex
CREATE UNIQUE INDEX "Nota_avaliacaoId_inscricaoCadeiraId_key" ON "Nota"("avaliacaoId", "inscricaoCadeiraId");

-- AddForeignKey
ALTER TABLE "CadeiraCurricular" ADD CONSTRAINT "CadeiraCurricular_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadeiraCurricular" ADD CONSTRAINT "CadeiraCurricular_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "Disciplina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurmaDisciplina" ADD CONSTRAINT "TurmaDisciplina_cadeiraCurricularId_fkey" FOREIGN KEY ("cadeiraCurricularId") REFERENCES "CadeiraCurricular"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscricaoCadeira" ADD CONSTRAINT "InscricaoCadeira_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscricaoCadeira" ADD CONSTRAINT "InscricaoCadeira_cadeiraCurricularId_fkey" FOREIGN KEY ("cadeiraCurricularId") REFERENCES "CadeiraCurricular"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscricaoCadeira" ADD CONSTRAINT "InscricaoCadeira_turmaDisciplinaId_fkey" FOREIGN KEY ("turmaDisciplinaId") REFERENCES "TurmaDisciplina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_inscricaoCadeiraId_fkey" FOREIGN KEY ("inscricaoCadeiraId") REFERENCES "InscricaoCadeira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Frequencia" ADD CONSTRAINT "Frequencia_inscricaoCadeiraId_fkey" FOREIGN KEY ("inscricaoCadeiraId") REFERENCES "InscricaoCadeira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

