# NovaCine — Build .exe automáticamente con GitHub Actions

## Qué hace este setup

Cada push a `main` dispara GitHub Actions y compila el `.exe` solo. Sin instalar nada en tu PC. Sin esperar a la 1 de la madrugada porque tu portátil iba lento.

**Estado actual:** funcionando desde v5.3.0. La versión se lee automáticamente de `package.json`.

---

## Setup inicial (5 min, una sola vez)

### 1. Crea el repo en GitHub

- [github.com/new](https://github.com/new)
- **Nombre:** `Nova-Cine` (o el que tengas — `magamod300/Nova-Cine` es el actual)
- **Public** (necesario para Actions gratis ilimitadas)
- Sin README / .gitignore / license — los subes tú

### 2. Sube TODOS los archivos del ZIP

Arrastra a la zona de upload de GitHub web:

**Raíz:**
- `index.html` · `novacine.html` · `torrent.html`
- `colors_and_type.css` · `manifest.json` · `sw.js`
- `electron-main.js` · `preload.js` · `package.json`
- `BUILD-EXE.md` (este archivo, opcional)

**Carpetas (mantén la estructura):**
- `.github/workflows/build-exe.yml` ← el que dispara Actions
- `assets/icons/icon.svg`
- `fonts/Netflix_Sans_*.otf` (3 archivos)

⚠ **Importante:** la carpeta `.github` empieza con un punto y Windows la marca oculta por defecto. Activa "Elementos ocultos" en el explorador antes de arrastrar, o GitHub no recibirá el workflow.

### 3. Espera 5 min

GitHub Actions arranca solo. Pestaña **Actions** del repo → ves el job `build` corriendo.

```
✓ Set up job              (1s)
✓ Run actions/checkout    (5s)
✓ Run actions/setup-node  (11s)
✓ Read version            (1s)
✓ Install dependencies    (29s)  ← npm install
✓ Build .exe              (32s)  ← electron-builder
✓ Upload installer        (6s)
✓ Release on push to main (2s)
```

### 4. Descarga el `.exe`

Dos sitios donde queda:

**A) Artifacts del workflow** (público a ti)
- Click sobre el job verde → scroll abajo → sección **Artifacts**
- `NovaCine-installer-v5.4.1` (78 MB) → descargas un ZIP

**B) Releases automáticas** (público a todos)
- Pestaña **Releases** del repo
- Cada push crea una release con tag `v5.4.1` (el número viene de `package.json`)
- Los archivos `.exe` están directo, sin ZIP intermedio
- URL pública que puedes compartir: `https://github.com/TU-USER/Nova-Cine/releases/latest`

Dentro tienes:
- `NovaCine Setup 5.4.1.exe` — instalador NSIS (con menú inicio + acceso directo + uninstaller)
- `NovaCine-Portable-5.4.1.exe` — sin instalación, doble click y corre

---

## Cómo actualizar la app

Cualquiera de estos triggers re-compila:

1. **Cambias un archivo** en GitHub web → commit → push automático
2. **Subes un ZIP nuevo** desde tu PC con `git push`
3. **Botón "Run workflow"** manual en la pestaña Actions

Si cambias **la versión en `package.json`** (ej. de `5.4.1` a `5.4.2`), el tag de la release nueva sale con ese número. Si dejas la misma, GitHub re-crea la release con el mismo tag (sobreescribe).

---

## Compilación local (alternativa)

Si prefieres no usar GitHub Actions:

```powershell
# Requiere Node.js 20+ instalado (nodejs.org)
cd nova-cine-upload
npm install        # ~2 min, descarga Electron + WebTorrent
npm run dist       # ~3 min, compila .exe
```

Los `.exe` quedan en `dist/`. Mismos artifacts.

---

## Ventajas del `.exe` vs la versión web

| Feature | Web | .exe |
|---|---|---|
| Catálogo TMDB | ✓ | ✓ |
| Embed servers (Videasy, VidSrc, etc.) | ✓ | ✓ |
| CinePro / TMDB-Embed M3U8 | ✓ | ✓ |
| **Torrents browser** (WebRTC only) | ✓ (limitado) | — |
| **Torrents nativos** (TCP+UDP+WebRTC) | ✗ | ✓ |
| YTS + EZTV + Nyaa + TPB | solo YTS | **los 4** |
| Series y anime con torrents | ✗ | ✓ |
| Adblock a nivel proceso | ✗ | ✓ (bloquea ~50 dominios) |
| Auto-update via GitHub releases | ✗ | ✓ |
| Sin antivirus tumbando R18 | ✗ | ✓ (sesión aislada) |
| Atajos del SO (Esc fullscreen, etc.) | parcial | ✓ |

---

## Troubleshooting

**Actions falla en rojo**
- Click el workflow rojo → pestaña con error en rojo
- Si dice `npm ERR! 404` en alguna dep → cambió un nombre de paquete, dímelo y lo arreglo
- Si dice `electron-builder` × `signing` → el .exe no está firmado (normal en builds gratis)

**"Windows protegió tu PC" al abrir el `.exe`**
- Esperado en `.exe` sin firmar (firma EV cuesta ~250€/año)
- Click "Más información" → "Ejecutar de todas formas"
- Para evitar el aviso del todo → botón derecho → Propiedades → check "Desbloquear" abajo

**El icono del `.exe` es genérico (átomo Electron)**
- electron-builder convierte SVG con resultado mediocre
- Solución: ve a [icoconverter.com](https://www.icoconverter.com/), sube `assets/icons/icon.svg`, marca todas las resoluciones, descarga `.ico`, sustituye `assets/icons/icon.svg` → `assets/icons/icon.ico` y cambia en `package.json` `"icon": "assets/icons/icon.ico"`

**El auto-update no encuentra updates**
- Comprueba que el slug del repo en `electron-main.js` coincide con tu repo real
- Línea ~205: `const repo = 'magamod300/Nova-Cine';`
- Si es otro, cámbialo y push otra vez

---

*Última actualización: v5.4.1 · GitHub Actions verde · auto-build operativo*
