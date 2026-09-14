import { z } from "zod";

/**
 * Normalização do identificador de acesso (§pedido do cliente 2026-09-14: "no login, mete
 * irrelevância de maiúsculas e minúsculas... para evitar pessoas depois terem problema de entrar
 * porque mudaram a sua forma de escrever").
 *
 * O problema real é o teclado do telemóvel, que põe maiúscula na primeira letra de qualquer campo
 * de texto: quem se registou como `maria.silva@ispc.ao` escreve `Maria.silva@ispc.ao` da segunda
 * vez sem dar por isso, e é recusado. Emails são insensíveis a maiúsculas por convenção — tratá-los
 * assim não baixa a segurança de nada, ao contrário do que acontece com as senhas (ver a nota em
 * src/lib/auth.ts).
 *
 * A normalização acontece na ESCRITA, e não só na leitura. Guardados sempre em minúsculas, é o
 * índice único da base que impede duas contas que só difiram em maiúsculas. A alternativa —
 * verificar antes de criar — tem uma corrida entre a verificação e a inserção e deixa passar
 * duplicados; e dois utilizadores cujo email só difere na caixa tornariam a procura insensível
 * ambígua, que num caminho de autenticação é a última coisa que se quer.
 */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * O número de estudante é gerado pelo sistema (ISPC2026-0001), sempre em maiúsculas — não precisa
 * de normalização na escrita. Só à entrada, onde a pessoa o escreve à mão.
 */
export function normalizarIdentificador(identificador: string): string {
  return identificador.trim().toLowerCase();
}

const semStringVazia = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** Email obrigatório, guardado normalizado. */
export const emailSchema = z.string().email("Email inválido").transform(normalizarEmail);

/** Email opcional — campo vazio no formulário conta como "não preenchido", não como erro. */
export const emailOpcionalSchema = z.preprocess(
  semStringVazia,
  z.string().email("Email inválido").transform(normalizarEmail).optional(),
);
