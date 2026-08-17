import { Document, Page, View, Text, Image as PdfImage, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/utils";

const NAVY = "#1b1b5c";
const GRAY_LABEL = "#6b7280";
const GRAY_BORDER = "#d1d5db";

// Acima disto o recibo cabe confortavelmente à escala normal (1). A partir daí a fonte e os
// espaçamentos encolhem gradualmente — um lote com muitos meses/emolumentos não pode empurrar a
// segunda via para uma segunda folha, isso partia a ideia de "cortar ao meio" em duas vias.
const ITENS_SEM_REDUCAO = 6;
const ESCALA_MINIMA = 0.55;

function calcularEscala(numItens: number): number {
  if (numItens <= ITENS_SEM_REDUCAO) return 1;
  return Math.max(ESCALA_MINIMA, ITENS_SEM_REDUCAO / numItens);
}

function criarEstilos(escala: number) {
  const e = (valor: number, minimo = 0) => Math.max(minimo, valor * escala);

  return StyleSheet.create({
    page: { padding: e(28, 16), fontSize: e(9, 6), fontFamily: "Helvetica", color: "#111111" },

    via: { flex: 1, display: "flex", flexDirection: "column" },
    corte: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: e(10, 4),
      borderBottomWidth: 1,
      borderBottomColor: GRAY_BORDER,
      borderStyle: "dashed",
    },
    corteTexto: { fontSize: e(7, 5), color: GRAY_LABEL, textAlign: "center", width: "100%", marginBottom: e(4, 1) },

    header: { position: "relative", minHeight: e(64, 34), marginBottom: e(10, 4), paddingTop: e(4, 1), paddingBottom: e(4, 1) },
    logoBox: { position: "absolute", top: 0, left: -8, width: e(60, 32), height: e(60, 32), alignItems: "center", justifyContent: "center" },
    logo: { width: e(56, 30), height: e(56, 30), objectFit: "contain" },
    headerInfo: { alignItems: "center", justifyContent: "center", minHeight: e(60, 32) },
    institutionName: { fontSize: e(12, 8), fontWeight: 700, color: NAVY, textAlign: "center", textTransform: "uppercase" },
    institutionSubtitle: { fontSize: e(8, 5.5), color: GRAY_LABEL, textAlign: "center", marginTop: e(2, 1) },
    headerDivider: { borderBottomWidth: 1, borderBottomColor: NAVY, marginBottom: e(10, 4) },

    titleBar: {
      backgroundColor: NAVY,
      paddingVertical: e(6, 3),
      marginBottom: e(10, 4),
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: e(10, 5),
    },
    titleBarText: { color: "#ffffff", fontSize: e(10, 7), fontWeight: 700, letterSpacing: 0.5 },

    metaGrid: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: GRAY_BORDER, marginBottom: e(10, 4) },
    metaItem: { width: "50%", borderRightWidth: 1, borderBottomWidth: 1, borderColor: GRAY_BORDER, padding: e(6, 2) },
    metaLabel: { fontSize: e(6.5, 5), color: GRAY_LABEL, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: e(2, 0.5) },
    metaValue: { fontSize: e(9, 6), fontWeight: 700, color: "#111111" },

    table: { borderLeftWidth: 1, borderLeftColor: GRAY_BORDER, marginBottom: e(8, 3) },
    tableHeaderRow: { flexDirection: "row", backgroundColor: NAVY },
    tableRow: { flexDirection: "row" },
    cellDescricao: { width: "75%" },
    cellValor: { width: "25%", textAlign: "right" },
    headerCell: { padding: e(5, 1.5), fontSize: e(7, 5), fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: 0.3 },
    cell: {
      paddingHorizontal: e(5, 2),
      paddingVertical: e(5, 1.5),
      fontSize: e(8, 5.5),
      borderBottomWidth: 1,
      borderBottomColor: GRAY_BORDER,
      borderRightWidth: 1,
      borderRightColor: GRAY_BORDER,
    },

    totalRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: e(10, 3) },
    totalLabel: { fontSize: e(9, 6), fontWeight: 700, color: NAVY, marginRight: e(8, 3) },
    totalValue: { fontSize: e(11, 7), fontWeight: 700, color: NAVY },

    rodape: { flexDirection: "row", justifyContent: "space-between", marginTop: e(4, 1) },
    rodapeCampo: { fontSize: e(7.5, 5), color: GRAY_LABEL },
    assinatura: {
      marginTop: e(16, 5),
      borderTopWidth: 1,
      borderTopColor: GRAY_BORDER,
      paddingTop: e(3, 1),
      fontSize: e(7, 5),
      color: GRAY_LABEL,
      width: "45%",
      textAlign: "center",
    },
  });
}

export interface ReciboItem {
  descricao: string;
  valor: number;
}

export interface ReciboPagamentoDocumentProps {
  instituicaoNome: string;
  logoSrc: string;
  alunoNome: string;
  numeroEstudante: string;
  curso: string;
  anoCurricular: number;
  itens: ReciboItem[];
  total: number;
  dataEmissao: string;
  registadoPorNome: string;
}

function ReciboVia({
  via,
  styles,
  ...props
}: ReciboPagamentoDocumentProps & { via: string; styles: ReturnType<typeof criarEstilos> }) {
  const { instituicaoNome, logoSrc, alunoNome, numeroEstudante, curso, anoCurricular, itens, total, dataEmissao, registadoPorNome } = props;

  return (
    <View style={styles.via}>
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
        <Text style={styles.titleBarText}>RECIBO DE PAGAMENTO</Text>
        <Text style={styles.titleBarText}>{via}</Text>
      </View>

      <View style={styles.metaGrid}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Aluno</Text>
          <Text style={styles.metaValue}>{alunoNome}</Text>
        </View>
        <View style={[styles.metaItem, { borderRightWidth: 0 }]}>
          <Text style={styles.metaLabel}>Nº Estudante</Text>
          <Text style={styles.metaValue}>{numeroEstudante}</Text>
        </View>
        <View style={[styles.metaItem, { borderBottomWidth: 0 }]}>
          <Text style={styles.metaLabel}>Curso</Text>
          <Text style={styles.metaValue}>{curso}</Text>
        </View>
        <View style={[styles.metaItem, { borderRightWidth: 0, borderBottomWidth: 0 }]}>
          <Text style={styles.metaLabel}>Ano</Text>
          <Text style={styles.metaValue}>{anoCurricular}º Ano</Text>
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeaderRow} fixed>
          <Text style={[styles.headerCell, styles.cellDescricao]}>Descrição</Text>
          <Text style={[styles.headerCell, styles.cellValor]}>Valor</Text>
        </View>
        {itens.map((item, index) => (
          <View key={index} style={styles.tableRow}>
            <Text style={[styles.cell, styles.cellDescricao]}>{item.descricao}</Text>
            <Text style={[styles.cell, styles.cellValor]}>{formatCurrency(item.valor)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL</Text>
        <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
      </View>

      <View style={styles.rodape}>
        <Text style={styles.rodapeCampo}>Emitido em {dataEmissao}</Text>
        <Text style={styles.rodapeCampo}>Registado por: {registadoPorNome}</Text>
      </View>

      <Text style={styles.assinatura}>Assinatura da Secretaria</Text>
    </View>
  );
}

export function ReciboPagamentoDocument(props: ReciboPagamentoDocumentProps) {
  const styles = criarEstilos(calcularEscala(props.itens.length));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <ReciboVia via="Via do Estudante" styles={styles} {...props} />
        <View style={styles.corte}>
          <Text style={styles.corteTexto}>✂ - - - - - - - - - - - - - - - - - corte aqui - - - - - - - - - - - - - - - - - ✂</Text>
        </View>
        <ReciboVia via="Via da Secretaria" styles={styles} {...props} />
      </Page>
    </Document>
  );
}
