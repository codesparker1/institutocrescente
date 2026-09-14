/**
 * Compõe o manual como documento Word (§pedido do cliente 2026-09-14: "procura um open source
 * project que permite escrever directamente para word com formatação para depois passar para o
 * pdf"). O PDF sai depois deste ficheiro, pelo próprio Word — ver scripts/manual/docx-para-pdf.ps1.
 *
 * Porquê Word e não o PDF gerado do HTML que já existia: um .docx é EDITÁVEL. A faculdade pode
 * acrescentar as suas notas, mudar o logótipo e corrigir uma frase sem depender de quem escreveu o
 * gerador. O PDF composto a partir do HTML era um beco: bonito e impossível de mexer.
 *
 * Biblioteca: `docx` (dolanmiu/docx), MIT. Escolhida sobre html-to-docx porque gera OOXML nativo
 * com ESTILOS do Word — títulos a sério, que alimentam o painel de navegação e o índice automático.
 * O html-to-docx converteria o HTML existente, mas o suporte de CSS é fraco e o resultado sairia
 * difícil de editar, que é precisamente a vantagem que se queria.
 *
 * Lê docs/manual/capturas.json (escrito por scripts/manual/capturar.ts) e o texto dos capítulos de
 * scripts/manual/paginas.ts. Escreve docs/manual/Manual-ISPC.docx.
 *
 * Usage: npx tsx scripts/manual/gerar-docx.ts
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  convertMillimetersToTwip,
} from "docx";
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { CAPITULOS, type Capitulo } from "./paginas";

const RAIZ = path.resolve(process.cwd(), "docs/manual");
const DOCX = path.join(RAIZ, "Manual-ISPC.docx");
const LOGO = path.resolve(process.cwd(), "public/logo.png");

// ---------------------------------------------------------------------------------------------
// Medidas
// ---------------------------------------------------------------------------------------------

const MARGEM_MM = 20;
/** Largura útil da página A4 com as margens acima, em píxeis a 96dpi (que é como o docx mede imagens). */
const LARGURA_UTIL_PX = Math.round(((210 - MARGEM_MM * 2) / 25.4) * 96);
/** Altura máxima de uma figura: deixa espaço para o título, a legenda e a tabela de ponteiros. */
const ALTURA_MAX_PX = 660;

const COR = {
  tinta: "14213D",
  accent: "E8590C",
  suave: "5A6474",
  linhaClara: "DDD8CE",
  caixa: "F3F0EA",
  aviso: "FDF4E7",
  avisoBordo: "EED9BC",
  avisoRotulo: "9A6A2C",
};

// ---------------------------------------------------------------------------------------------

interface CapturaManifesto {
  papel: string;
  id: string;
  titulo: string;
  legenda: string;
  rota: string;
  ficheiro: string;
  ponteiros: { numero: number; nota: string }[];
}

/**
 * Largura e altura de um PNG, lidas do cabeçalho: assinatura de 8 bytes e depois o chunk IHDR, com
 * a largura no byte 16 e a altura no 20, posições fixas pela norma. Oito bytes não justificam uma
 * dependência.
 */
function dimensoesPng(buf: Buffer): { largura: number; altura: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20) };
}

/**
 * Converte *asteriscos* em nomes de interface — o que a pessoa vê no ecrã. Distingui-los evita a
 * leitura ambígua de "clique em guardar" (guardar o quê?) para "clique em **Guardar**" (aquele
 * botão, ali).
 */
function texto(s: string, opcoes: { size?: number; color?: string; bold?: boolean } = {}): TextRun[] {
  const base = { size: opcoes.size ?? 21, color: opcoes.color ?? COR.tinta, bold: opcoes.bold };
  return s.split(/(\*[^*]+\*)/).filter(Boolean).map((parte) =>
    parte.startsWith("*") && parte.endsWith("*")
      ? new TextRun({ ...base, text: parte.slice(1, -1), bold: true, font: "Segoe UI", shading: { type: ShadingType.CLEAR, fill: COR.caixa } })
      : new TextRun({ ...base, text: parte }),
  );
}

function paragrafo(s: string, opcoes: { size?: number; color?: string; espacoDepois?: number; italico?: boolean } = {}): Paragraph {
  return new Paragraph({
    children: texto(s, { size: opcoes.size, color: opcoes.color }),
    spacing: { after: opcoes.espacoDepois ?? 120, line: 276 },
  });
}

/** Tabela sem traços — usada como grelha de composição, não como tabela de dados. */
const SEM_BORDAS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

// ---------------------------------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------------------------------

/**
 * A legenda numerada de uma figura, em tabela sem traços: uma coluna estreita com o número (na cor
 * dos anéis desenhados na captura) e outra com a explicação. Em lista solta, os números afastavam-se
 * do texto e deixavam de se ligar à imagem.
 */
function tabelaPonteiros(ponteiros: { numero: number; nota: string }[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: SEM_BORDAS,
    rows: ponteiros.map(
      (p) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 6, type: WidthType.PERCENTAGE },
              borders: SEM_BORDAS,
              margins: { top: 40, bottom: 40, left: 0, right: 80 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [new TextRun({ text: String(p.numero), bold: true, color: COR.accent, size: 21, font: "Segoe UI" })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 94, type: WidthType.PERCENTAGE },
              borders: SEM_BORDAS,
              margins: { top: 40, bottom: 40, left: 0, right: 0 },
              children: [new Paragraph({ children: texto(p.nota, { size: 19 }), spacing: { line: 260 } })],
            }),
          ],
        }),
    ),
  });
}

/** Uma ficha de problema: fundo quente, o sintoma em destaque, e depois a causa e o que fazer. */
function fichaProblema(p: { sintoma: string; causa: string; solucao: string }): Table {
  const rotulo = (s: string) =>
    new Paragraph({
      spacing: { before: 100, after: 20 },
      children: [new TextRun({ text: s.toUpperCase(), bold: true, size: 15, color: COR.avisoRotulo, font: "Segoe UI", characterSpacing: 20 })],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: COR.avisoBordo },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COR.avisoBordo },
      left: { style: BorderStyle.SINGLE, size: 4, color: COR.avisoBordo },
      right: { style: BorderStyle.SINGLE, size: 4, color: COR.avisoBordo },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: COR.aviso },
            margins: { top: 160, bottom: 160, left: 160, right: 160 },
            children: [
              new Paragraph({
                spacing: { after: 40 },
                children: [new TextRun({ text: p.sintoma, bold: true, size: 21, font: "Segoe UI", color: COR.tinta })],
              }),
              rotulo("Porque acontece"),
              new Paragraph({ children: texto(p.causa, { size: 19 }), spacing: { line: 260 } }),
              rotulo("O que fazer"),
              new Paragraph({ children: texto(p.solucao, { size: 19 }), spacing: { line: 260 } }),
            ],
          }),
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------------------------

const PAPEIS: [string, string][] = [
  ["Administrador", "Monta o sistema, cria contas, repõe senhas, configura o financeiro e vê a auditoria."],
  ["DAAC", "Cursos, disciplinas, plano curricular, turmas, horários, notas e finalistas."],
  ["Professor", "Marca presenças e lança notas nas disciplinas que lhe foram atribuídas."],
  ["Secretaria", "Matrícula de estudantes, registo de pagamentos, recibos e devedores."],
  ["Estudante", "Consulta as suas notas, o horário, as propinas e a monografia."],
  ["Responsável Técnico", "Recebe as reclamações e sugestões de todos os outros papéis."],
];

const PASSOS: string[] = [
  "*Configuração Académica* — as datas do ano letivo e a janela de matrícula. Sem isto, quase todos os ecrãs aparecem vazios.",
  "*Cursos* — nome, código e duração em anos de cada curso.",
  "*Disciplinas* — o catálogo. Criar aqui ainda não põe a disciplina em nenhum ano.",
  "*Plano Curricular* — em que ano e semestre de cada curso se lecciona cada disciplina. É o passo que faz tudo o resto funcionar.",
  "*Preços de Propina* e *Emolumentos* — quanto custa a mensalidade por categoria e ano, e o catálogo de serviços.",
  "*Professores* e *Equipa* — as contas de quem vai trabalhar no sistema.",
  "*Turmas* — as coortes do ano letivo. As disciplinas entram sozinhas, vindas do plano; falta atribuir o professor a cada uma.",
  "*Gestão de Matrícula* — finalmente, os primeiros estudantes.",
];

function tabelaPapeis(): Table {
  const cabecalho = (s: string) =>
    new TableCell({
      borders: { ...SEM_BORDAS, bottom: { style: BorderStyle.SINGLE, size: 8, color: COR.tinta } },
      margins: { top: 60, bottom: 80, left: 0, right: 120 },
      children: [
        new Paragraph({ children: [new TextRun({ text: s, bold: true, size: 15, color: COR.suave, font: "Segoe UI", characterSpacing: 24 })] }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: SEM_BORDAS,
    rows: [
      new TableRow({ tableHeader: true, children: [cabecalho("PAPEL"), cabecalho("DO QUE TRATA")] }),
      ...PAPEIS.map(
        ([nome, desc]) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 26, type: WidthType.PERCENTAGE },
                borders: { ...SEM_BORDAS, bottom: { style: BorderStyle.SINGLE, size: 2, color: COR.linhaClara } },
                margins: { top: 100, bottom: 100, left: 0, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: nome, bold: true, size: 19, font: "Segoe UI", color: COR.tinta })] })],
              }),
              new TableCell({
                width: { size: 74, type: WidthType.PERCENTAGE },
                borders: { ...SEM_BORDAS, bottom: { style: BorderStyle.SINGLE, size: 2, color: COR.linhaClara } },
                margins: { top: 100, bottom: 100, left: 0, right: 0 },
                children: [new Paragraph({ children: [new TextRun({ text: desc, size: 19, color: COR.tinta })] })],
              }),
            ],
          }),
      ),
    ],
  });
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const manifesto: CapturaManifesto[] = JSON.parse(await readFile(path.join(RAIZ, "capturas.json"), "utf8"));
  console.log(`${manifesto.length} captura(s) no manifesto.`);

  const porPapel = new Map<string, CapturaManifesto[]>();
  for (const c of manifesto) {
    const lista = porPapel.get(c.papel) ?? [];
    lista.push(c);
    porPapel.set(c.papel, lista);
  }
  const capitulos = CAPITULOS.filter((c) => (porPapel.get(c.papel) ?? []).length > 0);

  const logo = await readFile(LOGO);
  const corpo: (Paragraph | Table)[] = [];

  // --- Capa -----------------------------------------------------------------------------------
  corpo.push(
    new Paragraph({ spacing: { before: 2200, after: 0 }, alignment: AlignmentType.CENTER, children: [
      new ImageRun({ data: logo, type: "png", transformation: { width: 120, height: 120 } }),
    ] }),
    new Paragraph({ spacing: { before: 300, after: 200 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "INSTITUTO SUPERIOR POLITÉCNICO CRESCENTE", bold: true, size: 17, color: COR.suave, font: "Segoe UI", characterSpacing: 40 }),
    ] }),
    new Paragraph({ spacing: { after: 160 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "Manual do Sistema de Gestão Académica", bold: true, size: 56, color: COR.tinta }),
    ] }),
    new Paragraph({ spacing: { after: 240 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "────────", color: COR.accent, size: 24 }),
    ] }),
    new Paragraph({ spacing: { after: 900 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "Guia de utilização por papel — Administrador, DAAC, Professor,", size: 24, color: COR.suave }),
    ] }),
    new Paragraph({ spacing: { after: 900 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "Secretaria, Estudante e Responsável Técnico.", size: 24, color: COR.suave }),
    ] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" }), size: 18, color: COR.suave, font: "Segoe UI" }),
    ] }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // --- Índice ---------------------------------------------------------------------------------
  // Campo do Word, não uma lista escrita à mão: quando a faculdade acrescentar uma secção, o índice
  // actualiza-se sozinho (botão direito > Actualizar campo).
  corpo.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Índice", bold: true })] }),
    new TableOfContents("Sumário", { hyperlink: true, headingStyleRange: "1-2" }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // --- Introdução -----------------------------------------------------------------------------
  corpo.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Introdução", bold: true })] }),
    paragrafo(
      "Este manual explica o sistema de gestão académica do Instituto Superior Politécnico Crescente, papel a papel. Cada capítulo é fechado: quem trabalha na Secretaria só precisa de ler o capítulo da Secretaria.",
      { size: 23 },
    ),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "O que o sistema faz", bold: true })] }),
    paragrafo(
      "Guarda num só lugar os cursos e o seu plano de estudos, as turmas de cada ano, os professores e as disciplinas que lhes competem, as notas e as presenças, as propinas e os pagamentos, e o percurso de cada estudante desde a matrícula até à defesa da monografia.",
    ),
    paragrafo(
      "Não é um arquivo passivo: o sistema recusa acções que quebrariam as regras da instituição. Não deixa rematricular um aluno com cadeiras por avaliar, não deixa marcar um exame antes da prova anterior, e não deixa um professor lançar notas fora do semestre corrente. Quando algo é recusado, a mensagem diz sempre porquê.",
    ),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Quem faz o quê", bold: true })] }),
    paragrafo("Todos entram pelo mesmo endereço e pelo mesmo ecrã. O que muda é o menu lateral, que mostra apenas o que aquele papel pode fazer."),
    tabelaPapeis(),
    new Paragraph({ spacing: { after: 200 }, children: [] }),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Entrar pela primeira vez", bold: true })] }),
    paragrafo(
      "O campo de entrada aceita o email ou o número de estudante — os dois servem. A senha inicial de qualquer conta nova é *Ispc@2026*, e o sistema obriga a trocá-la logo à primeira entrada. Quem perder a senha não a recupera sozinho: o Administrador repõe-na para a senha inicial, em *Professores* ou *Equipa*.",
    ),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Montar o sistema a partir do zero", bold: true })] }),
    paragrafo("Num sistema vazio, a ordem importa — cada passo depende do anterior. Esta é a sequência, e é também a ordem por que o capítulo do Administrador está escrito."),
    ...PASSOS.map(
      (p, i) =>
        new Paragraph({
          spacing: { after: 100, line: 276 },
          indent: { left: 400, hanging: 400 },
          children: [new TextRun({ text: `${i + 1}.  `, bold: true, color: COR.accent, font: "Segoe UI", size: 21 }), ...texto(p)],
        }),
    ),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Duas convenções que valem para todo o sistema", bold: true })] }),
    paragrafo("Nada é aplicado antes de premir *Guardar* — sair de um ecrã a meio não deixa nada guardado pelo caminho."),
    paragrafo("Tudo o que alguém faz fica registado com o nome de quem fez, a data e o endereço, no *Registo de Auditoria*. Esse registo não se apaga nem se edita."),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Como ler as imagens", bold: true })] }),
    paragrafo(
      "As capturas de ecrã deste manual têm anéis laranja com números. Cada número corresponde a uma explicação na lista imediatamente abaixo da imagem. Os nomes de menus, botões e campos aparecem ao longo do texto assim: *Guardar*.",
    ),
  );

  // --- Capítulos ------------------------------------------------------------------------------
  let numeroFigura = 0;
  const avisos: string[] = [];

  for (const [i, capitulo] of capitulos.entries()) {
    const capturas = porPapel.get(capitulo.papel)!;

    corpo.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: `CAPÍTULO ${i + 1}`, bold: true, size: 16, color: COR.accent, font: "Segoe UI", characterSpacing: 40 })],
      }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: capitulo.nome, bold: true })] }),
      paragrafo(capitulo.resumo, { size: 23 }),
    );

    for (const c of capturas) {
      numeroFigura += 1;
      const abs = path.join(RAIZ, c.ficheiro);
      let imagem: Paragraph | null = null;
      try {
        const buf = await readFile(abs);
        const dim = dimensoesPng(buf);
        if (!dim) throw new Error("não é PNG");
        const escala = Math.min(LARGURA_UTIL_PX / dim.largura, ALTURA_MAX_PX / dim.altura);
        imagem = new Paragraph({
          spacing: { before: 80, after: 80 },
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: buf,
              type: "png",
              transformation: { width: Math.round(dim.largura * escala), height: Math.round(dim.altura * escala) },
            }),
          ],
        });
      } catch (erro) {
        avisos.push(`${c.papel}/${c.id}: ${(erro as Error).message}`);
      }

      corpo.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: c.titulo, bold: true })] }));
      corpo.push(paragrafo(c.legenda));
      if (imagem) corpo.push(imagem);
      corpo.push(
        new Paragraph({
          spacing: { after: 140 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `Figura ${numeroFigura}`, bold: true, size: 16, color: COR.accent, font: "Segoe UI" }),
            new TextRun({ text: `  ·  ${c.titulo}  ·  ${c.rota}`, size: 16, color: COR.suave, font: "Segoe UI" }),
          ],
        }),
      );
      if (c.ponteiros.length > 0) {
        corpo.push(tabelaPonteiros(c.ponteiros));
        corpo.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
      }
    }

    corpo.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Problemas e situações que pode encontrar", bold: true })] }),
      paragrafo(
        "O que costuma correr mal neste papel, porque acontece, e o que fazer. Quase nenhum destes casos é uma avaria do sistema — a maioria é uma regra a ser cumprida.",
        { size: 20, color: COR.suave },
      ),
    );
    for (const p of capitulo.problemas) {
      corpo.push(fichaProblema(p));
      corpo.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
    }
  }

  // --- Documento ------------------------------------------------------------------------------
  const doc = new Document({
    creator: "Instituto Superior Politécnico Crescente",
    title: "Manual do Sistema de Gestão Académica",
    description: "Guia de utilização por papel",
    styles: {
      default: {
        document: { run: { font: "Georgia", size: 21, color: COR.tinta }, paragraph: { spacing: { line: 276 } } },
        // Títulos com estilo NATIVO do Word: é o que alimenta o painel de navegação e o índice
        // automático, e o que permite à faculdade mudar o aspecto de todos os títulos de uma vez.
        heading1: {
          run: { font: "Georgia", size: 40, bold: true, color: COR.tinta },
          paragraph: { spacing: { before: 240, after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COR.tinta, space: 8 } } },
        },
        heading2: {
          run: { font: "Segoe UI", size: 24, bold: true, color: COR.tinta },
          paragraph: { spacing: { before: 320, after: 120 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
            margin: {
              top: convertMillimetersToTwip(MARGEM_MM),
              bottom: convertMillimetersToTwip(MARGEM_MM),
              left: convertMillimetersToTwip(MARGEM_MM),
              right: convertMillimetersToTwip(MARGEM_MM),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: "Manual do Sistema de Gestão Académica  ·  ISPC", size: 15, color: COR.suave, font: "Segoe UI" })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], size: 15, color: COR.suave, font: "Segoe UI" })],
              }),
            ],
          }),
        },
        children: corpo,
      },
    ],
  });

  await writeFile(DOCX, await Packer.toBuffer(doc));
  const tamanho = (await stat(DOCX)).size;
  console.log(`DOCX: ${path.relative(process.cwd(), DOCX)}  (${(tamanho / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`${capitulos.length} capítulo(s), ${numeroFigura} figura(s).`);
  if (avisos.length > 0) {
    console.log(`\n${avisos.length} aviso(s):`);
    for (const a of avisos) console.log(`  ${a}`);
  }
  console.log("\nPara o PDF: pwsh scripts/manual/docx-para-pdf.ps1");
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
