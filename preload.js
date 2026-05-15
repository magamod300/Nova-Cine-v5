const { contextBridge, ipcRenderer } = require('electron');

/* v5.5.3: cada handler envuelto en try/catch — si el main process tira un excepci\u00f3n sync
   (raro pero pasa con webtorrent), el renderer recibe rejection limpia en vez de crash. */
function safeInvoke(channel, ...args){
  try { return ipcRenderer.invoke(channel, ...args); }
  catch(e){ return Promise.reject(e); }
}

try {
  contextBridge.exposeInMainWorld('nativeAPI', {
    isElectron: true,
    searchTorrents: (opts) => safeInvoke('search-torrents', opts),
    streamTorrent:  (magnet) => safeInvoke('stream-torrent', magnet),
    stopTorrent:    () => safeInvoke('stop-torrent'),
    torrentProgress:() => safeInvoke('torrent-progress'),
    checkUpdate:    () => safeInvoke('check-update'),
  });
} catch(e){
  /* Si contextBridge falla, el renderer no tendr\u00e1 nativeAPI y el frontend
     caer\u00e1 al modo web puro autom\u00e1ticamente (IS_ELECTRON=false). */
  console.error('[preload] contextBridge falló:', e);
}
