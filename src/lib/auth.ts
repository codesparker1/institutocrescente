import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";

/** Login aceita email OU número de estudante (MD §7) — os alunos podem não ter email. */
function pareceEmail(identificador: string): boolean {
  return identificador.includes("@");
}

/**
 * Encontra a conta pelo email ou pelo número de estudante, ignorando maiúsculas e espaços à volta
 * (§pedido do cliente 2026-09-14). O teclado do telemóvel põe maiúscula na primeira letra de
 * qualquer campo de texto, e quem se registou como `maria@ispc.ao` escrevia `Maria@ispc.ao` da
 * segunda vez e era recusado sem perceber porquê.
 *
 * Exacta primeiro, insensível só a seguir. Não é otimização prematura: a procura exacta usa o
 * índice único e resolve a esmagadora maioria das entradas; a insensível obriga a percorrer a
 * tabela, e só corre quando a primeira falha. Esta ordem também torna o resultado PREVISÍVEL se
 * alguma vez existirem duas contas que só difiram em maiúsculas — ganha aquela que foi escrita tal
 * e qual, em vez de uma à sorte. (Com normalizarEmail aplicado na escrita, esse caso não devia
 * chegar a existir — ver src/lib/identificador.ts.)
 *
 * A senha continua sensível a maiúsculas, e isso é deliberado: ver a nota em `authorize`.
 */
export function buscarUserPorIdentificador(identificador: string) {
  const limpo = identificador.trim();
  if (limpo === "") return Promise.resolve(null);

  const campo = pareceEmail(limpo) ? "email" : "numeroEstudante";
  return prisma.user
    .findUnique({ where: { [campo]: limpo } as { email: string } | { numeroEstudante: string } })
    .then(
      (exato) =>
        exato ??
        prisma.user.findFirst({ where: { [campo]: { equals: limpo, mode: "insensitive" } } }),
    );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        identificador: { label: "Email ou nº de estudante", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      authorize: async (credentials) => {
        const identificador = credentials?.identificador;
        const password = credentials?.password;
        if (typeof identificador !== "string" || typeof password !== "string") return null;

        const user = await buscarUserPorIdentificador(identificador);
        if (!user) return null;

        // A SENHA continua sensível a maiúsculas, ao contrário do identificador acima. Não é
        // esquecimento: o bcrypt guarda o resumo da string exacta, por isso torná-la insensível
        // obrigaria a passá-la a minúsculas ANTES de gerar o resumo — o que invalidava todas as
        // senhas já existentes e obrigava toda a gente a definir uma nova. E cortaria a força de
        // cada senha, sem resolver o problema que motivou esta mudança: os teclados não põem
        // maiúsculas automáticas em campos de senha, só nos de texto.
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          professorId: user.professorId,
          alunoId: user.alunoId,
          deveTrocarSenha: user.deveTrocarSenha,
        };
      },
    }),
  ],
});
