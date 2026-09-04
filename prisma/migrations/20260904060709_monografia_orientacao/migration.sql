-- Monografia e orientacao (§pedido do cliente 2026-09-04): no ultimo ano o aluno tem a monografia
-- em vez de cadeiras normais — nota unica na defesa, lancada so pelo DAAC/ADMIN, com um professor
-- orientador atribuido a cada finalista.
--
-- So ADD COLUMN com defeito: nenhuma coluna e apagada e nenhum dado se perde. As linhas existentes
-- ficam com eMonografia/eMonografiaAplicada = false (cadeiras normais, como eram) e sem orientador.

-- A cadeira do plano curricular que e a monografia. A nota grava-se na epoca EXAME por decisao
-- deliberada (ver comentario no schema): as 5 epocas sao uma cascata sequencial e a defesa nao
-- pertence a ela. Na UI le-se sempre "Defesa".
ALTER TABLE "CadeiraCurricular" ADD COLUMN "eMonografia" BOOLEAN NOT NULL DEFAULT false;

-- Congelado na inscricao, como permiteDispensaAplicada: desmarcar a caixa no ano seguinte nao pode
-- transformar defesas ja feitas em cadeiras normais.
ALTER TABLE "InscricaoCadeira" ADD COLUMN "eMonografiaAplicada" BOOLEAN NOT NULL DEFAULT false;

-- Orientador do finalista. ON DELETE SET NULL: apagar um professor nao pode apagar a monografia do
-- aluno — fica sem orientador, e o DAAC atribui outro.
ALTER TABLE "InscricaoCadeira" ADD COLUMN "orientadorId" TEXT;
CREATE INDEX "InscricaoCadeira_orientadorId_idx" ON "InscricaoCadeira"("orientadorId");
ALTER TABLE "InscricaoCadeira" ADD CONSTRAINT "InscricaoCadeira_orientadorId_fkey"
  FOREIGN KEY ("orientadorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Maximo de orientandos por professor; 0 = sem limite.
ALTER TABLE "ConfiguracaoAcademica" ADD COLUMN "limiteOrientandosPorProfessor" INTEGER NOT NULL DEFAULT 5;
