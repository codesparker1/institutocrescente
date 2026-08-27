-- Marca da ultima corrida da sincronizacao das turmas com o plano curricular.
-- Rede de seguranca diaria (garantirTurmasSincronizadasComPlano): mesmo padrao preguicoso de
-- ultimaSuspensaoEm/ultimaGeracaoEm — corre no maximo uma vez por dia civil, sem cron.
ALTER TABLE "ConfiguracaoAcademica" ADD COLUMN "ultimaSincronizacaoPlanoEm" TIMESTAMP(3);
