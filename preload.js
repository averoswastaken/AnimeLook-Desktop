const { contextBridge, ipcRenderer } = require('electron');


// Add these to the electronAPI object
contextBridge.exposeInMainWorld('electronAPI', {

  windowControl: (action) => ipcRenderer.send('window-control', action),
  

  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
  onSettingsSaved: (callback) => ipcRenderer.on('settings-saved', (_, value) => callback(value)),
  

  onLoadingChange: (callback) => ipcRenderer.on('loading', (_, isLoading) => callback(isLoading)),
  

  onOpenSettings: (callback) => ipcRenderer.on('open-settings', () => callback()),
  

  onFullscreenChange: (callback) => ipcRenderer.on('fullscreen-change', (_, isFullscreen) => callback(isFullscreen)),
  

  onVideoFullscreenChange: (callback) => ipcRenderer.on('video-fullscreen-change', (_, isVideoFullscreen) => callback(isVideoFullscreen)),
  

  togglePictureInPicture: (url, hasVideo, videoElement) => ipcRenderer.send('toggle-pip-mode', url, hasVideo, videoElement),
  onPipModeChange: (callback) => ipcRenderer.on('pip-mode-change', (_, isPipActive) => callback(isPipActive)),
  getCurrentUrl: () => ipcRenderer.invoke('get-current-url'),
  updateCurrentUrl: (url) => ipcRenderer.send('update-current-url', url),
  closePipWindow: () => ipcRenderer.send('close-pip-window'),
  onPipError: (callback) => ipcRenderer.on('pip-error', (_, errorMessage) => callback(errorMessage)),
  
  // Update related functions
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_, status) => callback(status)),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, info) => callback(info)),
  
  // Get app version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Add this new method for social sharing
  shareUrl: (platform, url, title) => ipcRenderer.send('share-url', platform, url, title),
  openExternal: (url) => ipcRenderer.send('open-external-url', url),
  
  // Add this method to handle popup windows
  handlePopupClick: (url) => {
    // This will be handled by the window open handler in main.js
    window.open(url, '_blank');
  },
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
      background: #f47521;
      border-radius: 5px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: #ff8c3e;
    }
    
    /* Tam ekran video oynatıcı kontrolleri için stil */
    .video-fullscreen .vjs-control-bar {
      z-index: 9999 !important;
      bottom: 48px !important;
      position: fixed !important;
    }
  `;
  document.head.appendChild(style);
  

  const script = document.createElement('script');
  script.textContent = `

    const originalWindowOpen = window.open;
    

    window.open = function(url, target, features) {

      if (url) {
        window.parent.postMessage({ type: 'open-external-url', url: url }, '*');
      }

      return {
        closed: true,
        close: function() {},
        focus: function() {},
        blur: function() {}
      };
    };
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
  
  // Add this code to handle webview new-window events
  const webview = document.getElementById('webview');
  if (webview) {
    webview.addEventListener('new-window', (e) => {
      const protocol = new URL(e.url).protocol;
      if (protocol === 'http:' || protocol === 'https:') {
        // If it's your domain, load it in the webview
        const domain = new URL(e.url).hostname;
        if (domain.includes('animelook.com')) {
          webview.src = e.url;
        } else {
          // For external links, open in default browser
          window.electronAPI.openExternal(e.url);
        }
      }
    });
  }
});