# Cómo actualizar el Top 10

La página lee la lista de canciones desde `tracks.json` y los audios desde la carpeta `previews/`.
Cada vez que cambias esos archivos en GitHub, Vercel publica la página actualizada sola (1–2 minutos).

## 1. Prepara las canciones en tu PC

1. Abre `herramientas/preparar_top10.pyw` con doble clic.
2. Elige tu marca de voz (solo la primera vez; el programa la recuerda).
3. **Agregar:** "Agregar canciones…" y elige los m4a originales (sin marca).
   **Quitar:** selecciónala y "Quitar seleccionada".
   **Ordenar:** "Subir" / "Bajar". El orden de la lista es el puesto en el Top (máximo 10).
4. Presiona **Procesar**. Se crea una carpeta con:
   - `previews/` — las canciones con marca de agua y cifradas
   - `tracks.json` — la lista (título, artista, tipo, BPM, duración)
   - `escuchar/` — copia escuchable solo para ti. **No la subas.**

> Procesa siempre el Top completo (también las canciones que se quedan), así la lista y los audios coinciden.

El programa lee los datos del nombre del archivo, por ejemplo:
`92 Te Busco (Cosculluela, Nicky Jam).Splice2026 [Gustavo 2026].m4a`
→ BPM 92 · Te Busco · Cosculluela, Nicky Jam · Splice. El editor entre corchetes no se muestra en la página.

## 2. Súbelo a GitHub (desde el navegador)

1. Entra a https://github.com/owgichri/membresiamusicperu
2. Abre la carpeta `previews`, selecciona los archivos viejos que ya no van y bórralos (botón ⋯ › Delete file),
   o simplemente sube los nuevos encima (mismo nombre = se reemplaza).
3. En la página principal del repositorio: **Add file › Upload files**.
4. Arrastra la carpeta `previews` y el archivo `tracks.json` que generó el programa.
5. Abajo escribe un mensaje (ej. "Top 10 noviembre") y presiona **Commit changes**.
6. Espera 1–2 minutos y recarga tu página.

## Cambiar flyers o precios

Las imágenes están en `assets/img/` (por ejemplo `premium.jpg`, `exclusiva.jpg`, `promo.jpg`).
Para cambiar el flyer del mes, sube una imagen nueva **con el mismo nombre** y se reemplaza.
Para textos y precios, pídeselo a Claude o edita `index.html` / `js/app.js`.

## Pixeles de publicidad

`js/consent-pixels.js` tiene el Meta Pixel (515479114089100). Para TikTok, pega tu ID en `TIKTOK_PIXEL_ID`.
Los pixeles solo se activan si el visitante acepta las cookies de publicidad.

## Requisitos del programa (una sola vez)

1. Python 3 desde python.org (marca "Add Python to PATH").
2. ffmpeg: en una terminal `winget install ffmpeg` y reinicia el PC.
3. En una terminal: `pip install cryptography`.
