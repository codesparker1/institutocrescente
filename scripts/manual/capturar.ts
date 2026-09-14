/**
 * Tira as capturas de ecrã do manual da faculdade (§pedido do cliente 2026-09-13: "com cada tendo
 * imagem clara com ponteiros para poder se entender bem").
 *
 * Corre contra o SITE PUBLICADO, não contra um servidor local — as imagens do manual têm de ser
 * exatamente o que a faculdade vê no browser dela. A base por trás é a que scripts/manual/seed-manual.ts
 * semeou.
 *
 * O que sai daqui:
 *   docs/manual/imagens/<papel>/<id>.png   uma imagem por captura
 *   docs/manual/capturas.json              o manifesto (título, legenda, ponteiros) que o gerador
 *                                          do PDF consome — capturar e compor são passos separados,
 *                                          para se poder reescrever o texto do manual sem voltar a
 *                                          abrir um browser.
 *
 * Usage:
 *   npx tsx scripts/manual/capturar.ts             # tudo
 *   npx tsx scripts/manual/capturar.ts admin daac  # só estes capítulos
 */
import { chromium, type Browser, type Page } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CAPITULOS, type Acao, type Captura, type Capitulo } from "./paginas";

const BASE = process.env.MANUAL_BASE_URL ?? "https://institutocrescente-code-spark1.vercel.app";
const RAIZ = path.resolve(process.cwd(), "docs/manual");
const IMAGENS = path.join(RAIZ, "imagens");

/** 2x para o PDF não sair com as letras a tremer quando a imagem é reduzida para caber na página. */
const ESCALA = 2;
const LARGURA = 1440;
const ALTURA = 900;

interface ResultadoCaptura {
  papel: string;
  id: string;
  titulo: string;
  legenda: string;
  rota: string;
  ficheiro: string;
  ponteiros: { numero: number; nota: string }[];
  /** Seletores de ponteiro que não encontraram nada — falha de guião, não do sistema. */
  ponteirosEmFalta: string[];
  /** Texto visível da página, para se detetar um ecrã vazio sem abrir a imagem. */
  aviso: string | null;
}

/**
 * Desenha os ponteiros por cima da página: um anel à volta do elemento e um número ao canto.
 * Devolve os alvos que não encontrou — falha do guião, não do sistema.
 *
 * Tem de ser uma FUNÇÃO e não uma string: `page.evaluate` com uma string avalia-a como expressão e
 * nunca a chama com o argumento, devolvendo undefined em silêncio e sem desenhar nada.
 *
 * As posições vão em coordenadas do DOCUMENTO (rect + scroll) e não da janela, porque as capturas
 * de página inteira rolam a página — com `position: fixed` os números empilhavam-se no sítio errado.
 */
function desenharPonteiros(pontos: { selector?: string; texto?: string; nota: string }[]): string[] {
  const anterior = document.getElementById("__manual_ponteiros");
  if (anterior) anterior.remove();

  const camada = document.createElement("div");
  camada.id = "__manual_ponteiros";
  camada.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none";
  document.body.appendChild(camada);

  // A maioria dos ponteiros aponta para um botão ou um cabeçalho, e escrever um seletor CSS para
  // cada um seria frágil e ilegível. Com `texto` procura-se pelo rótulo que a pessoa vê no ecrã —
  // que é também o que o texto do manual cita.
  const procurarPorTexto = (texto: string): Element | null => {
    const alvo = texto.toLowerCase();
    const candidatos = Array.from(
      document.querySelectorAll("button, a, h1, h2, h3, th, label, input, select, summary, [role=button], [role=tab]"),
    );
    const conteudo = (e: Element) => (e.textContent ?? "").trim().toLowerCase();
    return (
      candidatos.find((e) => conteudo(e) === alvo) ??
      candidatos.find((e) => conteudo(e).includes(alvo)) ??
      candidatos.find((e) =>
        ((e.getAttribute("placeholder") ?? "") + (e.getAttribute("aria-label") ?? "")).toLowerCase().includes(alvo),
      ) ??
      null
    );
  };

  const emFalta: string[] = [];
  pontos.forEach((p, i) => {
    const el = p.selector ? document.querySelector(p.selector) : p.texto ? procurarPorTexto(p.texto) : null;
    if (!el) {
      emFalta.push(p.selector ?? p.texto ?? "(ponteiro sem alvo definido)");
      return;
    }
    const r = el.getBoundingClientRect();
    const x = r.left + window.scrollX;
    const y = r.top + window.scrollY;

    // Elementos colados ao bordo — a barra lateral, o cabeçalho — dão coordenadas negativas, e o
    // anel e o número saíam cortados fora da imagem. Encostar ao bordo em vez de transbordar.
    const anelX = Math.max(2, x - 5);
    const anelY = Math.max(2, y - 5);
    const anel = document.createElement("div");
    anel.style.cssText =
      `position:absolute;left:${anelX}px;top:${anelY}px;` +
      `width:${r.width + 10 - (anelX - (x - 5))}px;height:${r.height + 10 - (anelY - (y - 5))}px;` +
      "border:3px solid #E8590C;border-radius:10px;box-shadow:0 0 0 4px rgba(232,89,12,0.16);";
    camada.appendChild(anel);

    const numero = document.createElement("div");
    numero.textContent = String(i + 1);
    // O número fica no canto do elemento, mas nunca fora da imagem: num elemento encostado ao
    // topo ou à esquerda, passa para dentro em vez de ficar em coordenada negativa.
    numero.style.cssText =
      `position:absolute;left:${Math.max(4, x - 19)}px;top:${Math.max(4, y - 19)}px;width:30px;height:30px;` +
      "border-radius:999px;background:#E8590C;color:#fff;text-align:center;" +
      "font:700 16px/30px ui-sans-serif,system-ui,-apple-system,sans-serif;" +
      "box-shadow:0 2px 8px rgba(0,0,0,0.35);";
    camada.appendChild(numero);
  });
  return emFalta;
}

async function executarAcao(page: Page, acao: Acao): Promise<void> {
  switch (acao.tipo) {
    case "clicar":
      await page.click(acao.selector, { timeout: 15_000 });
      break;
    case "clicarTexto": {
      // Por papel (ligação, depois botão) antes de cair no texto solto: numa tabela, o nome de uma
      // turma aparece também dentro de filtros e de células não clicáveis, e o primeiro nó de texto
      // a corresponder raramente é o que abre a página.
      const nome = new RegExp(acao.texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const candidatos = [
        page.getByRole("link", { name: nome }),
        page.getByRole("button", { name: nome }),
        page.getByText(acao.texto, { exact: false }),
      ];
      for (const [i, loc] of candidatos.entries()) {
        if ((await loc.count()) === 0) continue;
        try {
          await loc.first().click({ timeout: 10_000 });
          return;
        } catch (erro) {
          if (i === candidatos.length - 1) throw erro;
        }
      }
      throw new Error(`nada clicável com o texto "${acao.texto}"`);
    }
    case "preencher":
      await page.fill(acao.selector, acao.valor, { timeout: 15_000 });
      break;
    case "esperar":
      await page.waitForTimeout(acao.ms);
      break;
    case "esperarSelector":
      await page.waitForSelector(acao.selector, { timeout: 20_000 });
      break;
  }
}

async function entrar(page: Page, identificador: string, senha: string): Promise<void> {
  // "load" e não "domcontentloaded": o formulário é um useActionState, e preencher antes de o React
  // hidratar fazia com que a hidratação repusesse os campos a vazio entre o preencher e o clicar —
  // o clique submetia um formulário vazio, sem erro visível, e o ecrã ficava parado em "Entrar".
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 30_000 });
  await page.waitForTimeout(1500);

  await page.fill('input[name="identificador"]', identificador);
  await page.fill('input[name="password"]', senha);

  // Confirma que os valores lá ficaram mesmo. Se a hidratação os apagou, preenche outra vez —
  // é mais barato do que um timeout de 60s a seguir.
  const preenchido = await page.inputValue('input[name="identificador"]');
  if (preenchido !== identificador) {
    await page.fill('input[name="identificador"]', identificador);
    await page.fill('input[name="password"]', senha);
  }

  await page.click('button[type="submit"]');
  // O login é uma Server Action seguida de redirect do lado do cliente — esperar por networkidle
  // resolve cedo demais e apanha a página ainda em "A entrar...".
  try {
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  } catch (erro) {
    // Um login que não passa é quase sempre o formulário a mostrar um erro na própria página —
    // credenciais, bloqueio, ou o servidor a devolver algo inesperado. Sem ver o ecrã, o timeout
    // sozinho não diz nada e leva a adivinhar.
    const visivel = await page.locator("body").innerText().catch(() => "(não foi possível ler a página)");
    console.log(`    ecrã no momento do timeout (${page.url()}):`);
    console.log(`    ${visivel.replace(/\n+/g, " | ").slice(0, 400)}`);
    throw erro;
  }
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
}

async function sair(page: Page): Promise<void> {
  await page.context().clearCookies();
}

/** Um ecrã que só diz "não há nada" é quase sempre um seed incompleto, não uma página partida. */
function detetarAviso(texto: string, captura: Captura, urlFinal: string): string | null {
  // Algumas capturas mudam de rota de propósito — clicar no nome de um aluno para abrir a ficha
  // dele, cujo id não se pode escrever no catálogo. Aí o desvio é o objetivo, não um sintoma.
  if (!captura.permitirRedirecionamento && !urlFinal.includes(captura.rota.split("?")[0])) {
    return `redirecionado para ${urlFinal}`;
  }
  const vazio = ["Nenhum registo", "Nenhuma", "Ainda não", "não encontrad", "Sem resultados", "vazio"];
  const encontrado = vazio.find((v) => texto.includes(v));
  return encontrado ? `possível ecrã vazio ("${encontrado}")` : null;
}

async function capturarUma(
  page: Page,
  capitulo: Capitulo,
  captura: Captura,
): Promise<ResultadoCaptura | null> {
  const url = `${BASE}${captura.rota}`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    // networkidle é só uma conveniência: uma aplicação Next com streaming raramente o atinge, e
    // esperar 25s por página custava mais do que a captura toda. O tempo fixo a seguir é o que
    // realmente garante que as animações de entrada acabaram.
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});

    for (const acao of captura.acoes ?? []) {
      await executarAcao(page, acao);
    }
    if (captura.esperarPor) {
      await page.waitForSelector(captura.esperarPor, { timeout: 25_000 });
    }
    // As animações de entrada ainda estão a correr logo após networkidle; meio segundo evita
    // capturas com metade dos cartões a 50% de opacidade.
    await page.waitForTimeout(600);

    const ponteiros = captura.ponteiros ?? [];
    const emFalta = ponteiros.length > 0 ? await page.evaluate(desenharPonteiros, ponteiros) : [];

    const pasta = path.join(IMAGENS, capitulo.papel);
    await mkdir(pasta, { recursive: true });
    const ficheiro = path.join(pasta, `${captura.id}.png`);

    const alvo = captura.recortar ? page.locator(captura.recortar).first() : null;
    if (alvo) {
      await alvo.screenshot({ path: ficheiro });
    } else {
      await page.screenshot({ path: ficheiro, fullPage: captura.paginaInteira ?? false });
    }

    const texto = await page.locator("body").innerText();
    return {
      papel: capitulo.papel,
      id: captura.id,
      titulo: captura.titulo,
      legenda: captura.legenda,
      rota: captura.rota,
      ficheiro: path.relative(RAIZ, ficheiro).replace(/\\/g, "/"),
      ponteiros: ponteiros.map((p, i) => ({ numero: i + 1, nota: p.nota })),
      ponteirosEmFalta: emFalta,
      aviso: detetarAviso(texto, captura, page.url()),
    };
  } catch (erro) {
    console.log(`    ERRO em ${captura.id} (${captura.rota}): ${(erro as Error).message.split("\n")[0]}`);
    return null;
  }
}

async function main() {
  const pedidos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const capitulos = pedidos.length > 0 ? CAPITULOS.filter((c) => pedidos.includes(c.papel)) : CAPITULOS;
  if (capitulos.length === 0) {
    console.log(`Nenhum capítulo corresponde a: ${pedidos.join(", ")}`);
    console.log(`Disponíveis: ${CAPITULOS.map((c) => c.papel).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Site: ${BASE}`);
  await mkdir(IMAGENS, { recursive: true });

  const browser: Browser = await chromium.launch();
  const resultados: ResultadoCaptura[] = [];
  const falhas: string[] = [];

  for (const capitulo of capitulos) {
    console.log(`\n${capitulo.papel.toUpperCase()} — ${capitulo.nome} (${capitulo.capturas.length} capturas)`);
    const context = await browser.newContext({
      viewport: { width: LARGURA, height: ALTURA },
      deviceScaleFactor: ESCALA,
      locale: "pt-PT",
    });
    const page = await context.newPage();

    // O tsx compila com keepNames, que envolve cada função nomeada numa chamada a __name. O
    // Playwright serializa a função de desenho dos ponteiros e leva essa referência para o browser,
    // onde __name não existe — e o page.evaluate rebentava com ReferenceError em todas as capturas
    // com ponteiros. Definido como string de propósito: um init script escrito como função voltaria
    // a passar pelo mesmo compilador e teria o mesmo problema.
    await context.addInitScript({ content: "globalThis.__name = globalThis.__name || ((f) => f);" });

    // O capítulo do ecrã de entrada é o único que fotografa o sistema de fora — sem sessão.
    if (capitulo.login) {
      try {
        await entrar(page, capitulo.login.identificador, capitulo.login.senha);
      } catch (erro) {
        console.log(`  LOGIN FALHOU (${capitulo.login.identificador}): ${(erro as Error).message.split("\n")[0]}`);
        falhas.push(`${capitulo.papel}: login`);
        await context.close();
        continue;
      }
    }

    let contaAtual = capitulo.login?.identificador ?? null;

    for (const captura of capitulo.capturas) {
      // Uma captura pode pedir outra conta (ver Captura.login). Trocar exige voltar atrás a seguir,
      // senão as capturas seguintes saíam com o utilizador errado — e ninguém daria por isso a olhar
      // para a imagem, porque a página é a mesma.
      const desejada = captura.login ?? capitulo.login;
      if (desejada && desejada.identificador !== contaAtual) {
        try {
          await page.context().clearCookies();
          await entrar(page, desejada.identificador, desejada.senha);
          contaAtual = desejada.identificador;
        } catch {
          console.log(`  troca de conta falhou (${desejada.identificador}) — ${captura.id} saltada`);
          falhas.push(`${capitulo.papel}/${captura.id}: login`);
          continue;
        }
      }

      const r = await capturarUma(page, capitulo, captura);
      if (!r) {
        falhas.push(`${capitulo.papel}/${captura.id}`);
        continue;
      }
      resultados.push(r);
      const notas = [
        r.aviso ? `AVISO: ${r.aviso}` : null,
        r.ponteirosEmFalta.length > 0 ? `ponteiros sem alvo: ${r.ponteirosEmFalta.join(", ")}` : null,
      ].filter(Boolean);
      console.log(`  ok ${r.id}${notas.length > 0 ? `  [${notas.join(" | ")}]` : ""}`);
    }

    await sair(page);
    await context.close();
  }

  await browser.close();

  // Funde com o que já lá está, em vez de substituir: correr um capítulo sozinho para corrigir uma
  // captura não pode apagar do manifesto os outros cinco. A ordem final segue o catálogo, não a
  // ordem por que as corridas aconteceram.
  const anterior: ResultadoCaptura[] = await readFile(path.join(RAIZ, "capturas.json"), "utf8")
    .then((t) => JSON.parse(t) as ResultadoCaptura[])
    .catch(() => []);
  const papeisCorridos = new Set(capitulos.map((c) => c.papel));
  const juntos = [...anterior.filter((r) => !papeisCorridos.has(r.papel)), ...resultados];

  const ordem = new Map<string, number>();
  CAPITULOS.forEach((c, i) => c.capturas.forEach((cap, j) => ordem.set(`${c.papel}/${cap.id}`, i * 1000 + j)));
  juntos.sort((a, b) => (ordem.get(`${a.papel}/${a.id}`) ?? 0) - (ordem.get(`${b.papel}/${b.id}`) ?? 0));

  await writeFile(path.join(RAIZ, "capturas.json"), JSON.stringify(juntos, null, 2), "utf8");

  console.log(`\n${resultados.length} captura(s) em ${path.relative(process.cwd(), IMAGENS)}`);
  console.log(`Manifesto: ${path.relative(process.cwd(), path.join(RAIZ, "capturas.json"))}`);

  const comAviso = resultados.filter((r) => r.aviso);
  if (comAviso.length > 0) {
    console.log(`\n${comAviso.length} com aviso (rever antes de usar no manual):`);
    for (const r of comAviso) console.log(`  ${r.papel}/${r.id}: ${r.aviso}`);
  }
  if (falhas.length > 0) {
    console.log(`\n${falhas.length} falha(s): ${falhas.join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
