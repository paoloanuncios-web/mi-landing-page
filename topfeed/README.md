# ▲ TopFeed Pro

Extensión de Chrome que ordena y analiza los posts de **Instagram, TikTok, Facebook y YouTube** por vistas, likes,
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

1. Entrá a un perfil: `instagram.com/usuario` (o su pestaña Reels), `tiktok.com/@usuario`, una página de Facebook (pestaña Videos) o un canal de YouTube (Videos o Shorts). También sirve en búsquedas, Explorar y Guardados.
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
| Cuentas 👥 | Lista las cuentas que la red sugiere como similares y las que aparecen en búsquedas, con seguidores y vistas promedio. Ideal para encontrar competidores y referentes de un rubro. |
| YouTube | Videos y Shorts de canales y búsquedas. Completa solo likes, fecha exacta y vistas exactas de cada video. |
| Historial | Guarda snapshots por cuenta y muestra cuántas vistas sumó cada post desde la última vez. Ideal para seguir competencia. |
| Ideas IA ✨ | Claude analiza los 25 posts top y devuelve patrones ganadores, qué evitar, 10 ganchos, 3 guiones de reel y 5 ideas. Requiere clave de Anthropic. |
| Transcribir | Pasa el audio de un video a texto. Requiere clave de OpenAI (Claude no procesa audio). |

## TopFeed Pro vs Sort Feed

Comparado contra **Sort Feed 17.1** (versión real de la Chrome Web Store, instalada y probada lado a lado en octubre 2026).

| | Sort Feed 17.1 | TopFeed Pro |
|---|---|---|
| Instagram, TikTok, Facebook, YouTube | ✔ | ✔ |
| Ordenar por vistas, likes, outlier, antigüedad | ✔ | ✔ |
| Ordenar por comentarios, compartidos, guardados, engagement %, vistas por día, duración | parcial | ✔ |
| Filtro por fecha y "últimos N" | ✔ | ✔ |
| Filtro por tipo, texto, mínimo de vistas, ocultar fijados | ✘ | ✔ |
| YouTube: likes y fecha exacta por video | ✔ | ✔ (automático al terminar la auto-carga) |
| Exportar Excel / CSV / JSON / Sheets, con transcripciones | ✔ | ✔ |
| Descargar video y miniatura, en lote | ✔ | ✔ |
| Copiar link / texto / fila para planilla, ver perfil, reproductor | ✔ | ✔ |
| Transcripción | ✔ (Pro) | ✔ (con tu clave) |
| Recuerda el último orden | ✔ | ✔ |
| Panel de análisis (mejor día y horario, duración ideal, formatos, hashtags, ganchos) | ✘ | ✔ |
| Historial con crecimiento entre fechas | ✘ | ✔ |
| Ganchos y guiones con IA dentro del panel | ✘ (se conecta a Claude por MCP) | ✔ |
| Encontrar cuentas similares | ✔ (nuevo) | ✔ (pestaña Cuentas: sugeridas por la red y autores de búsquedas, con seguidores y vistas promedio) |
| Precio | Free con límites + Pro pago | Gratis (IA y transcripción se pagan por uso con tu clave) |
| Datos | Cuenta en sortfeed.com | Solo en tu navegador |

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
| Facebook en el sitio real | ✔ Pestaña Videos de una página: 18 videos con vistas, reacciones, títulos, duración, Excel y descarga (1,6 MB). Sin sesión, Facebook no muestra comentarios ni compartidos en esa pestaña |
| YouTube en el sitio real | ✔ Canal: 120 videos con auto-carga, likes y fechas exactas, Shorts, Excel |
| Instagram en el sitio real | ✔ Probado con sesión en una cuenta real: 107 posts con likes, comentarios, compartidos, fechas y seguidores desde la grilla, y 102 reels con vistas desde la pestaña Reels (outliers de hasta 25x) |
| Ideas IA y transcripción | ✔ Pedido y respuesta probados con las APIs simuladas. Falta una prueba con claves reales |

## Uso responsable

TopFeed solo lee lo que ya ves con tu sesión. No pide contraseñas ni publica nada. Respetá los términos de cada red
y los derechos de autor al descargar contenido de terceros.
