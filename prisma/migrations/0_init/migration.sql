-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SECRETARIA', 'PROFESSOR', 'ALUNO');

-- CreateEnum
CREATE TYPE "AlunoStatus" AS ENUM ('ATIVO', 'TRANCADO', 'FORMADO', 'DESISTENTE');

-- CreateEnum
CREATE TYPE "MatriculaStatus" AS ENUM ('ATIVA', 'TRANCADA', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "AvaliacaoTipo" AS ENUM ('TESTE', 'TRABALHO', 'EXAME_FINAL');

-- CreateEnum
CREATE TYPE "Periodo" AS ENUM ('MATUTINO', 'VESPERTINO', 'NOTURNO');

-- CreateEnum
CREATE TYPE "DiaSemana" AS ENUM ('SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO');

-- CreateEnum
CREATE TYPE "PropinaStatus" AS ENUM ('PENDENTE', 'PAGO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "professorId" TEXT,
    "alunoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Professor" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "especialidade" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Professor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aluno" (
    "id" TEXT NOT NULL,
    "numeroEstudante" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "dataNascimento" TIMESTAMP(3) NOT NULL,
    "genero" TEXT NOT NULL,
    "curso" TEXT NOT NULL,
    "anoIngresso" INTEGER NOT NULL,
    "anoCurricular" INTEGER NOT NULL DEFAULT 1,
    "status" "AlunoStatus" NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Aluno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Curso" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "duracaoAnos" INTEGER NOT NULL,

    CONSTRAINT "Curso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disciplina" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "cargaHoraria" INTEGER NOT NULL,
    "cursoId" TEXT NOT NULL,

    CONSTRAINT "Disciplina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turma" (
    "id" TEXT NOT NULL,
    "cursoId" TEXT NOT NULL,
    "anoCurricular" INTEGER NOT NULL,
    "periodo" "Periodo" NOT NULL,
    "anoLetivo" INTEGER NOT NULL,

    CONSTRAINT "Turma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurmaDisciplina" (
    "id" TEXT NOT NULL,
    "turmaId" TEXT NOT NULL,
    "disciplinaId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "semestre" INTEGER NOT NULL,
    "sala" TEXT NOT NULL,

    CONSTRAINT "TurmaDisciplina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorarioSlot" (
    "id" TEXT NOT NULL,
    "turmaDisciplinaId" TEXT NOT NULL,
    "diaSemana" "DiaSemana" NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFim" TEXT NOT NULL,
    "sala" TEXT NOT NULL,

    CONSTRAINT "HorarioSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matricula" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "turmaId" TEXT NOT NULL,
    "dataMatricula" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "MatriculaStatus" NOT NULL DEFAULT 'ATIVA',

    CONSTRAINT "Matricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avaliacao" (
    "id" TEXT NOT NULL,
    "turmaDisciplinaId" TEXT NOT NULL,
    "tipo" "AvaliacaoTipo" NOT NULL,
    "peso" DECIMAL(4,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "nome" TEXT NOT NULL,
    "sala" TEXT,

    CONSTRAINT "Avaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nota" (
    "id" TEXT NOT NULL,
    "avaliacaoId" TEXT NOT NULL,
    "matriculaId" TEXT NOT NULL,
    "valor" DECIMAL(4,2) NOT NULL,
    "lancadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Nota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aula" (
    "id" TEXT NOT NULL,
    "turmaDisciplinaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "tema" TEXT,

    CONSTRAINT "Aula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Frequencia" (
    "id" TEXT NOT NULL,
    "aulaId" TEXT NOT NULL,
    "matriculaId" TEXT NOT NULL,
    "presente" BOOLEAN NOT NULL,
    "justificada" BOOLEAN,

    CONSTRAINT "Frequencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "userRole" "Role" NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Propina" (
    "id" TEXT NOT NULL,
    "matriculaId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "mesReferencia" TIMESTAMP(3) NOT NULL,
    "valorDevido" DECIMAL(10,2) NOT NULL,
    "valorPago" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "PropinaStatus" NOT NULL DEFAULT 'PENDENTE',
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "registadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Propina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoFinanceira" (
    "id" TEXT NOT NULL DEFAULT 'config',
    "bloqueioAtivo" BOOLEAN NOT NULL DEFAULT true,
    "toleranciaDias" INTEGER NOT NULL DEFAULT 5,
    "valorMensalPadrao" DECIMAL(10,2) NOT NULL DEFAULT 15000,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedPorId" TEXT,

    CONSTRAINT "ConfiguracaoFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_professorId_key" ON "User"("professorId");

-- CreateIndex
CREATE UNIQUE INDEX "User_alunoId_key" ON "User"("alunoId");

-- CreateIndex
CREATE UNIQUE INDEX "Professor_email_key" ON "Professor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Aluno_numeroEstudante_key" ON "Aluno"("numeroEstudante");

-- CreateIndex
CREATE UNIQUE INDEX "Aluno_email_key" ON "Aluno"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Curso_codigo_key" ON "Curso"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Disciplina_codigo_key" ON "Disciplina"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Turma_cursoId_anoCurricular_periodo_anoLetivo_key" ON "Turma"("cursoId", "anoCurricular", "periodo", "anoLetivo");

-- CreateIndex
CREATE UNIQUE INDEX "TurmaDisciplina_turmaId_disciplinaId_key" ON "TurmaDisciplina"("turmaId", "disciplinaId");

-- CreateIndex
CREATE UNIQUE INDEX "Matricula_alunoId_turmaId_key" ON "Matricula"("alunoId", "turmaId");

-- CreateIndex
CREATE UNIQUE INDEX "Nota_avaliacaoId_matriculaId_key" ON "Nota"("avaliacaoId", "matriculaId");

-- CreateIndex
CREATE UNIQUE INDEX "Frequencia_aulaId_matriculaId_key" ON "Frequencia"("aulaId", "matriculaId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Propina_alunoId_idx" ON "Propina"("alunoId");

-- CreateIndex
CREATE INDEX "Propina_status_idx" ON "Propina"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Propina_alunoId_mesReferencia_key" ON "Propina"("alunoId", "mesReferencia");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disciplina" ADD CONSTRAINT "Disciplina_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turma" ADD CONSTRAINT "Turma_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurmaDisciplina" ADD CONSTRAINT "TurmaDisciplina_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurmaDisciplina" ADD CONSTRAINT "TurmaDisciplina_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "Disciplina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurmaDisciplina" ADD CONSTRAINT "TurmaDisciplina_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioSlot" ADD CONSTRAINT "HorarioSlot_turmaDisciplinaId_fkey" FOREIGN KEY ("turmaDisciplinaId") REFERENCES "TurmaDisciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_turmaDisciplinaId_fkey" FOREIGN KEY ("turmaDisciplinaId") REFERENCES "TurmaDisciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_avaliacaoId_fkey" FOREIGN KEY ("avaliacaoId") REFERENCES "Avaliacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_matriculaId_fkey" FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aula" ADD CONSTRAINT "Aula_turmaDisciplinaId_fkey" FOREIGN KEY ("turmaDisciplinaId") REFERENCES "TurmaDisciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Frequencia" ADD CONSTRAINT "Frequencia_aulaId_fkey" FOREIGN KEY ("aulaId") REFERENCES "Aula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Frequencia" ADD CONSTRAINT "Frequencia_matriculaId_fkey" FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Propina" ADD CONSTRAINT "Propina_matriculaId_fkey" FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Propina" ADD CONSTRAINT "Propina_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Propina" ADD CONSTRAINT "Propina_registadoPorId_fkey" FOREIGN KEY ("registadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfiguracaoFinanceira" ADD CONSTRAINT "ConfiguracaoFinanceira_updatedPorId_fkey" FOREIGN KEY ("updatedPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

