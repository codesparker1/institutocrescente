-- AlterTable
ALTER TABLE "Curso" DROP COLUMN "valorPropina";

-- CreateTable
CREATE TABLE "PrecoPropina" (
    "id" TEXT NOT NULL,
    "categoria" "CategoriaEstudante" NOT NULL,
    "anoCurricular" INTEGER NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PrecoPropina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrecoPropina_categoria_anoCurricular_key" ON "PrecoPropina"("categoria", "anoCurricular");
