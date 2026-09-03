"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { diasDisponiveis, mesesDisponiveis, partesIso } from "@/lib/intervalo-datas";

/**
 * Selector de data limitado a um INTERVALO decidido pelo sistema — ao contrário de DateSelect, que
 * oferece uma gama fixa de anos e 31 dias em todos os meses.
 *
 * Três regras, todas do mesmo princípio (§pedido do cliente 2026-08-29): o utilizador não deve
 * conseguir escolher uma data que o sistema vai recusar.
 *   1. O ano não se escolhe: é o do ano letivo a decorrer. Mostra-se como texto, não como campo.
 *   2. Meses e dias já passados não aparecem — não se agenda uma prova para ontem.
 *   3. Os dias são os que o mês tem mesmo (não há 31 de Fevereiro).
 *
 * `minIso`/`maxIso` são "aaaa-mm-dd" e ambos inclusivos. O servidor revalida na mesma: isto é
 * conveniência, não a barreira.
 */
interface DateSelectIntervaloProps {
  name: string;
  /** Primeiro dia selecionável, "aaaa-mm-dd" (ex.: hoje, ou o início do ano letivo). */
  minIso: string;
  /** Último dia selecionável, "aaaa-mm-dd" (ex.: o fim do ano letivo). */
  maxIso: string;
  defaultValue?: string;
  className?: string;
}

const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const selectClassName =
  "rounded-lg border border-navy-100 bg-white px-2 py-2 text-sm text-texto focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100";

export function DateSelectIntervalo({ name, minIso, maxIso, defaultValue, className }: DateSelectIntervaloProps) {
  const inicial = defaultValue && defaultValue >= minIso && defaultValue <= maxIso ? partesIso(defaultValue) : null;
  // A chave do mês é "ano-mes": só o número do mês seria ambíguo num ano letivo que atravessa dois
  // anos civis (o Janeiro de 2027 e o de 2028 dariam ambos "1").
  const [mes, setMes] = useState(inicial ? `${inicial.ano}-${inicial.mes}` : "");
  const [dia, setDia] = useState(inicial ? String(inicial.dia) : "");

  const meses = mesesDisponiveis(minIso, maxIso);
  const mostrarAno = partesIso(minIso).ano !== partesIso(maxIso).ano;
  const mesEscolhido = meses.find((m) => `${m.ano}-${m.mes}` === mes) ?? null;
  const dias = mesEscolhido ? diasDisponiveis(minIso, maxIso, mesEscolhido.ano, mesEscolhido.mes) : [];

  // Mudar de mês pode invalidar o dia já escolhido (31 → Fevereiro, ou um dia antes do mínimo).
  // Descartar em silêncio é melhor do que submeter uma data que o servidor vai recusar.
  const diaValido = dias.includes(Number(dia)) ? dia : "";

  const valor =
    mesEscolhido && diaValido
      ? `${mesEscolhido.ano}-${String(mesEscolhido.mes).padStart(2, "0")}-${diaValido.padStart(2, "0")}`
      : "";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <select
        aria-label="Mês"
        className={selectClassName}
        value={mes}
        onChange={(e) => {
          setMes(e.target.value);
          setDia("");
        }}
      >
        <option value="" disabled>
          Mês
        </option>
        {meses.map((m) => (
          <option key={`${m.ano}-${m.mes}`} value={`${m.ano}-${m.mes}`}>
            {mostrarAno ? `${MESES_LABEL[m.mes - 1]} ${m.ano}` : MESES_LABEL[m.mes - 1]}
          </option>
        ))}
      </select>
      <select
        aria-label="Dia"
        className={selectClassName}
        value={diaValido}
        onChange={(e) => setDia(e.target.value)}
        disabled={!mesEscolhido}
      >
        <option value="" disabled>
          Dia
        </option>
        {dias.map((d) => (
          <option key={d} value={String(d)}>
            {d}
          </option>
        ))}
      </select>
      <input type="hidden" name={name} value={valor} />
    </div>
  );
}
