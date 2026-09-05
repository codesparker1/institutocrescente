import { Document, Page, View, Text, Image as PdfImage, StyleSheet } from "@react-pdf/renderer";

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

  diaBar: { backgroundColor: "#eef0f8", paddingVertical: 5, paddingHorizontal: 8, marginTop: 10, marginBottom: 2 },
  diaTexto: { fontSize: 9, fontWeight: 700, color: NAVY },

  table: { borderLeftWidth: 1, borderLeftColor: GRAY_BORDER },
  tableHeaderRow: { flexDirection: "row", backgroundColor: NAVY },
  tableRow: { flexDirection: "row" },
  cellHora: { width: "12%" },
  cellAluno: { width: "32%" },
  cellCurso: { width: "28%" },
  cellSala: { width: "12%", textAlign: "center" },
  cellOrientador: { width: "16%" },
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

export interface DefesaLinha {
  /** Dia já formatado — agrupa as linhas; o cabeçalho de dia repete-se por grupo. */
  dia: string;
  hora: string;
  nome: string;
  numeroEstudante: string;
  curso: string;
  sala: string;
  orientador: string;
}

export interface DefesasDocumentProps {
  instituicaoNome: string;
  logoSrc: string;
  filtrosAplicados: string[];
  dataEmissao: string;
  defesas: DefesaLinha[];
}

function TableHeader() {
  return (
    <View style={styles.tableHeaderRow} fixed>
      <Text style={[styles.headerCell, styles.cellHora]}>Hora</Text>
      <Text style={[styles.headerCell, styles.cellAluno]}>Aluno</Text>
      <Text style={[styles.headerCell, styles.cellCurso]}>Curso</Text>
      <Text style={[styles.headerCell, styles.cellSala]}>Sala</Text>
      <Text style={[styles.headerCell, styles.cellOrientador]}>Orientador</Text>
    </View>
  );
}

/**
 * Pauta de defesas (§pedido do cliente 2026-09-05): quem defende, quando e onde. Só entram os
 * finalistas com data marcada — é uma convocatória, e uma linha sem data não convoca ninguém.
 *
 * Agrupada por dia porque é assim que se usa: afixa-se a folha e procura-se o dia, não o aluno.
 */
export function DefesasDocument({ instituicaoNome, logoSrc, filtrosAplicados, dataEmissao, defesas }: DefesasDocumentProps) {
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
              <Text style={styles.institutionSubtitle}>Direcção Académica | Defesas de Monografia</Text>
            </View>
          </View>
          <View style={styles.headerDivider} />

          <View style={styles.titleBar}>
            <Text style={styles.titleBarText}>PAUTA DE DEFESAS</Text>
            <Text style={styles.titleBarText}>{defesas.length} defesa(s)</Text>
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

        {defesas.map((d, index) => (
          <View key={index} wrap={false}>
            {/* Cabeçalho de dia só quando o dia muda — a lista chega já ordenada por data e hora. */}
            {index === 0 || defesas[index - 1].dia !== d.dia ? (
              <View style={styles.diaBar}>
                <Text style={styles.diaTexto}>{d.dia}</Text>
              </View>
            ) : null}
            {index === 0 || defesas[index - 1].dia !== d.dia ? <TableHeader /> : null}
            <View style={[styles.table, styles.tableRow]}>
              <Text style={[styles.cell, styles.cellHora]}>{d.hora}</Text>
              <View style={[styles.cell, styles.cellAluno]}>
                <Text>{d.nome}</Text>
                <Text style={{ color: GRAY_LABEL, fontSize: 7 }}>{d.numeroEstudante}</Text>
              </View>
              <Text style={[styles.cell, styles.cellCurso]}>{d.curso}</Text>
              <Text style={[styles.cell, styles.cellSala]}>{d.sala}</Text>
              <Text style={[styles.cell, styles.cellOrientador]}>{d.orientador}</Text>
            </View>
          </View>
        ))}

        <View style={styles.rodape}>
          <Text style={styles.rodapeCampo}>Emitido em {dataEmissao}</Text>
        </View>
      </Page>
    </Document>
  );
}
