# Aprendizajes del proyecto TopFeed Pro

Lo que aprendimos al construir una extensión tipo Sort Feed (oct. 2026), para reutilizar en próximos programas.

---

## 1. Cómo trabajamos mejor juntos

| Aprendizaje | Qué hacer la próxima vez |
|---|---|
| El servidor de Claude no es tu computadora. Instagram y Facebook bloquean a los servidores y piden iniciar sesión. | Todo lo que dependa de **tu sesión** (Instagram, Facebook con cuenta, claves de IA) se prueba en **tu Chrome**. Claude prueba el resto. |
| Tus capturas de pantalla resolvieron cada bug de Instagram. Sin ellas eran adivinanzas. | Mandá captura del panel **siempre que algo no cargue**. Si el programa tiene un botón de diagnóstico, copiá y pegá su texto. |
| Un botón de **diagnóstico** visible ahorra muchas vueltas. | Todo programa que lea datos de terceros lleva un "📋 Copiar diagnóstico" desde el día 1. |
| Bajaste la rama `main` y la extensión estaba en otra rama. | Claude te manda **un `.zip` listo** para instalar, no un link al repositorio. |
| El `/goal` con condición "probado en real" generó mensajes repetidos que te molestaron. | Usar `/goal` solo con condiciones que Claude pueda cumplir solo. Si depende de pruebas tuyas, mejor sin `/goal`, o cortarlo con `/goal clear`. |
| Pediste que no te reclamara la captura una y otra vez. | Claude pide algo **una vez** y espera. |

---

## 2. Cómo leen datos estas extensiones (la idea central)

**Analogía:** la red social es un restaurante. La página que ves es el plato servido; los datos (vistas, likes) son la comanda que la cocina le pasa al mozo. La extensión no entra a la cocina ni pide platos nuevos: **lee la comanda** que ya viaja hacia tu pantalla.

- `src/inject.js` "escucha" las respuestas internas de la red (fetch y XHR) mientras navegás.
- `src/extract.js` reconoce los posts dentro de esas respuestas y los pasa a un formato único.
- Ventaja: no hace falta API oficial ni contraseña, y se ve exactamente lo mismo que ve el usuario.
- Riesgo: cuando la red cambia su código, hay que ajustar el lector. Por eso los tests usan **respuestas reales capturadas**.

---

## 3. Lo que aprendimos de cada red

### Instagram
- **La grilla del perfil no trae las vistas** de los reels; trae likes, comentarios, compartidos y fechas.
- **La pestaña Reels sí trae las vistas, pero sin fecha y sin cuenta.** El lector exigía fecha y por eso no reconocía los reels ("0 de 3"). Solución: reconocer el post con código + ID + algún dato, y asignarle la cuenta de la URL.
- El atajo `/api/v1/clips/user/` **ya no funciona desde la web** (devuelve una página HTML). Solución: abrir la pestaña Reels con la navegación propia de Instagram y recorrerla.
- Plan B: leer las vistas del **número que muestra cada miniatura**.
- Para tener todo junto (fecha + texto + vistas): cargar primero la grilla y después la pestaña Reels, en la misma sesión.

### TikTok
- Los datos vienen de `/api/post/item_list/` con `stats` y `statsV2` (este último trae números exactos).
- Para descargar videos, el servidor de TikTok exige el encabezado **Referer** de tiktok.com. Sin él da error 403. Se resuelve con una regla de red (`declarativeNetRequest`) solo para pedidos de la extensión.
- Desde servidores, TikTok bloquea la lista de videos de un perfil ("Hubo un problema"), pero Explorar y Búsqueda cargan.

### Facebook
- Sin sesión, la pestaña **Videos** de una página carga, con vistas y reacciones. Comentarios y compartidos no vienen.
- Facebook no repite el nombre de la página en cada video: se completa desde la URL.
- El título viene en `savable_title` y el link real en `canonical_uri_with_fallback`.

### YouTube
- Las listas traen vistas en texto ("249 k") y fechas relativas ("hace 2 sem."): se leen de la etiqueta completa ("hace 2 semanas").
- Likes y fecha exacta se piden **video por video** a la API interna `/youtubei/v1/player`, igual que hace Sort Feed.
- Shorts: algunos canales no mandan continuación sin sesión (se quedan en 41).

---

## 4. Lo que aprendimos de Sort Feed (la competencia)

- La ficha de la tienda estaba desactualizada: la versión real (17.1) ya cubría **Instagram, TikTok, Facebook y YouTube**.
- Instalarlo y leer su interfaz y su código dio la lista real de funciones: outlier, filtros por fecha, "últimos N", exportar con transcripciones, miniaturas, reproductor, recordar el último orden, cuentas similares, conexión con Claude por MCP.
- Tiene la **misma limitación** que encontramos en Instagram: su orden por outlier solo funciona en la pestaña Reels.
- Su modelo: gratis con límites + Pro pago + cuenta en sortfeed.com. TopFeed: gratis, datos solo en el navegador; la IA se paga por uso con tu clave.

**Lección:** antes de copiar un producto, **instalarlo y mirarlo por dentro**. La ficha de la tienda no alcanza.

---

## 5. Métricas que conviene mostrar siempre

- **Outlier** = vistas del post ÷ mediana de la cuenta. "3x" significa que rindió el triple de lo normal. Es la métrica que más sirve para detectar qué copiar.
- **Engagement por vistas** = (likes + comentarios + compartidos + guardados) ÷ vistas.
- **Engagement por seguidores** = (likes + comentarios) ÷ seguidores.
- Si no hay likes (como en las listas de YouTube), mostrar **"sin dato"**, nunca 0%.
- Las fechas aproximadas llevan "≈" y no se usan para "mejor día y horario".

---

## 6. Cómo probar antes de entregar

1. **Tests con datos reales capturados** (`npm test`): si la red cambia, el test avisa.
2. **Prueba simulada completa** (`npm run e2e`): la extensión real en un navegador, sobre páginas armadas igual que cada red.
3. **Prueba en el sitio real**: TikTok, Facebook y YouTube desde el servidor; Instagram y la IA desde tu Chrome.
4. Revisar las capturas de pantalla, no solo los números: así aparecieron detalles visuales y el "0,00%" falso.

---

## 7. Checklist para el próximo programa

- [ ] Instalar y revisar la competencia real, no solo su ficha.
- [ ] Definir qué se prueba en el servidor y qué en tu computadora.
- [ ] Incluir botón de diagnóstico desde el inicio.
- [ ] Entregar un `.zip` listo para instalar, con pasos numerados.
- [ ] Guardar respuestas reales de cada plataforma como tests.
- [ ] Mostrar "sin dato" en vez de 0 cuando falta información.
- [ ] Pedir capturas una sola vez y esperar.

---

## 8. Pendiente de TopFeed Pro

- Probar **✨ Ideas IA** y **Transcribir** con tus claves reales (se cargan en Opciones).
- Comparar resultados lado a lado con Sort Feed en tu Chrome, sobre el mismo perfil.
