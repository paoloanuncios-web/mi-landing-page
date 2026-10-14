# Servidor local de prueba: sirve /public y simula la API (no guarda nada).
#   POST /api/leads        → respuesta simulada
#   GET  /api/admin/leads  → datos de ejemplo de .claude/demo-leads.json
param([int]$Port = 8787)
$root = Join-Path $PSScriptRoot '..\public' | Resolve-Path
$demo = Join-Path $PSScriptRoot 'demo-leads.json'
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.jpg'='image/jpeg'; '.png'='image/png'; '.svg'='image/svg+xml'; '.json'='application/json; charset=utf-8' }
$l = New-Object Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Sirviendo $root en http://localhost:$Port/"
function Json($text) { return [Text.Encoding]::UTF8.GetBytes($text) }
while ($l.IsListening) {
  $c = $l.GetContext(); $req = $c.Request; $res = $c.Response
  try {
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path.StartsWith('/api/')) {
      $res.ContentType = 'application/json; charset=utf-8'
      $body = (New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)).ReadToEnd()
      if ($body) { Write-Host "$($req.HttpMethod) $path $body" }
      if ($path -eq '/api/leads') { $bytes = Json '{"ok":true,"id":0,"whatsapp_url":"https://wa.me/5491150611200?text=prueba"}' }
      elseif ($path -eq '/api/admin/leads') { $bytes = [IO.File]::ReadAllBytes($demo) }
      elseif ($path -match '/events$' -and $req.HttpMethod -eq 'GET') { $bytes = Json '{"ok":true,"events":[{"id":1,"type":"creado","detail":"Lead creado desde la web (ejemplo)","created_at":"2026-10-14 12:00:00"}]}' }
      else { $bytes = Json '{"ok":true}' }
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
