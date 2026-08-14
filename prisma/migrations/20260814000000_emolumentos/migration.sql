-- AlterTable
ALTER TABLE "Cobranca" ADD COLUMN     "emitidoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Emolumento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "valor" DECIMAL(10,2) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Emolumento_pkey" PRIMARY KEY ("id")
);

