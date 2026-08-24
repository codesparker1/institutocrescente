/**
 * Marcos do ano letivo simulado (Fase 2 do cost-meter, "ano caótico") — comprime um ano inteiro
 * numa corrida de CI tratável, saltando o relógio simulado entre momentos-chave em vez de
 * simular dia a dia. Cada marco tem a sua carga (calma vs. pico) e o seu caos (ações erráticas
 * concentradas nas guardas do servidor mais relevantes para esse momento do ano).
 *
 * As datas derivam sempre da ConfiguracaoAcademica REAL lida da BD (nunca hardcoded) — a janela
 * de matrícula em particular é gerada pela seed grande em relação ao "agora" real de quando a
 * seed correu, não ao anoLetivoInicio simulado, por isso tem de ser lida em runtime.
 */

export interface ConfigAcademicaParaMarcos {
  anoLetivoInicio: Date;
  anoLetivoFim: Date;
  matriculaInicio: Date;
  matriculaFim: Date;
}

export interface Marco {
  id: string;
  label: string;
  data: Date;
  /** Só usado pelo marco de rematrícula: uma data ANTES da janela, para testar a rejeição por estar fora dela. */
  dataForaDaJanela?: Date;
  pico: boolean;
  rotaPico?: string;
  conexoesPico?: number;
}

function maisDias(base: Date, dias: number): Date {
  return new Date(base.getTime() + dias * 24 * 60 * 60 * 1000);
}

export function construirMarcos(config: ConfigAcademicaParaMarcos): Marco[] {
  const meio = new Date((config.matriculaInicio.getTime() + config.matriculaFim.getTime()) / 2);

  return [
    {
      id: "abertura-matricula",
      label: "Abertura de matrícula",
      data: config.anoLetivoInicio,
      pico: true,
      rotaPico: "/alunos",
      conexoesPico: 80,
    },
    {
      id: "semana-normal-aulas",
      label: "Semana normal de aulas",
      data: maisDias(config.anoLetivoInicio, 14),
      pico: false,
    },
    {
      id: "vencimento-propinas",
      label: "Vencimento mensal de propinas",
      data: maisDias(config.anoLetivoInicio, 30),
      pico: true,
      rotaPico: "/financeiro/registo",
      conexoesPico: 100,
    },
    {
      id: "avaliacoes-p1",
      label: "Época de avaliações P1",
      data: maisDias(config.anoLetivoInicio, 60),
      pico: false,
    },
    {
      id: "avaliacoes-p2-exame",
      label: "Época de avaliações P2/Exame",
      data: maisDias(config.anoLetivoInicio, 120),
      pico: false,
    },
    {
      id: "vencimento-propinas-2",
      // garantirCobrancasGeradas cria a propina do mês corrente à medida que o relógio avança
      // (não o ano letivo inteiro de uma vez) — um único marco de pagamento em vencimento-propinas
      // (dia 30) deixa vários meses por confirmar até à janela de rematrícula, que só bloqueia
      // corretamente quem tem mesmo mensalidade VENCIDA (ver academico.ts, saldoPropinas). Este 2º
      // marco replica o que uma secretária real faria — confirmar o saldo antes de rematricular.
      label: "Vencimento mensal de propinas (2ª ronda, antes da rematrícula)",
      data: maisDias(config.anoLetivoInicio, 180),
      pico: false,
    },
    {
      id: "janela-rematricula",
      label: "Janela de rematrícula",
      data: meio,
      dataForaDaJanela: maisDias(config.matriculaFim, 20),
      pico: true,
      rotaPico: "/alunos",
      conexoesPico: 60,
    },
    {
      id: "novo-ano-letivo",
      label: "Início do ano letivo seguinte",
      data: maisDias(config.anoLetivoFim, 30),
      pico: false,
    },
  ];
}
