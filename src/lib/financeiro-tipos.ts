// §pedido do cliente 2026-08 (confirmado): só a PROPINA bloqueia o aluno (notas, listas, etc.).
// A MULTA é dívida real que o aluno continua a dever, mas nunca sozinha tira o acesso — a
// Secretaria confirma mensalidades, só a ADMIN confirma/reverte multas (toggleMultaAction), e a
// ADMIN pode confirmar a mensalidade sem a multa (semMulta) — a multa fica "órfã", pendente,
// presa ao aluno, para ser resolvida depois. Por isso o bloqueio e a lista de devedores usam
// conjuntos de tipos diferentes: bloquear = PROPINA; dever dinheiro = PROPINA+MULTA.
//
// Ficheiro separado e sem dependências (nem server-only nem Prisma) para poder ter cobertura
// unitária direta — a regra é de negócio e merece teste que trave regressões.

export const TIPOS_QUE_BLOQUEIAM = ["PROPINA"] as const;
export const TIPOS_QUE_CONTAM_COMO_DIVIDA = ["PROPINA", "MULTA"] as const;
