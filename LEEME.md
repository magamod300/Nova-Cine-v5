# NovaCine v5.4.1 — bundle listo para GitHub

## 3 pasos para tener el `.exe` corriendo

### 1. Repo en GitHub
- Ve a [github.com/new](https://github.com/new)
- Nombre: **`Nova-Cine`** (o el que ya tengas)
- **Public**
- Sin README/license/gitignore — vacío

### 2. Sube TODOS los archivos de esta carpeta
- Drag-and-drop **toda** la carpeta `nova-cine-upload` al uploader de GitHub
- ⚠ Asegúrate de incluir la carpeta oculta **`.github`** (Windows: activa "Elementos ocultos" en Vista del explorador, o GitHub no recibe el workflow y no compila nada)
- Commit changes

### 3. Espera 5 min
- Pestaña **Actions** → ves cómo compila
- Cuando termina en verde, en **Releases** aparece `v5.4.1` con:
  - `NovaCine Setup 5.4.1.exe` (instalador)
  - `NovaCine-Portable-5.4.1.exe` (portable)

Doble click → ejecuta.

---

## Qué incluye este bundle (15 archivos)

```
nova-cine-upload/
├── .github/workflows/build-exe.yml   ← dispara GitHub Actions
├── assets/icons/icon.svg
├── fonts/
│   ├── Netflix_Sans_Bold.otf
│   ├── Netflix_Sans_Light.otf
│   └── Netflix_Sans_Medium.otf
├── index.html                        ← app principal (~2600 LOC)
├── novacine.html                     ← redirect a index.html
├── torrent.html                      ← reproductor WebTorrent (browser)
├── colors_and_type.css               ← design tokens
├── manifest.json                     ← PWA
├── sw.js                             ← service worker
├── electron-main.js                  ← backend Electron (WebTorrent nativo)
├── preload.js                        ← bridge nativeAPI
├── package.json                      ← v5.4.1, deps + build config
└── BUILD-EXE.md                      ← guía detallada
```

---

## Después de la primera build

**Cambios futuros = 1 click en GitHub web:**
1. Edita `index.html` (o el que sea) directo en github.com
2. Commit
3. 5 min después tienes nuevo `.exe` en Releases

**Bump versión cuando quieras:**
- Edita `package.json` → `"version": "5.4.2"`
- Push → release con tag `v5.4.2` automática

---

## Sobre los torrents

- **En el navegador** (URL Workers): solo WebRTC → pool pequeño → cuando aparecen "0 peers", no es bug, es la limitación del navegador
- **En el `.exe`** que vas a compilar: WebTorrent nativo (TCP+UDP+WebRTC) → ve TODOS los peers que ve qBittorrent → velocidades reales

Ambas modalidades vienen ya integradas — la app detecta automáticamente en cuál corre y elige la API correcta.

---

*Si algo va mal: en NovaCine pulsa F12 → Console → copia los errores rojos y pásalos al chat. La mayoría de fallos a partir de aquí son temas de conectividad/red, no de código.*
