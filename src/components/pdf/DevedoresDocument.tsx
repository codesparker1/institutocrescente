import { Document, Page, View, Text, Image as PdfImage, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/utils";

const NAVY = "#1b1b5c";
const GRAY_LABEL = "#6b7280";
const GRAY_BORDER = "#d1d5db";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#111111" },

  header: { position: "relative", minHeight: 74, marginBottom: 16, paddingTop: 6, paddingBottom: 6 },
  logoBox: { position: "absolute", top: 0, left: -16, width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  logo: { width: 68, height: 68, objectFit: "contain" },
  headerInfo: { alignItems: "center", justifyContent: "center", minHeight: 72 },
  institutionName: { fontSize: 14, fontWeight: 700, color: NAVY, textAlign: "center", textTransform: "uppercase" },
  institutionSubtitle: { fontSize: 8.5, color: GRAY_LABEL, textAlign: "center", marginTop: 3 },
  headerDivider: { borderBottomWidth: 1, borderBottomColor: NAVY, marginBottom: 14 },

  titleBar: { backgroundColor: NAVY, paddingVertical: 8, marginBottom: 12, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10 },
  titleBarText: { color: "#ffffff", fontSize: 10, fontWeight: 700, letterSpacing: 0.5 },

  filtrosBox: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  filtroChip: { borderWidth: 1, borderColor: GRAY_BORDER, borderRadius: 3, paddingVertical: 3, paddingHorizontal: 6, fontSize: 7.5, color: GRAY_LABEL },

  table: { borderLeftWidth: 1, borderLeftColor: GRAY_BORDER },
  tableHeaderRow: { flexDirection: "row", backgroundColor: NAVY },
  tableRow: { flexDirection: "row" },
  cellAluno: { width: "28%" },
  cellCurso: { width: "24%" },
  cellCategoria: { width: "14%" },
  cellValor: { width: "16%", textAlign: "right" },
  cellMeses: { width: "18%", textAlign: "center" },
  headerCell: { padding: 6, fontSize: 7, fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: 0.3 },
  cell: {
    paddingHorizontal: 6,
    paddingVertical: 7,
    fontSize: 8,
    borderBottomWidth: 1,
    borderBottomColor: GRAY_BORDER,
    borderRightWidth: 1,
    borderRightColor: GRAY_BORDER,
  },

  rodape: { marginTop: 14, flexDirection: "row", justifyContent: "space-between" },
  rodapeCampo: { fontSize: 7.5, color: GRAY_LABEL },
});

export interface DevedorLinha {
  numeroEstudante: string;
  nome: string;
  curso: string;
  anoCurricular: number;
  categoria: string;
  valorEmDivida: number;
  mesesEmAtraso: number;
}

export interface DevedoresDocumentProps {
  instituicaoNome: string;
  logoSrc: string;
  filtrosAplicados: string[];
  totalEmDivida: number;
  dataEmissao: string;
  devedores: DevedorLinha[];
}

function TableHeader() {
  return (
    <View style={styles.tableHeaderRow} fixed>
      <Text style={[styles.headerCell, styles.cellAluno]}>Aluno</Text>
      <Text style={[styles.headerCell, styles.cellCurso]}>Curso / Ano</Text>
      <Text style={[styles.headerCell, styles.cellCategoria]}>Categoria</Text>
      <Text style={[styles.headerCell, styles.cellValor]}>Valor em dívida</Text>
      <Text style={[styles.headerCell, styles.cellMeses]}>Meses em atraso</Text>
    </View>
  );
}

export function DevedoresDocument({ instituicaoNome, logoSrc, filtrosAplicados, totalEmDivida, dataEmissao, devedores }: DevedoresDocumentProps) {
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
            <Text style={styles.titleBarText}>LISTA DE DEVEDORES</Text>
            <Text style={styles.titleBarText}>{devedores.length} aluno(s) · {formatCurrency(totalEmDivida)}</Text>
          </View>
        </View>

        {filtrosAplicados.length > 0 ? (
          <View style={styles.filtrosBox}>
            {filtrosAplicados.map((f, i) => (
              <Text key={i} style={styles.filtroChip}>
                {f}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.table}>
          <TableHeader />
          {devedores.map((d, index) => (
            <View key={index} style={styles.tableRow} wrap={false}>
              <View style={[styles.cell, styles.cellAluno]}>
                <Text>{d.nome}</Text>
                <Text style={{ color: GRAY_LABEL, fontSize: 7 }}>{d.numeroEstudante}</Text>
              </View>
              <Text style={[styles.cell, styles.cellCurso]}>
                {d.curso} · {d.anoCurricular}º Ano
              </Text>
              <Text style={[styles.cell, styles.cellCategoria]}>{d.categoria}</Text>
              <Text style={[styles.cell, styles.cellValor]}>{formatCurrency(d.valorEmDivida)}</Text>
              <Text style={[styles.cell, styles.cellMeses]}>{d.mesesEmAtraso}</Text>
            </View>
          ))}
        </View>

        <View style={styles.rodape}>
          <Text style={styles.rodapeCampo}>Emitido em {dataEmissao}</Text>
        </View>
      </Page>
    </Document>
  );
}
