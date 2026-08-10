import { Document, Page, View, Text, Image as PdfImage, StyleSheet } from "@react-pdf/renderer";

const NAVY = "#1b1b5c";
const GRAY_LABEL = "#6b7280";
const GRAY_BORDER = "#d1d5db";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#111111" },

  header: { position: "relative", minHeight: 88, marginBottom: 18, paddingTop: 8, paddingBottom: 8 },
  logoBox: {
    position: "absolute",
    top: 0,
    left: -20,
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 84, height: 84, objectFit: "contain" },
  headerInfo: { alignItems: "center", justifyContent: "center", minHeight: 88 },
  institutionName: {
    fontSize: 15,
    fontWeight: 700,
    color: NAVY,
    textAlign: "center",
    textTransform: "uppercase",
  },
  institutionSubtitle: {
    fontSize: 9,
    color: GRAY_LABEL,
    textAlign: "center",
    marginTop: 4,
  },
  headerDivider: { borderBottomWidth: 1, borderBottomColor: NAVY, marginBottom: 18 },

  titleBar: { backgroundColor: NAVY, paddingVertical: 10, marginBottom: 18 },
  titleBarText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: 700,
    textAlign: "center",
    letterSpacing: 0.5,
  },

  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: GRAY_BORDER,
    marginBottom: 20,
  },
  metaItem: {
    width: "33.33%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: GRAY_BORDER,
    padding: 8,
  },
  metaLabel: { fontSize: 7, color: GRAY_LABEL, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  metaValue: { fontSize: 10, fontWeight: 700, color: "#111111" },

  table: { borderLeftWidth: 1, borderLeftColor: GRAY_BORDER },
  tableHeaderRow: { flexDirection: "row", backgroundColor: NAVY },
  tableRow: { flexDirection: "row" },
  cellNum: { width: "6%" },
  cellEstudante: { width: "16%" },
  cellNome: { width: "34%" },
  cellAssinatura: { width: "34%" },
  cellNota: { width: "10%" },
  headerCell: {
    padding: 8,
    fontSize: 8,
    fontWeight: 700,
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  cell: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    fontSize: 9,
    borderBottomWidth: 1,
    borderBottomColor: GRAY_BORDER,
    borderRightWidth: 1,
    borderRightColor: GRAY_BORDER,
  },
});

interface AlunoLinha {
  numero: number;
  numeroEstudante: string;
  nome: string;
}

export interface ListaPresencaDocumentProps {
  instituicaoNome: string;
  logoSrc: string;
  curso: string;
  disciplina: string;
  anoTurma: string;
  epocaProva: string;
  docente: string;
  dataHora: string;
  alunos: AlunoLinha[];
}

function TableHeader() {
  return (
    <View style={styles.tableHeaderRow} fixed>
      <Text style={[styles.headerCell, styles.cellNum]}>N.º</Text>
      <Text style={[styles.headerCell, styles.cellEstudante]}>N.º Estudante</Text>
      <Text style={[styles.headerCell, styles.cellNome]}>Nome completo</Text>
      <Text style={[styles.headerCell, styles.cellAssinatura]}>Assinatura</Text>
      <Text style={[styles.headerCell, styles.cellNota]}>Nota</Text>
    </View>
  );
}

export function ListaPresencaDocument({
  instituicaoNome,
  logoSrc,
  curso,
  disciplina,
  anoTurma,
  epocaProva,
  docente,
  dataHora,
  alunos,
}: ListaPresencaDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View fixed>
          <View style={styles.header}>
            <View style={styles.logoBox}>
              <PdfImage src={logoSrc} style={styles.logo} />
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.institutionName}>{instituicaoNome}</Text>
              <Text style={styles.institutionSubtitle}>Direcção Académica | Serviços de Secretaria</Text>
            </View>
          </View>
          <View style={styles.headerDivider} />

          <View style={styles.titleBar}>
            <Text style={styles.titleBarText}>LISTA DE PRESENÇA — ACTO DE PROVA</Text>
          </View>

          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Curso</Text>
              <Text style={styles.metaValue}>{curso}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Disciplina</Text>
              <Text style={styles.metaValue}>{disciplina}</Text>
            </View>
            <View style={[styles.metaItem, { borderRightWidth: 0 }]}>
              <Text style={styles.metaLabel}>Ano / Turma</Text>
              <Text style={styles.metaValue}>{anoTurma}</Text>
            </View>
            <View style={[styles.metaItem, { borderBottomWidth: 0 }]}>
              <Text style={styles.metaLabel}>Época / Prova</Text>
              <Text style={styles.metaValue}>{epocaProva}</Text>
            </View>
            <View style={[styles.metaItem, { borderBottomWidth: 0 }]}>
              <Text style={styles.metaLabel}>Docente</Text>
              <Text style={styles.metaValue}>{docente}</Text>
            </View>
            <View style={[styles.metaItem, { borderRightWidth: 0, borderBottomWidth: 0 }]}>
              <Text style={styles.metaLabel}>Data / Hora</Text>
              <Text style={styles.metaValue}>{dataHora}</Text>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <TableHeader />
          {alunos.map((aluno) => (
            <View key={aluno.numeroEstudante} style={styles.tableRow} wrap={false}>
              <Text style={[styles.cell, styles.cellNum]}>{aluno.numero}</Text>
              <Text style={[styles.cell, styles.cellEstudante]}>{aluno.numeroEstudante}</Text>
              <Text style={[styles.cell, styles.cellNome]}>{aluno.nome}</Text>
              <Text style={[styles.cell, styles.cellAssinatura]}> </Text>
              <Text style={[styles.cell, styles.cellNota]}> </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
