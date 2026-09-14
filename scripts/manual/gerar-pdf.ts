/**
 * Compõe o manual em PDF a partir das capturas (§pedido do cliente 2026-09-13: "PDF para imprimir",
 * introdução e depois um capítulo por papel, cada um a fechar com os problemas que podem enfrentar).
 *
 * Lê docs/manual/capturas.json (o manifesto que scripts/manual/capturar.ts escreveu) e junta-lhe o
 * texto dos capítulos de scripts/manual/paginas.ts. Capturar e compor são passos separados de
 * propósito: reescrever o manual não obriga a reabrir um browser.
 *
 * Escreve docs/manual/manual.html e docs/manual/Manual-ISPC.pdf.
 *
 * Usage: npx tsx scripts/manual/gerar-pdf.ts
 */
import { chromium } from "playwright";
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { CAPITULOS, type Capitulo } from "./paginas";

/**
 * Largura e altura de um PNG, lidas do cabeçalho. Um PNG começa sempre com a assinatura de 8 bytes
 * e o chunk IHDR, que tem a largura no byte 16 e a altura no 20 — posições fixas pela norma. Ler
 * isto à mão em vez de acrescentar uma dependência para oito bytes.
 */
async function dimensoesPng(ficheiro: string): Promise<{ largura: number; altura: number } | null> {
  const buf = await readFile(ficheiro);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20) };
}

const RAIZ = path.resolve(process.cwd(), "docs/manual");
const HTML = path.join(RAIZ, "manual.html");
const PDF = path.join(RAIZ, "Manual-ISPC.pdf");
const LOGO = path.resolve(process.cwd(), "public/logo.png").replace(/\\/g, "/");

/** Altura máxima de uma imagem na página, em mm. Sobra para o título, a legenda e os números. */
const ALTURA_MAX_MM = 172;

interface CapturaManifesto {
  papel: string;
  id: string;
  titulo: string;
  legenda: string;
  rota: string;
  ficheiro: string;
  ponteiros: { numero: number; nota: string }[];
  ponteirosEmFalta: string[];
  aviso: string | null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Põe em <span class="ui"> tudo o que está entre asteriscos — os nomes de menus e botões. O manual
 * cita-os muitas vezes, e distingui-los tipograficamente evita a leitura ambígua de "clique em
 * guardar" (guardar o quê? onde?) para "clique em Guardar" (aquele botão, ali).
 */
function marcar(s: string): string {
  return esc(s).replace(/\*([^*]+)\*/g, '<span class="ui">$1</span>');
}

const ESTILO = `
:root {
  --tinta: #14213D;
  --papel: #FBFAF7;
  --accent: #E8590C;
  --suave: #5A6474;
  --linha: #DDD8CE;
  --caixa: #F3F0EA;
  --aviso: #FDF4E7;
}

@page { size: A4; margin: 20mm 16mm 18mm; }

* { box-sizing: border-box; }

html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

body {
  margin: 0;
  background: var(--papel);
  color: var(--tinta);
  font-family: "Source Serif 4", Georgia, "Times New Roman", serif;
  font-size: 10.5pt;
  line-height: 1.55;
}

p { margin: 0 0 0.7em; text-wrap: pretty; }

/* Nomes de menus, botões e campos — o que a pessoa vê no ecrã. */
.ui {
  font-family: "IBM Plex Sans", -apple-system, system-ui, sans-serif;
  font-size: 0.92em;
  font-weight: 600;
  letter-spacing: 0.005em;
  color: #0E1A33;
  background: var(--caixa);
  border: 1px solid var(--linha);
  border-radius: 3px;
  padding: 0.05em 0.34em;
  white-space: nowrap;
}

/* ---------- Capa ---------- */
.capa {
  height: 257mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
  break-after: page;
}
.capa img { width: 34mm; margin: 0 auto 12mm; }
.capa .instituicao {
  font-family: "IBM Plex Sans", sans-serif;
  font-size: 9pt;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--suave);
  margin-bottom: 6mm;
}
.capa h1 {
  font-size: 30pt;
  line-height: 1.1;
  font-weight: 600;
  margin: 0 0 5mm;
  text-wrap: balance;
}
.capa .risco { width: 26mm; height: 2.5pt; background: var(--accent); margin: 0 auto 6mm; }
.capa .sub { font-size: 12pt; color: var(--suave); max-width: 115mm; margin: 0 auto 16mm; }
.capa .meta {
  font-family: "IBM Plex Sans", sans-serif;
  font-size: 8.5pt;
  color: var(--suave);
  letter-spacing: 0.04em;
}

/* ---------- Introdução ---------- */
.intro { break-after: page; }
h2.secao {
  font-size: 19pt;
  font-weight: 600;
  margin: 0 0 2mm;
  padding-bottom: 2.5mm;
  border-bottom: 2pt solid var(--tinta);
  text-wrap: balance;
}
h3 {
  font-family: "IBM Plex Sans", sans-serif;
  font-size: 11pt;
  font-weight: 600;
  margin: 7mm 0 2mm;
  color: var(--tinta);
}
.lead { font-size: 11.5pt; color: #2A3550; margin-bottom: 5mm; }

table.papeis { width: 100%; border-collapse: collapse; margin: 3mm 0 6mm; font-size: 9.5pt; }
table.papeis th {
  font-family: "IBM Plex Sans", sans-serif;
  font-size: 7.8pt;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--suave);
  text-align: left;
  border-bottom: 1pt solid var(--tinta);
  padding: 0 3mm 1.6mm 0;
}
table.papeis td { padding: 2.2mm 3mm 2.2mm 0; border-bottom: 0.5pt solid var(--linha); vertical-align: top; }
table.papeis td:first-child {
  font-family: "IBM Plex Sans", sans-serif;
  font-weight: 600;
  font-size: 9.5pt;
  white-space: nowrap;
}

ol.passos { margin: 2mm 0 5mm; padding-left: 0; list-style: none; counter-reset: passo; }
ol.passos li {
  counter-increment: passo;
  position: relative;
  padding-left: 9mm;
  margin-bottom: 2.2mm;
  break-inside: avoid;
}
ol.passos li::before {
  content: counter(passo);
  position: absolute;
  left: 0;
  top: 0.1em;
  width: 6mm;
  height: 6mm;
  border-radius: 50%;
  background: var(--tinta);
  color: #fff;
  font-family: "IBM Plex Sans", sans-serif;
  font-size: 8pt;
  font-weight: 600;
  text-align: center;
  line-height: 6mm;
}

.nota-caixa {
  background: var(--caixa);
  border-left: 2.5pt solid var(--accent);
  padding: 3.5mm 4mm;
  margin: 4mm 0 5mm;
  font-size: 10pt;
  break-inside: avoid;
}
.nota-caixa strong { font-family: "IBM Plex Sans", sans-serif; font-size: 9.5pt; }

/* ---------- Capítulos ---------- */
.capitulo { break-before: page; }
.capitulo-abre { margin-bottom: 6mm; }
.capitulo-num {
  font-family: "IBM Plex Sans", sans-serif;
  font-size: 8pt;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 2mm;
}
.capitulo h2 {
  font-size: 24pt;
  font-weight: 600;
  margin: 0 0 3mm;
  padding-bottom: 3mm;
  border-bottom: 2pt solid var(--tinta);
}

/* ---------- Figuras ---------- */
.figura { break-inside: avoid; margin: 0 0 8mm; }
.figura h3 { margin-top: 0; }
.figura .legenda { font-size: 10pt; margin-bottom: 3mm; }
.figura .moldura {
  border: 0.75pt solid var(--linha);
  background: #fff;
  padding: 1.5mm;
  text-align: center;
}
.figura img { max-width: 100%; max-height: ${ALTURA_MAX_MM}mm; height: auto; display: block; margin: 0 auto; }
.figura .rota {
  font-family: "IBM Plex Sans", sans-serif;
  font-size: 7.5pt;
  color: var(--suave);
  letter-spacing: 0.03em;
  margin-top: 1.5mm;
}

ol.ponteiros { margin: 3mm 0 0; padding-left: 0; list-style: none; counter-reset: p; font-size: 9.5pt; }
ol.ponteiros li {
  counter-increment: p;
  position: relative;
  padding-left: 8mm;
  margin-bottom: 1.6mm;
  break-inside: avoid;
}
/* Mesma cor e mesmo número do anel desenhado na captura — é o que liga a legenda à imagem. */
ol.ponteiros li::before {
  content: counter(p);
  position: absolute;
  left: 0;
  top: 0.05em;
  width: 5.4mm;
  height: 5.4mm;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-family: "IBM Plex Sans", sans-serif;
  font-size: 7.5pt;
  font-weight: 700;
  text-align: center;
  line-height: 5.4mm;
}

/* ---------- Problemas ---------- */
.problemas { break-before: page; }
.problemas h3.titulo {
  font-size: 15pt;
  font-family: "Source Serif 4", Georgia, serif;
  font-weight: 600;
  margin: 0 0 1.5mm;
  padding-bottom: 2mm;
  border-bottom: 1.5pt solid var(--accent);
}
.problemas .aberto { font-size: 10pt; color: var(--suave); margin-bottom: 5mm; }
.problema {
  background: var(--aviso);
  border: 0.5pt solid #EED9BC;
  border-radius: 2mm;
  padding: 4mm 4.5mm;
  margin-bottom: 3.5mm;
  break-inside: avoid;
}
.problema .sintoma {
  font-family: "IBM Plex Sans", sans-serif;
  font-size: 10pt;
  font-weight: 600;
  margin-bottom: 2mm;
  line-height: 1.35;
}
.problema dl { margin: 0; font-size: 9.5pt; }
.problema dt {
  font-family: "IBM Plex Sans", sans-serif;
  font-size: 7.6pt;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #9A6A2C;
  margin-top: 1.5mm;
}
.problema dd { margin: 0.4mm 0 0; }
`;

const CABECALHO_PAPEIS = [
  ["Administrador", "Monta o sistema, cria contas, repõe senhas, configura o financeiro e vê a auditoria."],
  ["DAAC", "Cursos, disciplinas, plano curricular, turmas, horários, notas e finalistas."],
  ["Professor", "Marca presenças e lança notas nas disciplinas que lhe foram atribuídas."],
  ["Secretaria", "Matrícula de estudantes, registo de pagamentos, recibos e devedores."],
  ["Estudante", "Consulta as suas notas, o horário, as propinas e a monografia."],
  ["Resp. Técnico", "Recebe as reclamações e sugestões de todos os outros papéis."],
];

const PASSOS_MONTAGEM = [
  "*Configuração Académica* — as datas do ano letivo e a janela de matrícula. Sem isto, quase todos os ecrãs aparecem vazios.",
  "*Cursos* — nome, código e duração em anos de cada curso.",
  "*Disciplinas* — o catálogo. Criar aqui ainda não põe a disciplina em nenhum ano.",
  "*Plano Curricular* — em que ano e semestre de cada curso se lecciona cada disciplina. É o passo que faz tudo o resto funcionar.",
  "*Preços de Propina* e *Emolumentos* — quanto custa a mensalidade por categoria e ano, e o catálogo de serviços.",
  "*Professores* e *Equipa* — as contas de quem vai trabalhar no sistema.",
  "*Turmas* — as coortes do ano letivo. As disciplinas entram sozinhas, vindas do plano; falta atribuir o professor a cada uma.",
  "*Gestão de Matrícula* — finalmente, os primeiros estudantes.",
];

function renderIntro(): string {
  return `
<section class="intro">
  <h2 class="secao">Introdução</h2>
  <p class="lead">
    Este manual explica o sistema de gestão académica do Instituto Superior Politécnico Crescente,
    papel a papel. Cada capítulo é fechado: quem trabalha na Secretaria só precisa de ler o capítulo
    da Secretaria.
  </p>

  <h3>O que o sistema faz</h3>
  <p>
    Guarda num só lugar os cursos e o seu plano de estudos, as turmas de cada ano, os professores e
    as disciplinas que lhes competem, as notas e as presenças, as propinas e os pagamentos, e o
    percurso de cada estudante desde a matrícula até à defesa da monografia.
  </p>
  <p>
    Não é um arquivo passivo: o sistema recusa acções que quebrariam as regras da instituição. Não
    deixa rematricular um aluno com cadeiras por avaliar, não deixa marcar um exame antes da prova
    anterior, e não deixa um professor lançar notas fora do semestre corrente. Quando algo é recusado,
    a mensagem diz sempre porquê.
  </p>

  <h3>Quem faz o quê</h3>
  <p>
    Todos entram pelo mesmo endereço e pelo mesmo ecrã. O que muda é o menu lateral, que mostra
    apenas o que aquele papel pode fazer.
  </p>
  <table class="papeis">
    <thead><tr><th>Papel</th><th>Do que trata</th></tr></thead>
    <tbody>
      ${CABECALHO_PAPEIS.map(([p, d]) => `<tr><td>${esc(p)}</td><td>${esc(d)}</td></tr>`).join("\n      ")}
    </tbody>
  </table>

  <h3>Entrar pela primeira vez</h3>
  <p>
    O campo de entrada aceita o <strong>email</strong> ou o <strong>número de estudante</strong> — os
    dois servem. A senha inicial de qualquer conta nova é <span class="ui">Ispc@2026</span>, e o
    sistema obriga a trocá-la logo à primeira entrada. Quem perder a senha não a recupera sozinho: o
    Administrador repõe-na para a senha inicial, em <span class="ui">Professores</span> ou
    <span class="ui">Equipa</span>.
  </p>

  <h3>Montar o sistema a partir do zero</h3>
  <p>
    Num sistema vazio, a ordem importa — cada passo depende do anterior. Esta é a sequência, e é
    também a ordem por que o capítulo do Administrador está escrito.
  </p>
  <ol class="passos">
    ${PASSOS_MONTAGEM.map((s) => `<li>${marcar(s)}</li>`).join("\n    ")}
  </ol>

  <div class="nota-caixa">
    <p><strong>Duas convenções que valem para todo o sistema.</strong></p>
    <p>
      Nada é aplicado antes de premir <span class="ui">Guardar</span> — sair de um ecrã a meio não
      deixa nada guardado pelo caminho.
    </p>
    <p style="margin-bottom:0">
      Tudo o que alguém faz fica registado com o nome de quem fez, a data e o endereço, no
      <span class="ui">Registo de Auditoria</span>. Esse registo não se apaga nem se edita.
    </p>
  </div>

  <h3>Como ler as imagens</h3>
  <p>
    As capturas de ecrã deste manual têm anéis laranja com números. Cada número corresponde a uma
    explicação na lista imediatamente abaixo da imagem. Os nomes de menus, botões e campos aparecem
    ao longo do texto assim: <span class="ui">Guardar</span>.
  </p>
</section>`;
}

function renderCapitulo(capitulo: Capitulo, numero: number, capturas: CapturaManifesto[]): string {
  const figuras = capturas
    .map(
      (c) => `
    <figure class="figura">
      <h3>${esc(c.titulo)}</h3>
      <p class="legenda">${marcar(c.legenda)}</p>
      <div class="moldura">
        <img src="${esc(c.ficheiro)}" alt="${esc(c.titulo)}">
      </div>
      <p class="rota">Onde: ${esc(c.rota)}</p>
      ${
        c.ponteiros.length > 0
          ? `<ol class="ponteiros">
        ${c.ponteiros.map((p) => `<li>${marcar(p.nota)}</li>`).join("\n        ")}
      </ol>`
          : ""
      }
    </figure>`,
    )
    .join("\n");

  const problemas = capitulo.problemas
    .map(
      (p) => `
    <div class="problema">
      <p class="sintoma">${esc(p.sintoma)}</p>
      <dl>
        <dt>Porque acontece</dt><dd>${marcar(p.causa)}</dd>
        <dt>O que fazer</dt><dd>${marcar(p.solucao)}</dd>
      </dl>
    </div>`,
    )
    .join("\n");

  return `
<section class="capitulo">
  <div class="capitulo-abre">
    <p class="capitulo-num">Capítulo ${numero}</p>
    <h2>${esc(capitulo.nome)}</h2>
    <p class="lead">${marcar(capitulo.resumo)}</p>
  </div>
${figuras}

  <section class="problemas">
    <h3 class="titulo">Problemas e situações que pode encontrar</h3>
    <p class="aberto">
      O que costuma correr mal neste papel, porque acontece, e o que fazer. Quase nenhum destes casos
      é uma avaria do sistema — a maioria é uma regra a ser cumprida.
    </p>
${problemas}
  </section>
</section>`;
}

async function main() {
  const manifesto: CapturaManifesto[] = JSON.parse(await readFile(path.join(RAIZ, "capturas.json"), "utf8"));
  console.log(`${manifesto.length} captura(s) no manifesto.`);

  // Imagens muito altas encolhem até ficarem estreitas e ilegíveis na página. Vale a pena saber
  // quais são antes de olhar para o PDF — a correção é trocar essa captura para só o ecrã visível.
  const avisos: string[] = [];
  for (const c of manifesto) {
    const abs = path.join(RAIZ, c.ficheiro);
    try {
      const dim = await dimensoesPng(abs);
      if (dim) {
        const proporcao = dim.altura / dim.largura;
        const larguraMm = Math.min(178, ALTURA_MAX_MM / proporcao);
        if (larguraMm < 120) {
          avisos.push(`${c.papel}/${c.id}: ${dim.largura}x${dim.altura} — sai com ${larguraMm.toFixed(0)}mm de largura`);
        }
      }
    } catch {
      avisos.push(`${c.papel}/${c.id}: IMAGEM EM FALTA (${c.ficheiro})`);
    }
  }

  const porPapel = new Map<string, CapturaManifesto[]>();
  for (const c of manifesto) {
    const lista = porPapel.get(c.papel) ?? [];
    lista.push(c);
    porPapel.set(c.papel, lista);
  }

  const capitulos = CAPITULOS.filter((c) => (porPapel.get(c.papel) ?? []).length > 0);
  const corpo = capitulos
    .map((c, i) => renderCapitulo(c, i + 1, porPapel.get(c.papel)!))
    .join("\n");

  const dataHoje = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });

  const html = `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<title>Manual do Sistema — ISPC</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=IBM+Plex+Sans:wght@400;600;700&display=swap">
<style>${ESTILO}</style>
</head>
<body>
<section class="capa">
  <img src="file:///${LOGO}" alt="Instituto Superior Politécnico Crescente">
  <p class="instituicao">Instituto Superior Politécnico Crescente</p>
  <h1>Manual do Sistema de Gestão Académica</h1>
  <div class="risco"></div>
  <p class="sub">Guia de utilização por papel — Administrador, DAAC, Professor, Secretaria, Estudante e Responsável Técnico.</p>
  <p class="meta">${esc(dataHoje)}</p>
</section>

${renderIntro()}
${corpo}
</body>
</html>`;

  await writeFile(HTML, html, "utf8");
  console.log(`HTML: ${path.relative(process.cwd(), HTML)}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file:///${HTML.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
  // As fontes do Google chegam depois do networkidle em alguns casos; sem isto o PDF sai em
  // Georgia e a tipografia toda do documento muda.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);

  await page.pdf({
    path: PDF,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    margin: { top: "20mm", bottom: "18mm", left: "16mm", right: "16mm" },
    headerTemplate: `<div style="width:100%;font-family:'IBM Plex Sans',sans-serif;font-size:7pt;color:#8A93A3;padding:0 16mm;display:flex;justify-content:space-between;">
      <span>Manual do Sistema de Gestão Académica</span><span>ISPC</span></div>`,
    footerTemplate: `<div style="width:100%;font-family:'IBM Plex Sans',sans-serif;font-size:7pt;color:#8A93A3;padding:0 16mm;text-align:center;">
      <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
  });
  await browser.close();

  const tamanho = (await stat(PDF)).size;
  console.log(`PDF:  ${path.relative(process.cwd(), PDF)}  (${(tamanho / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`${capitulos.length} capítulo(s): ${capitulos.map((c) => c.nome).join(", ")}`);

  if (avisos.length > 0) {
    console.log(`\n${avisos.length} aviso(s) sobre as imagens:`);
    for (const a of avisos) console.log(`  ${a}`);
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
