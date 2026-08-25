/**
 * Tipos partilhados pelos 5 ficheiros de cenário (um por aluno) e pelo orquestrador
 * (teste-5-alunos.ts). Mesmo espírito de scripts/simulacao/agentes/ — cada cenário é uma função
 * `(ctx) => Promise<void>` chamada pelo loop principal no marco certo, nunca o inverso.
 */
import type { Browser } from "playwright";
import type { PrismaClient } from "../../../src/generated/prisma/client";
import type { CredencialAgente } from "../db-helpers";

export interface Alunos {
  marta: CredencialAgente;
  joao: CredencialAgente;
  beatriz: CredencialAgente;
  domingos: CredencialAgente;
  isabel: CredencialAgente;
}

export interface Staff {
  admin: CredencialAgente;
  secretaria: CredencialAgente;
  daac: CredencialAgente;
  professor1: CredencialAgente; // Programação I
  professor2: CredencialAgente; // Bases de Dados
}

/** Contexto passado a cada função de cenário — tudo o que precisa para agir num marco. */
export interface CenarioCtx {
  browser: Browser;
  baseUrl: string;
  outputDir: string;
  prisma: PrismaClient;
  alunos: Alunos;
  staff: Staff;
  /** Ano curricular corrente do ciclo (1..4) — não confundir com Aluno.anoCurricular na BD, que
   * só muda depois da rematrícula processar. */
  anoCurricularCiclo: number;
  /** Nome da disciplina do 2º semestre do ano do ciclo — muda por ano (§faculdade-de-verdade):
   * 1º Bases de Dados, 2º Redes de Computadores, 3º Inteligência Artificial, 4º Computação Gráfica. */
  disciplinaSemestre2: string;
  log: (mensagem: string) => void;
}

export type AcaoCenario = (ctx: CenarioCtx) => Promise<void>;
