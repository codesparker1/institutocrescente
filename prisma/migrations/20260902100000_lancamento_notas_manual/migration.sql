-- Interruptor manual do lancamento de notas (§decisao do cliente 2026-09-02): "vamos retornar
-- para um sistema manual, onde se clica para poder permitir os professores introduzir as notas,
-- quando Daac/admin decidir". Um unico valor global para todos os professores e todas as
-- disciplinas, nao um por TurmaDisciplina.
--
-- Entra ABERTO: ha testes com utilizadores reais a decorrer, e entrar fechado bloquearia todos os
-- professores no minuto do deploy, sem ninguem perceber porque.
ALTER TABLE "ConfiguracaoAcademica" ADD COLUMN "lancamentoNotasAberto" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ConfiguracaoAcademica" ADD COLUMN "lancamentoNotasAlteradoEm" TIMESTAMP(3);

-- Prazo automatico por epoca: eliminado. Os cinco dias-por-epoca so existiam para calcular
-- Avaliacao.prazoLancamento, e este so existia para fechar a janela do professor sozinho — o que
-- passa a ser decisao manual. Os zeros automaticos passam a vir apenas do fecho do semestre
-- (fecharSemestre, src/lib/fecho-semestre.ts), como o cliente pediu: "so no fecho do semestre".
ALTER TABLE "ConfiguracaoAcademica" DROP COLUMN "diasPrazoP1";
ALTER TABLE "ConfiguracaoAcademica" DROP COLUMN "diasPrazoP2";
ALTER TABLE "ConfiguracaoAcademica" DROP COLUMN "diasPrazoExame";
ALTER TABLE "ConfiguracaoAcademica" DROP COLUMN "diasPrazoRecurso";
ALTER TABLE "ConfiguracaoAcademica" DROP COLUMN "diasPrazoExameEspecial";

-- Cursor "ja corri hoje" do job de auto-zero por prazo expirado, que deixa de existir.
ALTER TABLE "ConfiguracaoAcademica" DROP COLUMN "ultimaVerificacaoNotasEm";

ALTER TABLE "Avaliacao" DROP COLUMN "prazoLancamento";
