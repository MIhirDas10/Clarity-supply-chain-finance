[xml]$xml = Get-Content "f:\clarity\mergedCode_M1\docs\req_extracted\word\document.xml" -Raw
$nsMgr = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
$nsMgr.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
$paragraphs = $xml.SelectNodes('//w:p', $nsMgr)
$lines = @()
foreach ($p in $paragraphs) {
    $texts = $p.SelectNodes('.//w:t', $nsMgr)
    $line = ($texts | ForEach-Object { $_.'#text' }) -join ''
    if ($line.Trim()) { $lines += $line }
}
$lines -join "`n" | Out-File "f:\clarity\mergedCode_M1\docs\requirements_text.txt" -Encoding UTF8
