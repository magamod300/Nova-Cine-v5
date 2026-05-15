'use strict';
const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');
const http = require('http');
const os = require('os');

/* v5.4.2: capturar uncaughtException — el stream del torrent puede tirar errores async
   que crashean el main process. Sin esto sale el popup "JavaScript error occurred in main process". */
process.on('uncaughtException', (err) => {
  console.warn('[main] uncaughtException:', err?.message || err);
});
process.on('unhandledRejection', (err) => {
  console.warn('[main] unhandledRejection:', err?.message || err);
});

let WebTorrent;
try { WebTorrent = require('webtorrent'); } catch(e){ console.warn('[NovaCine] WebTorrent no disponible:', e.message); }

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'AutoplayIgnoreWebAudio,CrossOriginOpenerPolicy,ThirdPartyStoragePartitioning');
/* v5.4.3: forzar hardware decode + todos los codecs disponibles */
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport,VaapiVideoDecoder,VaapiVideoEncoder');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-zero-copy');
/* v5.4.8: silenciar el spam de "Third-party cookie will be blocked" en consola */
app.commandLine.appendSwitch('disable-blink-features', 'CookieDeprecationFacilitatedTesting');
app.commandLine.appendSwitch('disable-third-party-cookies-warnings');

/* ═══ AD-BLOCK reforzado v5.2.4 ═══ */
const AD_DOMAINS = new Set([
  'popads.net','popcash.net','popunder.net','clickunder.net','popin.cc',
  'exoclick.com','trafficjunky.net','juicyads.com','hilltopads.net',
  'plugrush.com','adsterra.com','adcash.com','adcash2.com','propellerads.com',
  'googlesyndication.com','doubleclick.net','googleadservices.com',
  'adnxs.com','appnexus.com','openx.net','pubmatic.com','rubiconproject.com',
  'criteo.com','taboola.com','outbrain.com','mgid.com','revcontent.com',
  'amazon-adsystem.com','adsrvr.org','mathtag.com','realsrv.com',
  'tsyndicate.com','adsterra.io','propellerclick.com',
  'clickaine.com','clickadu.com','popmyads.com','onclickperformance.com',
  'monetag.com','pushroad.com','adserver.juicyads.com','mybetterad.com',
  'smartadserver.com','onclickads.net',
  /* v5.3.3: redes activas 2025-2026 */
  'adform.net','xandr.com','33across.com','spotxchange.com',
  'sharethrough.com','freestar.com','playwire.com',
]);
function isAd(url){
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    for (let i = 0; i < parts.length - 1; i++){
      if (AD_DOMAINS.has(parts.slice(i).join('.'))) return true;
    }
  } catch{}
  return false;
}
function setupAdBlock(sess){
  try {
    sess.webRequest.onBeforeRequest({ urls:['<all_urls>'] }, (det, cb)=>cb({ cancel: isAd(det.url) }));
  } catch{}
}

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

app.whenReady().then(()=>{
  setupAdBlock(session.defaultSession);
  session.defaultSession.setUserAgent(CHROME_UA);

  const win = new BrowserWindow({
    width: 1400, height: 880,
    minWidth: 960, minHeight: 600,
    backgroundColor: '#090910',
    title: 'NovaCine',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, /* necesario para preload con require() */
      webviewTag: true,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  /* v5.5.0: SHORTCUTS DEVTOOLS — siempre accesibles para diagnóstico.
     F12 / Ctrl+Shift+I abren las herramientas de desarrollador incluso en producción. */
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown'){
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')){
        win.webContents.toggleDevTools();
        event.preventDefault();
      }
      if ((input.control || input.meta) && input.key.toLowerCase() === 'r'){
        win.webContents.reload();
        event.preventDefault();
      }
      if (input.key === 'F5'){
        win.webContents.reload();
        event.preventDefault();
      }
    }
  });

  /* v5.5.0: INYECCIÓN DE ERROR HANDLER — captura errores invisibles y los muestra como
     banner rojo en pantalla. Antes los errores silenciosos rompían botones sin avisar. */
  win.webContents.on('dom-ready', () => {
    win.webContents.executeJavaScript(`
      (function(){
        if (window.__novacineErrHandler) return; window.__novacineErrHandler = true;
        function showErr(msg){
          let bar = document.getElementById('__nc_err_bar');
          if (!bar){
            bar = document.createElement('div');
            bar.id = '__nc_err_bar';
            bar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:8px 14px;font:13px/1.4 system-ui,sans-serif;z-index:99999;box-shadow:0 4px 14px rgba(0,0,0,.6);max-height:30vh;overflow-y:auto;white-space:pre-wrap';
            bar.innerHTML = '<span style="float:right;cursor:pointer;font-size:18px;line-height:1;margin-left:8px" onclick="this.parentNode.style.display=\\'none\\'">×</span><div id="__nc_err_msgs"></div>';
            document.body && document.body.appendChild(bar);
          }
          const msgs = document.getElementById('__nc_err_msgs');
          if (msgs){
            const ts = new Date().toTimeString().slice(0,8);
            msgs.innerHTML = '<div>['+ts+'] '+String(msg).slice(0,300)+'</div>' + msgs.innerHTML;
            if (msgs.children.length > 6) msgs.removeChild(msgs.lastChild);
          }
        }
        window.addEventListener('error', e=>{
          showErr('JS ERROR: '+(e.message||e.error?.message||'?')+' @ '+(e.filename||'').split('/').pop()+':'+e.lineno);
        });
        window.addEventListener('unhandledrejection', e=>{
          const r = e.reason; const m = r && (r.message||r.toString()) || '?';
          /* Filtrar rejects esperados (fetch fail offline, etc.) */
          if (/Failed to fetch|NetworkError|AbortError/i.test(m)) return;
          showErr('PROMISE: '+m.slice(0,200));
        });
      })();
    `).catch(()=>{});
  });

  win.webContents.setWindowOpenHandler(({ url })=>{
    if (isAd(url)) return { action:'deny' };
    /* v5.4.8: permitir abrir archivos LOCALES (torrent.html, etc.) en ventana nueva. */
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'file:'){
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 1200, height: 800,
            backgroundColor: '#090910',
            title: 'NovaCine',
            autoHideMenuBar: true,
            webPreferences: {
              preload: path.join(__dirname, 'preload.js'),
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: false,
              webviewTag: true,
            },
          },
        };
      }
      /* v5.5.0: PERMITIR TODAS LAS URLs HTTP(S) externas que NO sean ads.
         Antes había un whitelist de 11 dominios que silenciaba TODOS los demás
         (animeflv, monoschinos, nyaa, 1337x, yts, seriesflix, sololatino, etc.).
         El usuario clickaba un servidor externo y "no pasaba nada". */
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:'){
        shell.openExternal(url).catch(err => console.warn('[openExternal]', err.message));
      }
    } catch(e){ console.warn('[windowOpen] URL inválida:', url, e.message); }
    return { action:'deny' };
  });
});

app.on('window-all-closed', ()=>{
  if (streamServer){ try{streamServer.close();}catch{} }
  if (wtClient){ try{wtClient.destroy();}catch{} }
  /* v5.5.2: limpiar archivos torrent temporales al cerrar (puede crecer mucho con uso) */
  try {
    const fs = require('fs');
    const tmp = path.join(os.tmpdir(), 'novacine');
    if (fs.existsSync(tmp)){
      fs.rmSync(tmp, { recursive:true, force:true, maxRetries:3 });
    }
  } catch(e){ console.warn('[cleanup] tmp:', e.message); }
  if (process.platform !== 'darwin') app.quit();
});

/* ═══ TORRENT STREAMING (WebTorrent + HTTP Range local) ═══ */
let wtClient = null, activeTorrent = null, streamServer = null;

/* v5.4.5: trackers añadidos a cada torrent para descubrir más peers.
   Node.js soporta UDP/HTTP además de WSS — usa los protocolos completos. */
const NATIVE_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://tracker.bittor.pw:1337/announce',
  'udp://9.rarbg.com:2810/announce',
  'udp://tracker-udp.gbitt.info:80/announce',
  'udp://explodie.org:6969/announce',
  'http://tracker.opentrackr.org:1337/announce',
  'http://nyaa.tracker.wf:7777/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.btorrent.xyz',
];

function getWT(){
  if (!wtClient && WebTorrent){
    /* v5.4.5: maxConns 200 (default 55) — en native podemos permitir muchísimos más peers */
    wtClient = new WebTorrent({
      maxConns: 200,
      dht: true,       /* DHT funciona en native (UDP), descubre peers sin tracker */
      utPex: true,     /* Peer exchange */
      lsd: true,       /* Local Service Discovery — peers en tu misma LAN */
    });
    wtClient.on('error', e => console.warn('[WT]', e.message));
  }
  return wtClient;
}
function formatBytes(b){
  if (!b) return '?';
  if (b >= 1e9) return (b/1e9).toFixed(2)+' GB';
  return (b/1e6).toFixed(0)+' MB';
}

/* Helpers HTTP minimal */
const https = require('https');
function fetchJSON(url, opts={}){
  return new Promise((resolve, reject)=>{
    const mod = url.startsWith('https') ? https : http;
    /* v5.3.3: rejectUnauthorized solo si se pide explícitamente (algunos trackers tienen certs malos).
       Default true protege MITM en endpoints sensibles (auto-update, etc.).
       v5.5.6: + seguir redirects 301/302 (yts.mx \u2192 yts.am suele pasar) + validar HTTP status. */
    const reqOpts = { headers:{ 'User-Agent':CHROME_UA }, timeout:12000,
      rejectUnauthorized: opts.allowInsecure ? false : true };
    const redirects = opts._redirects || 0;
    const req = mod.get(url, reqOpts, res=>{
      /* Manejar redirects (m\u00e1ximo 3) */
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location && redirects < 3){
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(fetchJSON(next, { ...opts, _redirects: redirects + 1 }));
      }
      if (res.statusCode >= 400){
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data='';
      res.on('data', c=>data+=c);
      res.on('end', ()=>{ try{ resolve(JSON.parse(data)); }catch(e){ reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', ()=>{ req.destroy(); reject(new Error('timeout')); });
  });
}
function fetchText(url, opts={}){
  return new Promise((resolve, reject)=>{
    const mod = url.startsWith('https') ? https : http;
    const reqOpts = { headers:{ 'User-Agent':CHROME_UA }, timeout:12000,
      rejectUnauthorized: opts.allowInsecure ? false : true };
    const redirects = opts._redirects || 0;
    const req = mod.get(url, reqOpts, res=>{
      /* v5.5.6: redirects + status */
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location && redirects < 3){
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(fetchText(next, { ...opts, _redirects: redirects + 1 }));
      }
      if (res.statusCode >= 400){
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data='';
      res.on('data', c=>data+=c);
      res.on('end', ()=>resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', ()=>{ req.destroy(); reject(new Error('timeout')); });
  });
}
function buildMagnet(hash, title){
  const tr = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://exodus.desync.com:6969/announce',
    'wss://tracker.btorrent.xyz',
    'wss://tracker.openwebtorrent.com',
  ].map(t=>`tr=${encodeURIComponent(t)}`).join('&');
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title||'')}&${tr}`;
}

/* Buscar torrents: YTS (movies) + EZTV (series) + Nyaa (anime) */
ipcMain.handle('search-torrents', async (_e, { imdbId, title, type, season, episode })=>{
  const results = [];
  if (type==='movie' || type==='r18'){
    try {
      const url = imdbId
        ? `https://yts.mx/api/v2/movie_details.json?imdb_id=${imdbId}`
        : `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(title)}&limit=5`;
      const data = await fetchJSON(url, {allowInsecure:true});
      const movies = data?.data?.movie ? [data.data.movie] : (data?.data?.movies||[]);
      movies.forEach(m=>{
        (m.torrents||[]).forEach(t=>{
          results.push({
            source:'YTS', quality:t.quality,
            size: t.size || formatBytes(t.size_bytes),
            seeds: t.seeds||0, peers: t.peers||0,
            magnet: buildMagnet(t.hash, m.title_long||title),
            lang:'en',
          });
        });
      });
    } catch(e){ console.warn('[YTS]', e.message); }
  }
  if (type==='tv' && imdbId){
    try {
      const num = imdbId.replace('tt','');
      const data = await fetchJSON(`https://eztv.re/api/get-torrents?imdb_id=${num}&limit=100`, {allowInsecure:true});
      (data?.torrents||[])
        .filter(t=>season==null || String(t.season)===String(season))
        .filter(t=>episode==null || String(t.episode)===String(episode))
        .forEach(t=>{
          results.push({
            source:'EZTV', quality:t.quality||'HD',
            size: formatBytes(t.size_bytes),
            seeds: t.seeds||0, peers: t.peers||0,
            magnet: t.magnet_url, season:t.season, episode:t.episode, lang:'en',
          });
        });
    } catch(e){ console.warn('[EZTV]', e.message); }
  }
  if (type==='anime'){
    try {
      const rss = await fetchText(`https://nyaa.si/?page=rss&q=${encodeURIComponent(title)}&c=1_0&f=0`, {allowInsecure:true});
      const rx = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<nyaa:seeders>(\d+)<\/nyaa:seeders>[\s\S]*?<nyaa:size>([\s\S]*?)<\/nyaa:size>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<\/item>/g;
      let m, count=0;
      while ((m = rx.exec(rss)) !== null && count++ < 10){
        results.push({
          source:'Nyaa',
          quality: m[1].includes('1080')?'1080p': m[1].includes('720')?'720p':'HD',
          size: m[3].trim(),
          seeds: parseInt(m[2])||0,
          magnet: m[4].trim(),
          lang: m[1].toLowerCase().includes('dub')?'dub':m[1].toLowerCase().includes('sub')?'sub':'ja',
        });
      }
    } catch(e){ console.warn('[Nyaa]', e.message); }
  }
  /* APIBAY fallback */
  if (!results.length && (type==='movie' || type==='tv')){
    try {
      const q = imdbId || title;
      const cat = type==='tv'?208:207;
      const data = await fetchJSON(`https://apibay.org/q.php?q=${encodeURIComponent(q)}&cat=${cat}`, {allowInsecure:true});
      const ZERO = '0000000000000000000000000000000000000000';
      (Array.isArray(data)?data:[])
        .filter(t=>t.info_hash && t.info_hash!==ZERO)
        .slice(0,10).forEach(t=>{
          const name = t.name||title;
          results.push({
            source:'TPB',
            quality: /2160|4k/i.test(name)?'4K':/1080/i.test(name)?'1080p':/720/i.test(name)?'720p':'HD',
            size: formatBytes(parseInt(t.size)||0),
            seeds: parseInt(t.seeders)||0, peers: parseInt(t.leechers)||0,
            magnet: buildMagnet(t.info_hash, name),
            lang: /latino|spanish|esp|lat\b/i.test(name)?'es-LA':'en',
          });
        });
    } catch(e){ console.warn('[APIBAY]', e.message); }
  }
  return results.sort((a,b)=>{
    /* v5.3.1: priorizar latino primero, luego seeds */
    const aLat = /latino|lat\b|spanish|esp|dual|multi/i.test(a.lang||'') || /latino|spanish|esp|lat\b|dual|multi/i.test((a.magnet||'').replace(/.*dn=([^&]*).*/,'$1'));
    const bLat = /latino|lat\b|spanish|esp|dual|multi/i.test(b.lang||'') || /latino|spanish|esp|lat\b|dual|multi/i.test((b.magnet||'').replace(/.*dn=([^&]*).*/,'$1'));
    if (aLat !== bLat) return bLat - aLat;
    return (b.seeds||0)-(a.seeds||0);
  });
});

/* v5.3.1: auto-update desde GitHub Releases */
ipcMain.handle('check-update', async () => {
  try {
    const repo = 'magamod300/Nova-Cine';
    const data = await fetchJSON(`https://api.github.com/repos/${repo}/releases/latest`);
    if (!data || !data.tag_name) return { hasUpdate: false };
    const current = require('./package.json').version;
    const latest = data.tag_name.replace(/^v/, '');
    return {
      hasUpdate: latest !== current,
      latest, current,
      downloadUrl: data.assets?.find(a => a.name.endsWith('.exe'))?.browser_download_url,
      notes: data.body || '',
    };
  } catch(e){ return { hasUpdate: false, error: e.message }; }
});

ipcMain.handle('stream-torrent', (_e, magnet)=>{
  return new Promise((resolve, reject)=>{
    /* v5.5.9: validar magnet input \u2014 si viene basura, webtorrent crashea internamente
       y el error no se captura limpiamente. */
    if (typeof magnet !== 'string' || !magnet.trim()){
      reject(new Error('Magnet inv\u00e1lido (vac\u00edo)'));
      return;
    }
    const m = magnet.trim();
    const isMagnet = /^magnet:\?[^&]*xt=urn:btih:[a-f0-9]{32,40}/i.test(m);
    const isHash = /^[a-f0-9]{40}$/i.test(m) || /^[a-z2-7]{32}$/i.test(m);
    if (!isMagnet && !isHash){
      reject(new Error('Magnet con formato inv\u00e1lido'));
      return;
    }
    const finalMagnet = isHash ? `magnet:?xt=urn:btih:${m}` : m;

    const client = getWT();
    if (!client){ reject(new Error('WebTorrent no disponible')); return; }
    if (streamServer){ try{streamServer.close();}catch{} streamServer=null; }
    if (activeTorrent){ try{client.remove(activeTorrent.infoHash);}catch{} activeTorrent=null; }

    let settled = false;
    /* v5.5.2: si la promesa se settlea por error, asegurar que el torrent también muere
       (antes quedaba huérfano consumiendo banda) */
    const cleanup = () => {
      try { if (activeTorrent) client.remove(activeTorrent.infoHash); } catch{}
      activeTorrent = null;
      try { if (streamServer) streamServer.close(); } catch{}
      streamServer = null;
    };
    const done = (err, val)=>{
      if(settled) return; settled=true;
      clearTimeout(to); clearInterval(metaPoll);
      if (err) cleanup();
      err?reject(err):resolve(val);
    };
    /* v5.5.0: timeout subido a 120s (era 30s) — torrents grandes (11-20GB) con pocos peers
       iniciales tardan más en descubrirse y traer metadata. */
    const to = setTimeout(()=>done(new Error('Timeout metadata · 120s sin encontrar peers')), 120000);
    client.once('error', e=>done(e));

    /* v5.5.0: poll periódico para reportar progreso de metadata.
       Sin esto el usuario veía "Obteniendo metadata…" sin saber si está vivo. */
    const metaPoll = setInterval(()=>{
      const t = client.torrents[client.torrents.length-1];
      if (!t || settled) return;
      console.log(`[stream-torrent] esperando metadata · peers=${t.numPeers} · downloaded=${(t.downloaded/1e6).toFixed(1)}MB`);
    }, 3000);

    client.add(finalMagnet, {
      path: path.join(os.tmpdir(),'novacine'),
      announce: NATIVE_TRACKERS,  /* v5.4.5: añadir trackers extra a cada torrent */
      maxWebConns: 8,
    }, torrent=>{
      activeTorrent = torrent;
      const EXT = ['.mp4','.mkv','.avi','.mov','.webm','.m4v','.ts'];
      const vFiles = torrent.files.filter(f => EXT.some(x=>f.name.toLowerCase().endsWith(x)));
      const vFile = (vFiles.length?vFiles:torrent.files).reduce((a,b)=>a.length>b.length?a:b);

      /* Content-Type por extensión (no todo es mp4) */
      const ext = (vFile.name.match(/\.([^.]+)$/)||[,'mp4'])[1].toLowerCase();
      const MIME = { mp4:'video/mp4', m4v:'video/mp4', webm:'video/webm',
        mkv:'video/x-matroska', avi:'video/x-msvideo', mov:'video/quicktime', ts:'video/mp2t' };
      const contentType = MIME[ext] || 'video/mp4';

      /* v5.3.1: deselectar TODO primero, luego priorizar inicio + final
         Esto hace que la reproducción empiece con ~5MB descargados (típicamente 5-10s)
         en vez de esperar a tener todo el archivo */
      torrent.files.forEach(f => f.deselect());
      vFile.select(0, vFile.length - 1, 0);                             /* todo en prioridad normal */
      vFile.select(0, Math.min(vFile.length - 1, 8 * 1024 * 1024), 1);  /* primeros 8MB prioridad alta */
      const lastChunkStart = Math.max(0, vFile.length - 2 * 1024 * 1024);
      vFile.select(lastChunkStart, vFile.length - 1, 1);                /* últimos 2MB (moov atom MP4) */

      const srv = http.createServer((req,res)=>{
        const total = vFile.length;
        const range = req.headers.range;
        /* v5.4.2: helper para pipe seguro — destroy on client abort + swallow errors.
           v5.5.2: + log de aborts y manejo de Range mal formado / out-of-range (HTTP 416). */
        const safePipe = (rs) => {
          rs.on('error', (err) => { console.warn('[stream] readstream err:', err.message); try{rs.destroy();}catch{} });
          res.on('close', () => { try{rs.destroy();}catch{} });
          res.on('error', () => { try{rs.destroy();}catch{} });
          try { rs.pipe(res); } catch(e){ console.warn('[stream] pipe err:', e.message); }
        };
        if (range){
          /* v5.5.2: parser de Range robusto — antes "bytes=abc-def" devolvía NaN
             y el video element se quedaba colgado sin error visible. */
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          let start = m && m[1] !== '' ? parseInt(m[1],10) : 0;
          let end   = m && m[2] !== '' ? parseInt(m[2],10) : Math.min(start + 5*1024*1024, total - 1);
          if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= total){
            try {
              res.writeHead(416, { 'Content-Range': `bytes */${total}`, 'Content-Type':'text/plain' });
              res.end('Range Not Satisfiable');
            } catch{}
            return;
          }
          if (end >= total) end = total - 1;
          if (end < start) end = start;
          try {
            res.writeHead(206, {
              'Content-Range':`bytes ${start}-${end}/${total}`,
              'Accept-Ranges':'bytes',
              'Content-Length': end-start+1,
              'Content-Type': contentType,
              'Access-Control-Allow-Origin':'*',
              'Cache-Control':'no-store',
            });
            safePipe(vFile.createReadStream({ start, end }));
          } catch(e){ console.warn('[stream] 206 err:', e.message); }
        } else {
          try {
            res.writeHead(200, {
              'Content-Length':total,'Content-Type': contentType,'Accept-Ranges':'bytes',
              'Access-Control-Allow-Origin':'*','Cache-Control':'no-store',
            });
            safePipe(vFile.createReadStream());
          } catch(e){ console.warn('[stream] 200 err:', e.message); }
        }
      });
      /* v5.5.2: limit max conexiones simultáneas (browser puede abrir varias para Range).
         Y manejar errores del server sin crashear. */
      srv.maxConnections = 6;
      srv.on('clientError', (err, socket) => {
        console.warn('[stream] clientError:', err.message);
        try { socket.destroy(); } catch{}
      });
      srv.listen(0,'127.0.0.1', ()=>{
        streamServer = srv;
        done(null, { url:`http://127.0.0.1:${srv.address().port}/video`, name:vFile.name, size:formatBytes(vFile.length) });
      });
      srv.on('error', e=>done(e));
    });
  });
});

ipcMain.handle('stop-torrent', ()=>{
  if (streamServer){ try{streamServer.close();}catch{} streamServer=null; }
  if (activeTorrent && wtClient){ try{wtClient.remove(activeTorrent.infoHash);}catch{} activeTorrent=null; }
});

ipcMain.handle('torrent-progress', ()=>{
  if (!activeTorrent) return null;
  return {
    progress: Math.round(activeTorrent.progress*100),
    down: formatBytes(activeTorrent.downloadSpeed)+'/s',
    peers: activeTorrent.numPeers,
  };
});

ipcMain.handle('is-electron', ()=>true);
