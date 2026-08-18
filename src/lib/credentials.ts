/**
 * Senha inicial partilhada por todas as contas criadas pelo sistema (aluno, professor, DAAC,
 * secretaria) — decisão do cliente (2026-08-18): senhas aleatórias por conta confundiam mais do
 * que ajudavam. Seguro o suficiente porque `User.deveTrocarSenha` força a troca no primeiro
 * login (middleware.ts redireciona sempre para /trocar-senha até isso acontecer) — esta senha
 * nunca fica válida além da primeira entrada de cada conta.
 */
export const SENHA_INICIAL_PADRAO = "Ispc@2026";
