/**
 * Lógica pura do painel de simulação (§pedido do cliente 2026-09-11) — a leitura que transforma
 * uma lista de SimEvento numa sala de comando: quatro raias por papel e setas a ligar os eventos
 * que pertencem ao mesmo fluxo de dados.
 *
 * Fica em src/lib e SEM `import "server-only"` de propósito: é importado dos dois lados da
 * fronteira — pelo painel (Server Component) e pelos agentes em scripts/simulacao, que correm em
 * tsx e não conseguem importar módulos server-only (mesma razão documentada em
 * scripts/simulacao/db-helpers.ts). Sem BD, sem Prisma, sem I/O: só transformação de dados, para
 * poder ser testado pelo corredor de node:test.
 */

/** As raias do painel. DAAC e ADMIN partilham raia — no ecrã são a mesma coluna, "DAAC / Admin". */
export type RaiaSimulacao = "aluno" | "secretaria" | "professor" | "daac" | "sistema";

export const RAIAS_VISIVEIS: readonly RaiaSimulacao[] = ["aluno", "secretaria", "professor", "daac"];

export const RAIA_LABEL: Record<RaiaSimulacao, string> = {
  aluno: "Estudante",
  secretaria: "Secretaria",
  professor: "Professor",
  daac: "DAAC / Admin",
  sistema: "Sistema",
};

/**
 * Do papel do utilizador (User.role) para a raia do painel.
 *
 * Um evento sem papel é do SISTEMA, não de um papel em falta: os jobs preguiçosos
 * (garantirCobrancasGeradas) e os saltos de relógio correm fora de qualquer sessão, e é por isso
 * que `userRole` vem null neles. No painel aparecem como marcos a atravessar a grelha, porque não
 * pertencem a nenhuma coluna — acontecem ao sistema inteiro.
 */
export function raiaDoPapel(userRole: string | null | undefined): RaiaSimulacao {
  switch (userRole) {
    case "ALUNO":
      return "aluno";
    case "SECRETARIA":
      return "secretaria";
    case "PROFESSOR":
      return "professor";
    case "DAAC":
    case "ADMIN":
      return "daac";
    default:
      return "sistema";
  }
}

/**
 * Um segmento de URL é um id (e não uma parte fixa da rota)?
 *
 * Os ids desta base são cuid — 25 caracteres alfanuméricos. O limiar de 20 separa-os com folga do
 * segmento fixo mais comprido que as rotas têm ("configuracao", 12; "emolumentos", 11): sem um
 * limiar, `/admin/academico/configuracao` seria lido como a entidade `academico:configuracao`.
 */
function pareceId(segmento: string): boolean {
  return segmento.length >= 20 && /^[a-z0-9]+$/i.test(segmento);
}

/** Segmento de rota → nome da entidade, no singular usado no resto do sistema. */
const TIPO_POR_SEGMENTO: Record<string, string> = {
  alunos: "aluno",
  turmas: "turma",
  notas: "turma",
  professores: "professor",
  cursos: "curso",
  disciplinas: "disciplina",
  reclamacoes: "reclamacao",
};

/**
 * Rotas onde o nome do segmento MENTE sobre o que o id é. São factos sobre as rotas desta app, não
 * heurística, por isso ficam escritos: `/professor/:id` é a pauta de uma turma-disciplina
 * (src/app/(dashboard)/professor/[turmaDisciplinaId]), não um professor — deixá-lo à regra genérica
 * produziria `professor:<id de outra coisa>` e correlacionaria eventos que não têm nada a ver.
 *
 * A chave é o primeiro segmento; o valor diz que tipo tem o id em cada posição seguinte.
 */
const TIPO_POR_ROTA: Record<string, string[]> = {
  // /professor/:turmaDisciplinaId
  professor: ["turmaDisciplina"],
  // /notas/:turmaId/:turmaDisciplinaId — o segundo id vence, ver entidadeDaRota.
  notas: ["turma", "turmaDisciplina"],
};

/**
 * A entidade de domínio que uma rota toca, no formato "tipo:id" — ou null quando a rota não fala
 * de nenhuma entidade concreta (uma listagem, ou uma página "as minhas coisas").
 *
 * Derivada da URL e não declarada pelo agente: assim a instrumentação passiva (cada navegação)
 * ganha correlação sem o agente ter de dizer nada, e uma rota nova entra no painel sozinha.
 *
 * Com vários ids na rota vence o ÚLTIMO, o mais específico: em
 * `/notas/:turmaId/:turmaDisciplinaId` o que interessa é a pauta onde a nota é mesmo lançada, não
 * a turma que a contém.
 */
export function entidadeDaRota(pathname: string): string | null {
  const segmentos = pathname.split("?")[0].split("/").filter(Boolean);
  const tiposDaRota = TIPO_POR_ROTA[segmentos[0]];

  let entidade: string | null = null;
  let idsVistos = 0;

  for (let i = 0; i < segmentos.length; i += 1) {
    if (!pareceId(segmentos[i])) continue;

    // 1º a regra da rota (a que sabe o que o id realmente é), 2º o segmento anterior, e por fim
    // "registo": é melhor correlacionar por um id verdadeiro sob um nome genérico do que deitar
    // fora a ligação só por não sabermos baptizá-la.
    const anterior = i > 0 ? segmentos[i - 1] : null;
    const tipo =
      tiposDaRota?.[idsVistos] ?? (anterior ? TIPO_POR_SEGMENTO[anterior] : undefined) ?? "registo";

    entidade = `${tipo}:${segmentos[i]}`;
    idsVistos += 1;
  }

  return entidade;
}

export interface EventoParaFluxo {
  id: string;
  raia: RaiaSimulacao;
  entidade: string | null;
}

export interface FluxoSimulacao {
  /** Evento de origem — o que tocou a entidade antes. */
  deId: string;
  /** Evento de destino — o toque seguinte na mesma entidade, noutra raia. */
  paraId: string;
  deRaia: RaiaSimulacao;
  paraRaia: RaiaSimulacao;
  entidade: string;
}

/**
 * As setas do painel: dois eventos de RAIAS DIFERENTES que tocaram a MESMA entidade, em ordem
 * cronológica. Recebe os eventos já ordenados por tempo (é o chamador que decide se o eixo é o
 * tempo simulado ou o real).
 *
 * Correlação, não causalidade declarada. A diferença importa: uma seta declarada só desenha o que
 * já sabíamos que acontecia, e é por isso que nunca apanharia um bug de fluxo. Esta sai dos dados
 * — se a Secretaria confirmou um pagamento e a página do aluno leu a mesma cobrança a seguir, a
 * seta existe quer alguém tenha previsto esse caminho ou não.
 *
 * Dois eventos seguidos na mesma raia não fazem seta, mas o mais recente passa a ser a origem do
 * próximo salto entre raias — senão uma seta partiria de um toque já desatualizado.
 *
 * A raia `sistema` fica de fora: no ecrã os jobs e os saltos de relógio são marcos que atravessam
 * a grelha inteira, sem coluna própria, logo sem ponto de onde uma seta pudesse sair.
 */
export function derivarFluxos(eventos: readonly EventoParaFluxo[]): FluxoSimulacao[] {
  const ultimoToque = new Map<string, EventoParaFluxo>();
  const fluxos: FluxoSimulacao[] = [];

  for (const evento of eventos) {
    if (!evento.entidade || evento.raia === "sistema") continue;

    const anterior = ultimoToque.get(evento.entidade);
    if (anterior && anterior.raia !== evento.raia) {
      fluxos.push({
        deId: anterior.id,
        paraId: evento.id,
        deRaia: anterior.raia,
        paraRaia: evento.raia,
        entidade: evento.entidade,
      });
    }
    ultimoToque.set(evento.entidade, evento);
  }

  return fluxos;
}

/**
 * Quantas raias distintas tocaram cada entidade — a medida de "isto atravessa a instituição".
 * Uma entidade tocada por três papéis é onde vale a pena olhar primeiro quando algo corre mal,
 * porque é onde há mais sítios para o fluxo se partir.
 */
export function entidadesMaisAtravessadas(
  eventos: readonly EventoParaFluxo[],
  limite = 5,
): { entidade: string; raias: number; toques: number }[] {
  const porEntidade = new Map<string, { raias: Set<RaiaSimulacao>; toques: number }>();

  for (const evento of eventos) {
    if (!evento.entidade || evento.raia === "sistema") continue;
    const atual = porEntidade.get(evento.entidade) ?? { raias: new Set<RaiaSimulacao>(), toques: 0 };
    atual.raias.add(evento.raia);
    atual.toques += 1;
    porEntidade.set(evento.entidade, atual);
  }

  return [...porEntidade.entries()]
    .map(([entidade, v]) => ({ entidade, raias: v.raias.size, toques: v.toques }))
    .sort((a, b) => b.raias - a.raias || b.toques - a.toques || a.entidade.localeCompare(b.entidade))
    .slice(0, limite);
}
