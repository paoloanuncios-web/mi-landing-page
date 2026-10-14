# Servidor local de prueba: sirve /public y simula POST /api/leads (no guarda nada).
param([int]$Port = 8787)
$root = Join-Path $PSScriptRoot '..\public' | Resolve-Path
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css'; '.js'='application/javascript'; '.jpg'='image/jpeg'; '.png'='image/png'; '.svg'='image/svg+xml' }
$l = New-Object Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Sirviendo $root en http://localhost:$Port/"
while ($l.IsListening) {
  $c = $l.GetContext(); $req = $c.Request; $res = $c.Response
  try {
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path -eq '/api/leads' -and $req.HttpMethod -eq 'POST') {
      $body = (New-Object IO.StreamReader($req.InputStream)).ReadToEnd()
      Write-Host "LEAD (simulado): $body"
      $bytes = [Text.Encoding]::UTF8.GetBytes('{"ok":true,"id":0,"whatsapp_url":"https://wa.me/5491150611200?text=prueba"}')
      $res.ContentType = 'application/json'
    } else {
      if ($path.EndsWith('/')) { $path += 'index.html' }
      $file = Join-Path $root ($path.TrimStart('/') -replace '/', '\')
      if (-not (Test-Path $file -PathType Leaf)) { $res.StatusCode = 404; $file = Join-Path $root '404.html' }
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file)
      if ($types.ContainsKey($ext)) { $res.ContentType = $types[$ext] }
    }
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch { $res.StatusCode = 500 } finally { $res.Close() }
}
