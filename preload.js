const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nativeAPI', {
  isElectron: true,
  searchTorrents: (opts) => ipcRenderer.invoke('search-torrents', opts),
  streamTorrent:  (magnet) => ipcRenderer.invoke('stream-torrent', magnet),
  stopTorrent:    () => ipcRenderer.invoke('stop-torrent'),
  torrentProgress:() => ipcRenderer.invoke('torrent-progress'),
  checkUpdate:    () => ipcRenderer.invoke('check-update'),
});
