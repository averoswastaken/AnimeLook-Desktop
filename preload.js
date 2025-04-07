const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

  windowControl: (action) => ipcRenderer.send('window-control', action),
  

  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
  onSettingsSaved: (callback) => ipcRenderer.on('settings-saved', (_, value) => callback(value)),
  

  onLoadingChange: (callback) => ipcRenderer.on('loading', (_, isLoading) => callback(isLoading)),
  

  onOpenSettings: (callback) => ipcRenderer.on('open-settings', () => callback()),
  

  onFullscreenChange: (callback) => ipcRenderer.on('fullscreen-change', (_, isFullscreen) => callback(isFullscreen)),
  

  onVideoFullscreenChange: (callback) => ipcRenderer.on('video-fullscreen-change', (_, isVideoFullscreen) => callback(isVideoFullscreen)),
  

  togglePictureInPicture: (url, hasVideo, videoElement, currentTime, videoId) => ipcRenderer.send('toggle-pip-mode', url, hasVideo, videoElement, currentTime, videoId),
  onPipModeChange: (callback) => ipcRenderer.on('pip-mode-change', (_, isPipActive) => callback(isPipActive)),
  getCurrentUrl: () => ipcRenderer.invoke('get-current-url'),
  updateCurrentUrl: (url) => ipcRenderer.send('update-current-url', url),
  closePipWindow: () => ipcRenderer.send('close-pip-window'),
  onPipError: (callback) => ipcRenderer.on('pip-error', (_, errorMessage) => callback(errorMessage)),
  

  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_, status) => callback(status)),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, info) => callback(info)),
  

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  

  clearCache: () => ipcRenderer.invoke('clear-cache'),
  onCacheCleared: (callback) => ipcRenderer.on('cache-cleared', (_, result) => callback(result)),
  

  setDiscordWatching: (data) => ipcRenderer.send('discord-set-watching', data),
  setDiscordSearching: () => ipcRenderer.send('discord-set-searching'),
  setDiscordBrowsing: (pageTitle) => ipcRenderer.send('discord-set-browsing', pageTitle),
});


window.addEventListener('DOMContentLoaded', () => {

  const style = document.createElement('style');
  style.textContent = `
    /* Özel scrollbar */
    ::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    
    ::-webkit-scrollbar-track {
      background: #2e2c29;
    }
    
    ::-webkit-scrollbar-thumb {
      background: #2196F3;
      border-radius: 5px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: #1976D2;
    }
  `;
  document.head.appendChild(style);
  

  const script = document.createElement('script');
  script.textContent = `
   
    const originalWindowOpen = window.open;
    
    window.open = function(url, target, features) {
      if (url) {
       
        const currentDomain = window.location.hostname;
        const urlObj = new URL(url, window.location.href);
        
        if (urlObj.hostname === currentDomain || urlObj.hostname === 'animelook.com' || urlObj.hostname.endsWith('.animelook.com')) {
         
          window.location.href = url;
          return null;
        } else {
       
          if (window.event && window.event.ctrlKey) {
            window.parent.postMessage({ type: 'open-external-url', url: url }, '*');
            return null;
          }
          
       
          if (urlObj.hostname.includes('instagram.com') || 
              urlObj.hostname.includes('twitter.com') || 
              urlObj.hostname.includes('facebook.com') {
            window.parent.postMessage({ type: 'open-external-url', url: url }, '*');
            return null;
          }
          
        
          window.location.href = url;
          return null;
        }
      }

      return {
        closed: true,
        close: function() {},
        focus: function() {},
        blur: function() {}
      };
    };
    
    
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      if (link && link.target === '_blank') {
        e.preventDefault();
        window.open(link.href, '_blank');
      }
    }, true);
    
   
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.href) {
        const url = link.href;
        const currentDomain = window.location.hostname;
        const urlObj = new URL(url, window.location.href);
        
        
        if ((urlObj.hostname !== currentDomain && 
             urlObj.hostname !== 'animelook.com' && 
             !urlObj.hostname.endsWith('.animelook.com')) && 
            !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          window.parent.postMessage({ type: 'open-external-url', url: url }, '*');
        }
      }
    }, true);
  `;
  document.head.appendChild(script);
  

  window.addEventListener('message', (event) => {

    if (event.data && event.data.type === 'video-fullscreen-change') {

      ipcRenderer.send('video-fullscreen-change', event.data.isFullscreen);
    }
    

    if (event.data && event.data.type === 'open-external-url') {

      ipcRenderer.send('open-external-url', event.data.url);
    }
  });
});