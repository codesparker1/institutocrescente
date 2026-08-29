/**
 * Que meses e dias são escolhíveis dentro de um intervalo de datas — a lógica pura por trás de
 * DateSelectIntervalo, separada para ser testável (mesmo padrão de lib/avaliacao.ts).
 *
 * Existe porque um selector que oferece datas que o servidor vai recusar transforma um erro
 * evitável num erro de submissão (§pedido do cliente 2026-08-29): o ano sai do ano letivo, meses e
 * dias passados não aparecem, e os dias são os que o mês tem mesmo — não há 31 de Fevereiro.
 */

export interface MesDisponivel {
  ano: number;
  /** 1-based, como o utilizador o vê (1 = Janeiro). */
  mes: number;
}

/** Partes de "aaaa-mm-dd" como números, com o mês 1-based. */
export function partesIso(iso: string): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return { ano, mes, dia };
}

/** Dias reais do mês — o dia 0 do mês seguinte é o último do mês pedido, e cobre anos bissextos. */
export function diasDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

/**
 * Os meses entre duas datas, em ordem cronológica. Um ano letivo atravessa dois anos civis
 * (Set/2026 a Jul/2027), por isso cada mês carrega o seu ano — sem isso, "Janeiro" apareceria antes
 * de "Setembro" na lista e o utilizador escolheria o ano errado sem dar por ela.
 */
export function mesesDisponiveis(minIso: string, maxIso: string): MesDisponivel[] {
  const min = partesIso(minIso);
  const max = partesIso(maxIso);
  const meses: MesDisponivel[] = [];
  for (let ano = min.ano; ano <= max.ano; ano++) {
    const primeiro = ano === min.ano ? min.mes : 1;
    const ultimo = ano === max.ano ? max.mes : 12;
    for (let mes = primeiro; mes <= ultimo; mes++) meses.push({ ano, mes });
  }
  return meses;
}

/**
 * Os dias escolhíveis de um mês, cortados nas fronteiras do intervalo: no mês do limite inferior
 * começa no dia mínimo (não se agenda para trás), no do superior acaba no máximo, e nunca passa dos
 * dias que o mês tem.
 */
export function diasDisponiveis(minIso: string, maxIso: string, ano: number, mes: number): number[] {
  const min = partesIso(minIso);
  const max = partesIso(maxIso);
  const primeiro = ano === min.ano && mes === min.mes ? min.dia : 1;
  const ultimo =
    ano === max.ano && mes === max.mes ? Math.min(max.dia, diasDoMes(ano, mes)) : diasDoMes(ano, mes);
  const dias: number[] = [];
  for (let dia = primeiro; dia <= ultimo; dia++) dias.push(dia);
  return dias;
}
