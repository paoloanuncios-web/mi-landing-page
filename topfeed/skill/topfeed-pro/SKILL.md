---
name: topfeed-pro
description: Analiza cuentas de Instagram, TikTok, Facebook y YouTube con la extensión de Chrome TopFeed Pro (ordenar posts por vistas, likes, comentarios, compartidos, engagement y outliers). Usar cuando el usuario pida analizar una cuenta o perfil de redes, encontrar los posts o reels que mejor funcionaron, detectar virales u outliers, comparar competidores, sacar ganchos o ideas de contenido a partir de una cuenta, o cuando mencione TopFeed. También sirve cuando el usuario pega o sube una tabla exportada por TopFeed.
---

# TopFeed Pro

TopFeed Pro es una extensión de Chrome instalada en el navegador del usuario. Lee los datos que la red social ya muestra con la sesión del usuario y los ordena. No tiene API: se usa desde el navegador.

## Cómo conseguir los datos

Elegí el primer camino disponible:

1. **Claude in Chrome activo** (herramientas `mcp__claude-in-chrome__*`): manejá el Chrome del usuario siguiendo "Pasos en el navegador".
2. **El usuario pegó o subió datos de TopFeed** (CSV, Excel, JSON o tabla copiada): analizalos directo.
3. **Ninguno de los dos**: pedile al usuario, una sola vez, que en TopFeed toque **⬇ Exportar → Excel** (o "Copiar tabla al portapapeles") y te lo pase.

## Pasos en el navegador

1. Abrí el perfil en una pestaña nueva:
   - Instagram: `https://www.instagram.com/USUARIO/`
   - TikTok: `https://www.tiktok.com/@USUARIO`
   - Facebook: `https://www.facebook.com/PAGINA/videos`
   - YouTube: `https://www.youtube.com/@CANAL/videos` (o `/shorts`)
2. Tocá el botón flotante **▲ TopFeed** (abajo a la derecha).
3. En el selector de cantidad elegí **100 posts** (o **Todos**) y tocá **⚡ Auto-cargar**. Esperá a que el botón vuelva a decir "Auto-cargar". Puede tardar 1-3 minutos.
   - En Instagram, al terminar pasa sola a la pestaña **Reels** para traer las vistas. Esperá a que aparezca la línea 🔎 "Vistas cargadas…".
   - En YouTube completa sola likes y fechas exactas ("📈 Completando…").
4. Abrí la pestaña **☰ Tabla** y leé las filas. Para métricas generales, la pestaña **📊 Análisis**.
5. Si necesitás todos los datos en texto: **⬇ Exportar → Copiar tabla al portapapeles**.

Si el panel dice "Todavía no hay posts", tocá **📋 Copiar diagnóstico** y mostrale el texto al usuario. No inventes datos.

## Qué significa cada métrica

- **Outlier**: vistas del post ÷ mediana de vistas de la cuenta (si no hay vistas, usa likes). 🔥 = 2x o más. Es la métrica principal para saber qué funcionó.
- **ER %**: (likes + comentarios + compartidos + guardados) ÷ vistas.
- **ER seg. %**: (likes + comentarios) ÷ seguidores.
- **Vistas/día**: vistas ÷ días desde que se publicó.
- **—**: la red no mandó ese dato. No lo trates como cero.
- **≈** delante de la fecha: fecha aproximada (YouTube). No sirve para analizar horarios.

## Limitaciones a tener en cuenta

- Instagram no manda vistas en la grilla del perfil: vienen de la pestaña Reels.
- Los reels que solo vienen de la pestaña Reels pueden llegar sin fecha ni texto.
- Facebook sin sesión no muestra comentarios ni compartidos en la pestaña Videos.
- YouTube no da comentarios en las listas.

## Cómo entregar el análisis

El usuario es Paolo Reinoso, social media y trafficker en Argentina. Escribí en español rioplatense, frases cortas, al grano, con números concretos antes que adjetivos. Si te pide una decisión, dale una sola recomendación.

Estructura por defecto:

1. **Resumen**: cantidad de posts analizados, vistas promedio y mediana, engagement promedio, frecuencia de publicación.
2. **Top 5 por outlier**: para cada uno, link, outlier, vistas, likes, comentarios y la primera línea del texto (el gancho).
3. **Qué tienen en común**: tema, formato (reel/carrusel/foto), duración, tipo de gancho, día y horario. Solo con lo que muestran los datos.
4. **Qué evitar**: patrones de los 5 peores.
5. **Para el cliente**: 5 ideas de reels con gancho de 0 a 3 segundos, basadas en lo que funcionó.

Si compara varias cuentas, armá una tabla con seguidores, vistas medianas, engagement y mejor formato de cada una.
