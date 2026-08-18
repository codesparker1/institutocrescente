/**
 * PRNG determinístico (mulberry32) — dado o mesmo seed, produz sempre a mesma sequência. Usado
 * em vez de Math.random() em qualquer sítio cujo resultado afeta O QUE uma corrida testa (ex.
 * amostragem de alunos/professores para a simulação caótica) — sem isto, uma corrida "verde" não
 * prova nada por si só (pode simplesmente não ter exercitado o caminho que falhou da última vez)
 * e uma corrida "vermelha" não é reproduzível para depurar sem voltar a correr tudo às cegas.
 */
export interface Rng {
  next: () => number;
  randomInt: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
}

export function criarRng(seed: number): Rng {
  let a = seed >>> 0;
  function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randomInt(min: number, max: number): number {
    return Math.floor(next() * (max - min + 1)) + min;
  }
  function pick<T>(items: readonly T[]): T {
    return items[randomInt(0, items.length - 1)];
  }
  return { next, randomInt, pick };
}

/** Só para quando ninguém pediu um seed explícito — mesmo assim fica sempre registado na corrida. */
export function gerarSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
