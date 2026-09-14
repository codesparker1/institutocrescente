<#
.SYNOPSIS
  Converte docs/manual/Manual-ISPC.docx em PDF, usando o Word instalado na máquina.

.DESCRIPTION
  Pelo próprio Word, e não por uma biblioteca: é o Word que pagina o ficheiro, por isso é ele que
  produz o PDF fiel ao que a faculdade vê ao abrir o .docx. Qualquer conversor externo (LibreOffice,
  docx-pdf) repagina por conta própria e as quebras deixam de bater certo com o original.

  Faz duas coisas que um "guardar como PDF" à mão não faz:
    - actualiza o índice antes de exportar (um TableOfContents recém-criado nasce vazio, e sem isto
      o PDF sairia com um índice em branco);
    - cria os marcadores de navegação do PDF a partir dos estilos de título, o painel lateral que
      deixa saltar de capítulo em capítulo.

  Requer o Microsoft Word. Sem ele, abra o .docx e use Ficheiro > Exportar > Criar PDF.

.EXAMPLE
  pwsh scripts/manual/docx-para-pdf.ps1
#>
[CmdletBinding()]
param(
  [string]$Docx = "docs/manual/Manual-ISPC.docx",
  [string]$Pdf = "docs/manual/Manual-ISPC.pdf"
)

$ErrorActionPreference = "Stop"

$docxPath = (Resolve-Path $Docx).Path
$pdfPath = Join-Path (Split-Path -Parent $docxPath) (Split-Path -Leaf $Pdf)

Write-Output "Word: a abrir $docxPath"

$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0

  # ReadOnly: a conversão nunca deve poder alterar o ficheiro de origem.
  $doc = $word.Documents.Open($docxPath, $false, $true)

  # O índice nasce vazio — é um campo, e só ganha conteúdo quando é calculado.
  $doc.Fields.Update() | Out-Null
  if ($doc.TablesOfContents.Count -gt 0) {
    for ($i = 1; $i -le $doc.TablesOfContents.Count; $i++) {
      $doc.TablesOfContents.Item($i).Update()
    }
    Write-Output "indice actualizado"
  }
  # Repaginar antes de exportar, para os numeros de pagina do indice baterem certo.
  $doc.Repaginate()

  # 17 = wdExportFormatPDF. O 1 no fim (CreateBookmarks) = marcadores a partir dos titulos.
  $doc.ExportAsFixedFormat($pdfPath, 17, $false, 0, 0, 0, 0, 0, $true, $true, 1)

  Write-Output "PDF: $pdfPath"
  $tamanho = (Get-Item $pdfPath).Length / 1MB
  Write-Output ("tamanho: {0:N1} MB" -f $tamanho)

  # Contagem de paginas so para informacao. O Word costuma largar a ligacao COM logo a seguir a
  # exportar um documento grande (RPC_E_DISCONNECTED), e perder o exit code por causa de uma linha
  # de log seria dizer que a conversao falhou quando o PDF ja esta escrito no disco.
  try {
    Write-Output ("paginas: {0}" -f $doc.ComputeStatistics(2))
  }
  catch {
    Write-Output "paginas: (o Word largou a ligacao antes de responder -- o PDF esta feito)"
  }
}
finally {
  # Sem isto fica um WINWORD.EXE invisivel agarrado ao ficheiro, e a proxima conversao falha a abrir
  # o mesmo documento. Cada passo em try/catch proprio: se o Word ja largou a ligacao, fechar falha
  # -- mas a limpeza seguinte tem de acontecer na mesma, senao e o processo orfao que fica.
  foreach ($passo in @(
      { if ($doc) { $doc.Close(0) | Out-Null } },
      { if ($word) { $word.Quit() | Out-Null } },
      { if ($doc) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null } },
      { if ($word) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null } }
    )) {
    try { & $passo } catch { }
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()

  # Rede de seguranca: um WINWORD.EXE sem janela que tenha sobrado de uma conversao falhada bloqueia
  # a proxima. So os invisiveis -- nunca um Word que o utilizador tenha aberto.
  Get-Process WINWORD -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -eq 0 } |
    Stop-Process -Force -ErrorAction SilentlyContinue
}
