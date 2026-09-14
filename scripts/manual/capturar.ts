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
import { mkdir, writeFile } from "node:fs/promises";
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
 *
 * Em coordenadas do DOCUMENTO (rect + scrollX/Y) e não da janela, porque as capturas de página
 * inteira rolam a página — com `position: fixed` os números ficavam todos empilhados no sítio
 * errado.
 */
const DESENHAR_PONTEIROS = `(pontos) => {
  const anterior = document.getElementById("__manual_ponteiros");
  if (anterior) anterior.remove();

  const camada = document.createElement("div");
  camada.id = "__manual_ponteiros";
  camada.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none";
  document.body.appendChild(camada);

  // A maioria dos ponteiros do manual aponta para um botão ou um cabeçalho, e escrever um seletor
  // CSS para cada um seria frágil e ilegível. Com \`texto\` procura-se pelo rótulo que a pessoa
  // realmente vê no ecrã — que é também o que o texto do manual vai citar.
  const procurarPorTexto = (texto) => {
    const alvo = texto.toLowerCase();
    const candidatos = Array.from(document.querySelectorAll(
      "button, a, h1, h2, h3, th, label, input, select, summary, [role=button], [role=tab]"
    ));
    return (
      candidatos.find((e) => (e.textContent || "").trim().toLowerCase() === alvo) ||
      candidatos.find((e) => (e.textContent || "").trim().toLowerCase().includes(alvo)) ||
      candidatos.find((e) => ((e.getAttribute("placeholder") || "") + (e.getAttribute("aria-label") || "")).toLowerCase().includes(alvo)) ||
      null
    );
  };

  const emFalta = [];
  pontos.forEach((p, i) => {
    const el = p.selector ? document.querySelector(p.selector) : p.texto ? procurarPorTexto(p.texto) : null;
    if (!el) { emFalta.push(p.selector || p.texto || "(ponteiro sem alvo definido)"); return; }
    const r = el.getBoundingClientRect();
    const x = r.left + window.scrollX;
    const y = r.top + window.scrollY;

    const anel = document.createElement("div");
    anel.style.cssText =
      "position:absolute;left:" + (x - 5) + "px;top:" + (y - 5) + "px;width:" + (r.width + 10) +
      "px;height:" + (r.height + 10) + "px;border:3px solid #E8590C;border-radius:10px;" +
      "box-shadow:0 0 0 4px rgba(232,89,12,0.16);";
    camada.appendChild(anel);

    const numero = document.createElement("div");
    numero.textContent = String(i + 1);
    numero.style.cssText =
      "position:absolute;left:" + (x - 19) + "px;top:" + (y - 19) + "px;width:30px;height:30px;" +
      "border-radius:999px;background:#E8590C;color:#fff;text-align:center;" +
      "font:700 16px/30px ui-sans-serif,system-ui,-apple-system,sans-serif;" +
      "box-shadow:0 2px 8px rgba(0,0,0,0.35);";
    camada.appendChild(numero);
  });
  return emFalta;
}`;

async function executarAcao(page: Page, acao: Acao): Promise<void> {
  switch (acao.tipo) {
    case "clicar":
      await page.click(acao.selector, { timeout: 15_000 });
      break;
    case "clicarTexto":
      await page.getByText(acao.texto, { exact: false }).first().click({ timeout: 15_000 });
      break;
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
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identificador"]', identificador);
  await page.fill('input[name="password"]', senha);
  await page.click('button[type="submit"]');
  // O login é uma Server Action seguida de redirect do lado do cliente — esperar por networkidle
  // resolve cedo demais e apanha a página ainda em "A entrar...".
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
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
    await page.waitForLoadState("networkidle", { timeout: 25_000 }).catch(() => {});

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
    let emFalta: string[] = [];
    if (ponteiros.length > 0) {
      emFalta = (await page.evaluate(DESENHAR_PONTEIROS, ponteiros)) as string[];
    }

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

    for (const captura of capitulo.capturas) {
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

  await writeFile(path.join(RAIZ, "capturas.json"), JSON.stringify(resultados, null, 2), "utf8");

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
