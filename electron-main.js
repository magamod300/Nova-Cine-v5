'use strict';
const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');
const http = require('http');
const os = require('os');

let WebTorrent;
try { WebTorrent = require('webtorrent'); } catch(e){ console.warn('[NovaCine] WebTorrent no disponible:', e.message); }

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'AutoplayIgnoreWebAudio');

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
  /* v5.3.3: autoHideMenuBar:true ya oculta el menú al iniciar. setMenuBarVisibility(false) era redundante (post-load) */

  win.webContents.setWindowOpenHandler(({ url })=>{
    if (isAd(url)) return { action:'deny' };
    try {
      const host = new URL(url).hostname;
      const allowExternal = /youtube|google|imdb|themoviedb|pelisplus|cuevana|stremio|github|cobalt|savefrom|yifysubtitles/i.test(host);
      if (allowExternal) shell.openExternal(url).catch(()=>{});
    } catch{}
    return { action:'deny' };
  });
});

app.on('window-all-closed', ()=>{
  if (streamServer){ try{streamServer.close();}catch{} }
  if (wtClient){ try{wtClient.destroy();}catch{} }
  if (process.platform !== 'darwin') app.quit();
});

/* ═══ TORRENT STREAMING (WebTorrent + HTTP Range local) ═══ */
let wtClient = null, activeTorrent = null, streamServer = null;
function getWT(){
  if (!wtClient && WebTorrent){
    wtClient = new WebTorrent();
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
       Default true protege MITM en endpoints sensibles (auto-update, etc.). */
    const reqOpts = { headers:{ 'User-Agent':CHROME_UA }, timeout:12000,
      rejectUnauthorized: opts.allowInsecure ? false : true };
    const req = mod.get(url, reqOpts, res=>{
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
    const req = mod.get(url, reqOpts, res=>{
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
    const client = getWT();
    if (!client){ reject(new Error('WebTorrent no disponible')); return; }
    if (streamServer){ try{streamServer.close();}catch{} streamServer=null; }
    if (activeTorrent){ try{client.remove(activeTorrent.infoHash);}catch{} activeTorrent=null; }

    let settled = false;
    const done = (err, val)=>{ if(settled) return; settled=true; clearTimeout(to); err?reject(err):resolve(val); };
    const to = setTimeout(()=>done(new Error('Timeout metadata')), 30000);
    client.once('error', e=>done(e));

    client.add(magnet, { path: path.join(os.tmpdir(),'novacine') }, torrent=>{
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
        if (range){
          const [s,e] = range.replace(/bytes=/,'').split('-');
          const start = parseInt(s,10);
          const end = e ? parseInt(e,10) : Math.min(start+5*1024*1024, total-1);
          res.writeHead(206, {
            'Content-Range':`bytes ${start}-${end}/${total}`,
            'Accept-Ranges':'bytes',
            'Content-Length': end-start+1,
            'Content-Type': contentType,
            'Access-Control-Allow-Origin':'*',
          });
          vFile.createReadStream({ start, end }).pipe(res).on('error',()=>{});
        } else {
          res.writeHead(200, {
            'Content-Length':total,'Content-Type': contentType,'Accept-Ranges':'bytes',
            'Access-Control-Allow-Origin':'*',
          });
          vFile.createReadStream().pipe(res).on('error',()=>{});
        }
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
