// Senha fixa para todas as contas criadas (alunos e professores), apenas para efeitos de apresentação/demo.
// TODO: voltar a gerar senhas aleatórias (ver histórico deste ficheiro) antes de um uso em produção real.
const SENHA_PADRAO = "Ispc@2026";

export function gerarSenhaTemporaria(): string {
  return SENHA_PADRAO;
}
