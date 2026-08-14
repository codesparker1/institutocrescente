/**
 * Utilitários partilhados pelos formulários com Server Actions.
 *
 * O React 19 limpa os campos uncontrolled quando uma form action termina, por isso
 * os valores submetidos têm de voltar no estado da acção para o formulário se
 * repovoar. Convenção: devolver `values` apenas nos retornos de erro, para que
 * o formulário esvazie depois de gravar com êxito.
 */

export type FieldErrors = Record<string, string>;

export interface FormState<TValues = Record<string, string>> {
  error?: string;
  fieldErrors?: FieldErrors;
  values?: TValues;
}

/**
 * Forma estrutural de um erro do Zod. Evita depender dos tipos internos da
 * biblioteca, que mudam entre versões maiores.
 */
interface IssuesDeValidacao {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}

/** Converte os issues de um `safeParse` falhado no mapa campo → mensagem usado pelos formulários. */
export function mapearErros(error: IssuesDeValidacao): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const campo = issue.path[0];
    if (campo === undefined) continue;
    // O primeiro issue de cada campo é o mais relevante; não sobrescrever com os seguintes.
    const chave = String(campo);
    if (!(chave in fieldErrors)) fieldErrors[chave] = issue.message;
  }
  return fieldErrors;
}

/** Lê os campos indicados do FormData como strings, para repovoar o formulário após um erro. */
export function extrairValores<K extends string>(formData: FormData, campos: readonly K[]): Record<K, string> {
  const values = {} as Record<K, string>;
  for (const campo of campos) {
    const valor = formData.get(campo);
    values[campo] = typeof valor === "string" ? valor : "";
  }
  return values;
}

/**
 * Atalho para o caso comum: um `safeParse` falhou e queremos devolver
 * as mensagens por campo e o que o utilizador tinha escrito.
 */
export function erroDeValidacao<K extends string>(
  error: IssuesDeValidacao,
  formData: FormData,
  campos: readonly K[],
): { fieldErrors: FieldErrors; values: Record<K, string> } {
  return { fieldErrors: mapearErros(error), values: extrairValores(formData, campos) };
}
