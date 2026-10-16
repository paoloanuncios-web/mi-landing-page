# ▲ TopFeed Pro

Extensión de Chrome que ordena y analiza los posts de **Instagram, TikTok y Facebook** por vistas, likes,
comentarios, compartidos, guardados y engagement. Detecta los posts virales (outliers), muestra cuándo y qué
publicar, exporta a Excel/CSV/Google Sheets y genera ganchos y guiones con IA.

## Instalación (2 minutos)

1. Descargá esta carpeta `topfeed` (o el `.zip` de `npm run zip` y descomprimilo).
2. En Chrome abrí `chrome://extensions`.
3. Activá **Modo de desarrollador** (arriba a la derecha).
4. Tocá **Cargar descomprimida** y elegí la carpeta `topfeed`.
5. Fijá el ícono ▲ en la barra de Chrome.

Funciona en Chrome, Edge, Brave y Opera (Chromium 111 o más nuevo).

## Cómo se usa

1. Entrá a un perfil: `instagram.com/usuario` (o su pestaña Reels), `tiktok.com/@usuario`, o una página de Facebook (pestaña Reels/Videos).
2. Tocá el botón **▲ TopFeed** (abajo a la derecha).
3. Elegí cuántos posts y tocá **⚡ Auto-cargar**. La extensión baja sola por el perfil y lee las métricas.
4. Ordená, filtrá y exportá. Tocá **💾 Guardar** para comparar el crecimiento la próxima vez.

## Qué hace

| Función | Detalle |
|---|---|
| Ordenar | Vistas, likes/reacciones, comentarios, compartidos, guardados, interacciones, ER % por vistas, ER % por seguidores, outlier, vistas por día, crecimiento, fecha, duración. Mayor→menor o al revés. |
| Filtrar | Cuenta, tipo (reel, video, foto, carrusel, texto), rango de fechas, últimos N, mínimo de vistas, texto, ocultar fijados. |
| Outliers 🔥 | Cada post muestra cuántas veces supera la mediana de la cuenta (ej. 3,2x). Así ves qué se viralizó de verdad. |
| Vistas | Grilla con miniaturas y tabla con columnas ordenables. |
| Análisis | KPIs, rendimiento en el tiempo, mejor día y horario, duración ideal, comparación por formato, hashtags que rinden y ganchos ganadores. |
| Exportar | Excel (.xls), CSV, JSON, Google Sheets (copia y abre una hoja nueva), copiar tabla o links. 24 columnas. |
| Descargar | Video o imagen de un post o de todos los seleccionados, a la carpeta `Descargas/TopFeed`. |
| Historial | Guarda snapshots por cuenta y muestra cuántas vistas sumó cada post desde la última vez. Ideal para seguir competencia. |
| Ideas IA ✨ | Claude analiza los 25 posts top y devuelve patrones ganadores, qué evitar, 10 ganchos, 3 guiones de reel y 5 ideas. Requiere clave de Anthropic. |
| Transcribir | Pasa el audio de un video a texto. Requiere clave de OpenAI (Claude no procesa audio). |

## TopFeed Pro vs Sort Feed

| | Sort Feed | TopFeed Pro |
|---|---|---|
| Instagram y TikTok | ✔ | ✔ |
| Facebook | ✘ | ✔ |
| Ordenar por vistas / likes / compartidos / fecha | ✔ | ✔ |
| Ordenar por comentarios, guardados, engagement, outlier, vistas por día | parcial | ✔ |
| Exportar Excel / CSV / JSON / Sheets | ✔ | ✔ |
| Descargar videos | ✔ | ✔ (individual y en lote) |
| Transcripción | ✔ | ✔ (con tu clave) |
| Detección de outliers | ✘ | ✔ |
| Panel de análisis (horarios, duración, formatos, hashtags, ganchos) | ✘ | ✔ |
| Historial y crecimiento entre fechas | ✘ | ✔ |
| Ganchos y guiones con IA | ✘ | ✔ |
| Sin cuentas, sin servidores propios, datos solo en tu navegador | — | ✔ |

## Cómo funciona por dentro

- `src/inject.js` copia las respuestas de la API interna que la propia web usa para dibujar el feed (no hace pedidos extra).
- `src/extract.js` reconoce los posts de cada red y los normaliza a un formato único. También lee los datos que vienen incrustados en la página.
- `src/analytics.js` calcula métricas, agrupaciones y exportaciones.
- `src/content.js` dibuja el panel (Shadow DOM, no rompe el diseño de la red) y hace la auto-carga.
- `src/background.js` gestiona descargas, transcripción e IA.

Las redes cambian su código seguido. Si una red deja de mostrar datos, el arreglo suele estar en `src/extract.js`.

## Tests

```bash
npm test                                  # extractor + análisis (incluye una respuesta real de TikTok)
NODE_PATH=$(npm root -g) npm run e2e      # extensión real en Chromium sobre páginas simuladas (requiere Playwright)
```

Qué está verificado:

| | Estado |
|---|---|
| TikTok en el sitio real | ✔ Auto-carga de 100 posts, métricas, orden, Excel y descarga de video (5 MB) probados en tiktok.com |
| Instagram y Facebook | ✔ Probados con páginas simuladas con el formato de sus APIs. En el sitio real hay que probarlo con sesión iniciada |
| Ideas IA y transcripción | ✔ Pedido y respuesta probados con las APIs simuladas. Falta una prueba con claves reales |

## Uso responsable

TopFeed solo lee lo que ya ves con tu sesión. No pide contraseñas ni publica nada. Respetá los términos de cada red
y los derechos de autor al descargar contenido de terceros.
