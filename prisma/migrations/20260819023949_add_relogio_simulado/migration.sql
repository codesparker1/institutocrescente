-- CreateTable
CREATE TABLE "RelogioSimulado" (
    "id" TEXT NOT NULL DEFAULT 'config',
    "agora" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelogioSimulado_pkey" PRIMARY KEY ("id")
);
