'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('z87', {
  setMappings: mappings => ipcRenderer.send('87z:set-mappings', mappings),
  setEngine: engine => ipcRenderer.send('87z:set-engine', engine),
  setVirtualEnabled: enabled => ipcRenderer.send('87z:set-virtual-enabled', !!enabled),
  setToggleShortcut: shortcut => ipcRenderer.invoke('87z:set-toggle-shortcut', shortcut),
  getSystemStatus: () => ipcRenderer.invoke('87z:get-system-status'),
  openViGEmDownload: () => ipcRenderer.invoke('87z:open-vigem-download'),
  installViGEm: () => ipcRenderer.invoke('87z:install-vigem'),
  getAppInfo: () => ipcRenderer.invoke('87z:get-app-info'),
  checkForUpdates: () => ipcRenderer.invoke('87z:check-update'),
  downloadUpdate: () => ipcRenderer.invoke('87z:download-update'),
  installUpdate: () => ipcRenderer.send('87z:install-update'),
  onVirtualStatus: callback => subscribe('87z:virtual-status', callback),
  onVirtualToggle: callback => subscribe('87z:virtual-toggle', callback),
  onDriverStatus: callback => subscribe('87z:driver-status', callback),
  onVirtualInput: callback => subscribe('87z:virtual-input', callback),
  onUpdateStatus: callback => subscribe('87z:update-status', callback)
});
