import { randomInt } from "node:crypto";

const CONSOANTES = "BCDFGHJKLMNPQRSTVWXYZ";
const VOGAIS = "AEIOU";
const DIGITOS = "0123456789";
const SIMBOLOS = "!@#%&*";

function caractereAleatorio(conjunto: string): string {
  return conjunto[randomInt(conjunto.length)];
}

/**
 * Gera uma senha temporária aleatória (não uma constante partilhada), fácil de ditar
 * ao telefone: alterna consoante/vogal, seguida de 2 dígitos e 1 símbolo.
 * Ex: "Xafi82!". O aluno/professor é obrigado a trocá-la no primeiro login (ver `User.deveTrocarSenha`).
 */
export function gerarSenhaTemporaria(): string {
  const letras = Array.from({ length: 4 }, (_, i) =>
    i % 2 === 0 ? caractereAleatorio(CONSOANTES) : caractereAleatorio(VOGAIS).toLowerCase(),
  ).join("");
  const digitos = Array.from({ length: 2 }, () => caractereAleatorio(DIGITOS)).join("");
  const simbolo = caractereAleatorio(SIMBOLOS);
  return `${letras}${digitos}${simbolo}`;
}
