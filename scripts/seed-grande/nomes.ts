/** Listas de nomes para gerar 100 professores e 1000 alunos por combinação (não é exaustivo/único
 * à mão como ALUNO_NOMES em prisma/seed.ts — aqui o volume importa mais do que a variedade). */

export const PRIMEIROS_NOMES = [
  "Marta", "João", "Beatriz", "Domingos", "Isabel", "Rafael", "Adriana", "Nelson", "Carla", "Ricardo",
  "Sandra", "Emanuel", "Paula", "Hélder", "Vanessa", "Miguel", "Cátia", "Fábio", "Ana Paula", "Wilson",
  "Pedro", "Luísa", "André", "Cristina", "Manuel", "Teresa", "Bruno", "Fernanda", "Tiago", "Mariana",
  "Francisco", "Célia", "Jorge", "Rosa", "Vítor", "Susana", "Alberto", "Elsa", "Carlos", "Dulce",
] as const;

export const ULTIMOS_NOMES = [
  "Kiala", "Manuel", "Sacatucua", "Cavaco", "Neto", "Bumba", "Muanza", "Sapalo", "Tchissola", "Domingos",
  "Vieira Dias", "Kiesse", "Massano", "Zua", "Capitango", "Sumbo", "Baptista", "Mbala", "Gaspar", "Bento",
  "Sousa", "Ferreira", "Bandeira", "Mucavele", "Chissano", "Cardoso", "Pereira", "Fonseca", "Anjos", "Miranda",
] as const;

const ESPECIALIDADES = [
  "Engenharia de Software", "Bases de Dados", "Redes e Infraestrutura", "Gestão e Finanças", "Marketing e Economia",
  "Direito Civil", "Direito Penal", "Enfermagem Clínica", "Saúde Pública", "Arquitetura e Urbanismo",
  "Desenho Técnico", "Contabilidade", "Recursos Humanos", "Matemática Aplicada", "Comunicação",
] as const;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)];
}

/** Gera `quantidade` pares (primeiro, último) únicos, repetindo o pool com sufixo numérico quando esgota as combinações simples. */
export function gerarNomes(quantidade: number): { primeiro: string; ultimo: string; nomeCompleto: string; chaveUnica: string }[] {
  const usados = new Set<string>();
  const resultado: { primeiro: string; ultimo: string; nomeCompleto: string; chaveUnica: string }[] = [];
  let tentativa = 0;
  while (resultado.length < quantidade) {
    tentativa += 1;
    const primeiro = pick(PRIMEIROS_NOMES);
    const ultimo = pick(ULTIMOS_NOMES);
    const chaveBase = `${primeiro}.${ultimo}`.toLowerCase().replace(/\s+/g, "");
    // Depois de esgotar as combinações simples (40x30=1200, chega para os 1000+100 deste seed),
    // um sufixo evita loop infinito sem alterar a legibilidade do nome.
    const chaveUnica = usados.has(chaveBase) ? `${chaveBase}${tentativa}` : chaveBase;
    if (usados.has(chaveUnica)) continue;
    usados.add(chaveUnica);
    resultado.push({ primeiro, ultimo, nomeCompleto: `${primeiro} ${ultimo}`, chaveUnica });
  }
  return resultado;
}

export function especialidadeAleatoria(): string {
  return pick(ESPECIALIDADES);
}

export function telefoneAngola(): string {
  const numero = `9${randomInt(10000000, 99999999)}`;
  return `+244 ${numero.slice(0, 3)} ${numero.slice(3, 6)} ${numero.slice(6, 9)}`;
}

export { randomInt, pick };
