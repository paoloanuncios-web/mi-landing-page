# PAO Marketing Digital — Landing de tráfico pago + CRM

Landing de conversión para captar leads de tráfico pago, con un mini CRM integrado.
Se publica sola en Cloudflare Workers cada vez que hay cambios en la rama `main`:
https://mi-landing-page.paolo-anuncios.workers.dev/

## Cómo funciona
- `public/` — la landing (HTML, CSS, JS) y el panel `/admin`.
- `src/index.js` — el Worker: guarda los leads en la base D1 (`POST /api/leads`), arma el link de WhatsApp y protege el panel.
- `wrangler.jsonc` — configuración: número de WhatsApp, usuario del panel y base de datos.

## Flujo del lead
1. Cualquier botón de WhatsApp abre un popup de 3 pasos (negocio y objetivo → situación e inversión → nombre, WhatsApp y email).
2. El lead se guarda en el CRM con el origen del tráfico (UTM, gclid, fbclid).
3. Se abre WhatsApp con un mensaje ya escrito con las respuestas.

## Panel CRM
`/admin` — usuario y contraseña en el archivo local `ACCESO-CRM-PRIVADO.txt` (no se sube a GitHub).

- **Etapas:** Nuevo → Contactado → Call agendada → Call realizada → Propuesta enviada → Seguimiento → Cliente ganado, más Perdido y No califica.
- **Calificación automática según los planes** (Inicial $250.000 · Pyme $450.000 · Empresa $750.000):
  - **A:** invierte más de $400.000 y quiere arrancar ya o en semanas → atender en menos de 1 hora.
  - **B:** invierte entre $200.000 y $400.000 y quiere arrancar, o más de $400.000 pero sin apuro.
  - **C:** menos de $200.000, sin presupuesto definido o sin apuro.
- **Vistas:** tablero Kanban (arrastrar entre etapas), lista ordenable y métricas.
- **Ficha de cada lead:** calificación, plan y valor, próximo seguimiento, fecha de la call, motivo de pérdida, notas, historial y mensajes de WhatsApp por etapa.
- **Prioridades de hoy:** leads A sin contactar, seguimientos vencidos, calls del día y leads nuevos.

## Prueba local
`.claude/serve.ps1` sirve la página en http://localhost:8787 y simula la API con datos de ejemplo (`.claude/demo-leads.json`).

## Medición
Completá los IDs en `window.PAO_TRACKING` dentro de `public/index.html` (Pixel de Meta, GA4, Google Ads).
Al enviar el formulario se dispara el evento `Lead` / `generate_lead`.

## TopFeed Pro (extensión de Chrome)

En la carpeta [`topfeed/`](topfeed/) está la extensión para ordenar y analizar posts de Instagram, TikTok y Facebook
(vistas, likes, engagement, outliers, exportación e ideas con IA). Instrucciones en [`topfeed/README.md`](topfeed/README.md).
