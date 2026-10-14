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
Permite filtrar por estado, buscar, cambiar estado, agregar notas, escribir por WhatsApp y exportar a CSV.

## Medición
Completá los IDs en `window.PAO_TRACKING` dentro de `public/index.html` (Pixel de Meta, GA4, Google Ads).
Al enviar el formulario se dispara el evento `Lead` / `generate_lead`.
