import { Document, Page, View, Text, Image as PdfImage, StyleSheet } from "@react-pdf/renderer";
import type { Epoca } from "@/generated/prisma/client";
import { EPOCA_ORDEM, EPOCA_LABEL, ESTADO_LABEL, type EstadoAvaliacao } from "@/lib/avaliacao";

const NAVY = "#1b1b5c";
const GRAY_LABEL = "#6b7280";
const GRAY_BORDER = "#d1d5db";

// Mesma linguagem visual da PautaDocument — cabeçalho institucional, barra de título e grelha de
// meta. Um aluno que leve as duas folhas à secretaria não devia ver dois documentos de duas escolas.
const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#111111" },

  header: { position: "relative", minHeight: 88, marginBottom: 18, paddingTop: 8, paddingBottom: 8 },
  logoBox: { position: "absolute", top: 0, left: -20, width: 88, height: 88, alignItems: "center", justifyContent: "center" },
  logo: { width: 84, height: 84, objectFit: "contain" },
  headerInfo: { alignItems: "center", justifyContent: "center", minHeight: 88 },
  institutionName: { fontSize: 15, fontWeight: 700, color: NAVY, textAlign: "center", textTransform: "uppercase" },
  institutionSubtitle: { fontSize: 9, color: GRAY_LABEL, textAlign: "center", marginTop: 4 },
  headerDivider: { borderBottomWidth: 1, borderBottomColor: NAVY, marginBottom: 18 },

  titleBar: { backgroundColor: NAVY, paddingVertical: 10, marginBottom: 18 },
  titleBarText: { color: "#ffffff", fontSize: 11, fontWeight: 700, textAlign: "center", letterSpacing: 0.5 },

  metaGrid: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: GRAY_BORDER, marginBottom: 20 },
  metaItem: { width: "33.33%", borderRightWidth: 1, borderBottomWidth: 1, borderColor: GRAY_BORDER, padding: 8 },
  metaLabel: { fontSize: 7, color: GRAY_LABEL, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  metaValue: { fontSize: 10, fontWeight: 700, color: "#111111" },

  seccaoTitulo: { fontSize: 10, fontWeight: 700, color: NAVY, marginBottom: 6, marginTop: 10 },
  seccaoSubtitulo: { fontSize: 8, color: GRAY_LABEL, marginBottom: 6 },

  table: { borderLeftWidth: 1, borderLeftColor: GRAY_BORDER, marginBottom: 12 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: NAVY },
  tableRow: { flexDirection: "row" },
  cellDisciplina: { width: "28%" },
  cellEpoca: { width: "9%", textAlign: "center" },
  cellMedia: { width: "9%", textAlign: "center" },
  cellEstado: { width: "12%" },
  cellFinal: { width: "6%", textAlign: "center" },
  headerCell: { padding: 6, fontSize: 7, fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: 0.3 },
  cell: {
    paddingHorizontal: 6,
    paddingVertical: 8,
    fontSize: 8,
    borderBottomWidth: 1,
    borderBottomColor: GRAY_BORDER,
    borderRightWidth: 1,
    borderRightColor: GRAY_BORDER,
  },

  rodape: { marginTop: 14, fontSize: 7, color: GRAY_LABEL, textAlign: "center" },
});

export interface LinhaHistorico {
  disciplina: string;
  /** >1 marca a linha como repetição; 1 não se escreve, para não poluir a folha. */
  tentativa: number;
  notasPorEpoca: Partial<Record<Epoca, number>>;
  notaFrequencia: number | null;
  estado: EstadoAvaliacao;
  notaFinal: number | null;
}

export interface SemestreHistorico {
  semestre: number;
  /** "2026/2027" — em que ano letivo este semestre foi frequentado. */
  anoLetivoLabel: string;
  /** "Engenharia Informática · 2º Ano" — o mesmo rótulo que o aluno vê no ecrã. */
  turmaLabel: string;
  linhas: LinhaHistorico[];
}

export interface HistoricoNotasDocumentProps {
  instituicaoNome: string;
  logoSrc: string;
  alunoNome: string;
  numeroEstudante: string;
  curso: string;
  /** "2º Ano" — o ano DO CURSO que esta folha cobre. */
  anoLabel: string;
  dataEmissao: string;
  seccoes: SemestreHistorico[];
}

function TableHeader() {
  return (
    <View style={styles.tableHeaderRow}>
      <Text style={[styles.headerCell, styles.cellDisciplina]}>Disciplina</Text>
      {EPOCA_ORDEM.map((epoca) => (
        <Text key={epoca} style={[styles.headerCell, styles.cellEpoca]}>
          {EPOCA_LABEL[epoca]}
        </Text>
      ))}
      <Text style={[styles.headerCell, styles.cellMedia]}>Média</Text>
      <Text style={[styles.headerCell, styles.cellEstado]}>Situação</Text>
      <Text style={[styles.headerCell, styles.cellFinal]}>Final</Text>
    </View>
  );
}

/**
 * Histórico de notas de UM aluno num ano do curso, para o próprio imprimir (§pedido do cliente
 * 2026-09-09: "quando eles estão a ver as suas notas, a ideia é que podem imprimir de cada ano").
 *
 * Uma folha por ano do curso, e não o percurso inteiro: é assim que o documento serve para o que os
 * alunos costumam precisar dele — entregar o comprovativo de um ano concreto. Cada secção diz em
 * que ano letivo aquele semestre foi frequentado, que é o que distingue a cadeira repetida da
 * original sem partir a folha em duas.
 */
export function HistoricoNotasDocument({
  instituicaoNome,
  logoSrc,
  alunoNome,
  numeroEstudante,
  curso,
  anoLabel,
  dataEmissao,
  seccoes,
}: HistoricoNotasDocumentProps) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View fixed>
          <View style={styles.header}>
            <View style={styles.logoBox}>
              <PdfImage src={logoSrc} style={styles.logo} />
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.institutionName}>{instituicaoNome}</Text>
              <Text style={styles.institutionSubtitle}>Direcção Académica | Histórico de Notas</Text>
            </View>
          </View>
          <View style={styles.headerDivider} />

          <View style={styles.titleBar}>
            <Text style={styles.titleBarText}>HISTÓRICO DE NOTAS — {anoLabel}</Text>
          </View>

          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Estudante</Text>
              <Text style={styles.metaValue}>{alunoNome}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>N.º Estudante</Text>
              <Text style={styles.metaValue}>{numeroEstudante}</Text>
            </View>
            <View style={[styles.metaItem, { borderRightWidth: 0 }]}>
              <Text style={styles.metaLabel}>Curso</Text>
              <Text style={styles.metaValue}>{curso}</Text>
            </View>
            <View style={[styles.metaItem, { borderBottomWidth: 0 }]}>
              <Text style={styles.metaLabel}>Ano do curso</Text>
              <Text style={styles.metaValue}>{anoLabel}</Text>
            </View>
            <View style={[styles.metaItem, { borderRightWidth: 0, borderBottomWidth: 0 }]}>
              <Text style={styles.metaLabel}>Data de emissão</Text>
              <Text style={styles.metaValue}>{dataEmissao}</Text>
            </View>
          </View>
        </View>

        {seccoes.map((seccao) => (
          <View key={`${seccao.anoLetivoLabel}-${seccao.semestre}`} wrap={false}>
            <Text style={styles.seccaoTitulo}>{seccao.turmaLabel}</Text>
            <Text style={styles.seccaoSubtitulo}>
              {seccao.semestre}º Semestre · {seccao.anoLetivoLabel}
            </Text>
            <View style={styles.table}>
              <TableHeader />
              {seccao.linhas.map((linha) => (
                <View key={`${linha.disciplina}-${linha.tentativa}`} style={styles.tableRow} wrap={false}>
                  <Text style={[styles.cell, styles.cellDisciplina]}>
                    {linha.disciplina}
                    {linha.tentativa > 1 ? ` (${linha.tentativa}ª tentativa)` : ""}
                  </Text>
                  {EPOCA_ORDEM.map((epoca) => (
                    <Text key={epoca} style={[styles.cell, styles.cellEpoca]}>
                      {linha.notasPorEpoca[epoca] ?? "—"}
                    </Text>
                  ))}
                  <Text style={[styles.cell, styles.cellMedia]}>
                    {linha.notaFrequencia !== null ? linha.notaFrequencia.toFixed(1) : "—"}
                  </Text>
                  <Text style={[styles.cell, styles.cellEstado]}>{ESTADO_LABEL[linha.estado]}</Text>
                  <Text style={[styles.cell, styles.cellFinal]}>
                    {linha.notaFinal !== null ? linha.notaFinal.toFixed(1) : "—"}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.rodape}>
          Documento informativo emitido pelo portal do estudante. Não dispensa a certidão oficial da secretaria.
        </Text>
      </Page>
    </Document>
  );
}
