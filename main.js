const { app, BrowserWindow, shell, ipcMain, Menu, Tray, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const updater = require('./updater');


const store = new Store({
  name: 'settings',
  defaults: {
    startAtBoot: false,
    runInBackground: true,
    performanceMode: 'balanced' 
  }
});


let mainWindow = null;
let pipWindow = null;
let tray = null;
let isQuitting = false;
let currentUrl = "https://animelook.net/";
let splashWindow = null;

// Set auto launch settings
const setAutoLaunch = (enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe')
  });
};

// Apply performance settings based on mode
function applyPerformanceSettings(mode) {
  if (!mainWindow) return;
  
  switch (mode) {
    case 'performance':
      mainWindow.webContents.setAudioMuted(false);
      app.commandLine.appendSwitch('enable-gpu-rasterization');
      app.commandLine.appendSwitch('enable-zero-copy');
      break;
    case 'battery-saver':
      mainWindow.webContents.setAudioMuted(true);
      app.commandLine.appendSwitch('disable-gpu');
      app.commandLine.appendSwitch('disable-smooth-scrolling');
      break;
    case 'balanced':
    default:
      mainWindow.webContents.setAudioMuted(false);
      break;
  }
}

// Create the splash window
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 400,
    transparent: false,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    icon: path.join(__dirname, 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  splashWindow.loadFile('splash.html');
  
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });
  
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

// Create the main application window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:animelook',
      // Çerezleri ve oturum bilgilerini kaydetmek için
      cache: true,
      persistentCookies: true
    },
    frame: false, 
    backgroundColor: '#2e2c29',
    show: false // Don't show immediately
  });

  mainWindow.loadFile('index.html');
  
  // Set up event listeners for the main window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Eğer animelook.net domain'ine aitse aynı pencerede aç
    if (url.includes('animelook.net')) {
      return { action: 'allow' };
    }
    // Diğer linkleri dış tarayıcıda aç
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Start in maximized mode (pencereli tam ekran)
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    // Gerçek tam ekran modunu kaldırdık, sadece maximize edilmiş pencere kullanıyoruz
    // mainWindow.setFullScreen(true);
  });

  mainWindow.webContents.on('did-start-loading', () => {
    mainWindow.webContents.send('loading', true);
  });

  mainWindow.webContents.on('did-stop-loading', () => {
    mainWindow.webContents.send('loading', false);
  });
  
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen-change', true);
  });
  
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen-change', false);
  });

  mainWindow.webContents.on('did-navigate-in-page', (event, url) => {
    currentUrl = url;
    console.log('URL değişti (in-page):', currentUrl);
  });
  
  mainWindow.webContents.on('did-navigate', (event, url) => {
    currentUrl = url;
    console.log('URL değişti:', currentUrl);
  });
  
  function setupWebviewListeners() {
    mainWindow.webContents.executeJavaScript(`
      const webviewElement = document.getElementById('webview');
      if (webviewElement) {
        webviewElement.removeEventListener('did-navigate', updateUrlHandler);
        webviewElement.removeEventListener('did-navigate-in-page', updateUrlHandler);
        
        function updateUrlHandler() {
          const url = webviewElement.getURL();
          window.electronAPI.updateCurrentUrl(url);
        }
        
        webviewElement.addEventListener('did-navigate', updateUrlHandler);
        webviewElement.addEventListener('did-navigate-in-page', updateUrlHandler);
        
        webviewElement.addEventListener('dom-ready', updateUrlHandler);
      }
    `).catch(err => console.error('Webview URL izleme hatası:', err));
  }
  
  setupWebviewListeners();
  
  mainWindow.webContents.on('did-finish-load', setupWebviewListeners);
  mainWindow.webContents.on('did-navigate', setupWebviewListeners);

  mainWindow.on('close', (event) => {
    if (!isQuitting && store.get('runInBackground')) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });
}

// Create the PiP window
function createPipWindow(url, videoElement) {
  const { width: screenWidth, height: screenHeight } = require('electron').screen.getPrimaryDisplay().workAreaSize;
  
  pipWindow = new BrowserWindow({
    width: 400,
    height: 225,
    x: screenWidth - 420,
    y: screenHeight - 245,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    icon: path.join(__dirname, 'assets/icon.ico'), 
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:animelook' // Ensure same partition is used
    },
    backgroundColor: '#1a1a1a',
    minWidth: 320,
    minHeight: 180,
    maxWidth: 800,
    maxHeight: 450
  });
  
  const pipHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>
      body {
        margin: 0;
        padding: 0;
        overflow: hidden;
        background-color: #1a1a1a;
        display: flex;
        flex-direction: column;
        height: 100vh;
      }
      
      /* PiP Üst Bar */
      #pip-titlebar {
        height: 28px;
        background-color: #1a1a1a;
        display: flex;
        align-items: center;
        justify-content: space-between;
        -webkit-app-region: drag;
        user-select: none;
        border-bottom: 1px solid #333;
        padding: 0 8px;
      }
      
      .pip-title {
        font-size: 12px;
        font-weight: 500;
        color: #2196F3;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }
      
      .pip-close-button {
        background: transparent;
        border: none;
        color: #ccc;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        outline: none;
        border-radius: 3px;
        -webkit-app-region: no-drag;
      }
      
      .pip-close-button:hover {
        background-color: #e81123;
        color: #fff;
      }
      
      /* Webview */
      #pip-content {
        flex: 1;
        overflow: hidden;
      }
      
      #pip-webview {
        width: 100%;
        height: 100%;
        border: none;
      }
    </style>
  </head>
  <body>
    <div id="pip-titlebar">
      <div class="pip-title">AnimeLook Video</div>
      <button id="pip-close-button" class="pip-close-button">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div id="pip-content">
      <webview id="pip-webview" src="${url}" webpreferences="contextIsolation=yes, nodeIntegration=no" partition="persist:animelook"></webview>
    </div>
  </body>
  </html>
  `;
  
  const pipHtmlPath = path.join(app.getPath('temp'), 'pip-window.html');
  fs.writeFileSync(pipHtmlPath, pipHtml);
  
  pipWindow.loadFile(pipHtmlPath);
  
  pipWindow.webContents.on('did-finish-load', () => {
    pipWindow.webContents.executeJavaScript(`
      const pipWebview = document.getElementById('pip-webview');
      
      function findAndFocusMediaElement() {
        pipWebview.executeJavaScript(
          \`(function() {
            const mediaSelectors = [
              'video',
              'iframe',
              '.video-js', '.jw-video', '.plyr', '.video-container', '.player-container',
              '.anime-video', '.episode-video', '.video-frame',
              '.html5-video-player', '.vjs-tech', '.mejs__mediaelement',
              '[class*="player"]', '[id*="player"]', '[class*="video"]', '[id*="video"]'
            ];
            
            const allMediaElements = document.querySelectorAll(mediaSelectors.join(', '));
            
            if (allMediaElements.length > 0) {
              allMediaElements[0].scrollIntoView({behavior: 'smooth', block: 'center'});
              console.log('PiP: Medya elementi bulundu ve odaklandı: ' + allMediaElements[0].tagName);
              
              if (allMediaElements[0].tagName.toLowerCase() === 'iframe') {
                allMediaElements[0].style.display = 'block';
                allMediaElements[0].style.visibility = 'visible';
                allMediaElements[0].style.opacity = '1';
                
                let parent = allMediaElements[0].parentElement;
                while (parent) {
                  const style = window.getComputedStyle(parent);
                  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                    parent.style.display = 'block';
                    parent.style.visibility = 'visible';
                    parent.style.opacity = '1';
                  }
                  parent = parent.parentElement;
                }
              }
              
              return true;
            }
            
            console.log('PiP: Hiçbir medya elementi bulunamadı');
            return false;
          })()\`
        ).catch(err => console.error('PiP medya arama hatası:', err));
      }
      
      pipWebview.addEventListener('dom-ready', () => {
        findAndFocusMediaElement();
        
        pipWebview.executeJavaScript(\`
          if (window.pipMutationObserver) {
            window.pipMutationObserver.disconnect();
          }
          
          window.pipMutationObserver = new MutationObserver((mutations) => {
            console.log('PiP: DOM değişikliği algılandı, medya elementleri kontrol ediliyor...');
            
            clearTimeout(window.pipMediaCheckTimeout);
            window.pipMediaCheckTimeout = setTimeout(() => {
              const mediaSelectors = [
                'video', 'iframe', '.video-js', '.jw-video', '.plyr', '.video-container', '.player-container',
                '.anime-video', '.episode-video', '.video-frame', '.html5-video-player', '.vjs-tech',
                '[class*="player"]', '[id*="player"]', '[class*="video"]', '[id*="video"]'
              ];
              
              const allMediaElements = document.querySelectorAll(mediaSelectors.join(', '));
              
              if (allMediaElements.length > 0) {
                allMediaElements[0].scrollIntoView({behavior: 'smooth', block: 'center'});
                console.log('PiP: DOM değişikliği sonrası medya elementi bulundu: ' + allMediaElements[0].tagName);
              }
            }, 500); 
          });
          
          window.pipMutationObserver.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'style', 'class']
          });
          
          console.log('PiP: DOM değişikliklerini izleme başlatıldı');
        \`).catch(err => console.error('PiP MutationObserver hatası:', err));
      });
      
      pipWebview.addEventListener('did-navigate', () => {
        console.log('PiP: Sayfa değişti, medya elementleri aranıyor...');
        setTimeout(findAndFocusMediaElement, 500);
        setTimeout(findAndFocusMediaElement, 1500);
        setTimeout(findAndFocusMediaElement, 3000);
      });
      
      pipWebview.addEventListener('did-navigate-in-page', () => {
        console.log('PiP: Sayfa içi navigasyon, medya elementleri aranıyor...');
        setTimeout(findAndFocusMediaElement, 500);
        setTimeout(findAndFocusMediaElement, 1500);
      });
      
      pipWebview.addEventListener('did-start-loading', () => {
        console.log('PiP: Sayfa yükleniyor...');
      });
      
      pipWebview.addEventListener('did-stop-loading', () => {
        console.log('PiP: Sayfa yüklendi, medya elementleri aranıyor...');
        setTimeout(findAndFocusMediaElement, 500);
        setTimeout(findAndFocusMediaElement, 1500);
        setTimeout(findAndFocusMediaElement, 3000);
      });
    `);
    
    pipWindow.webContents.executeJavaScript(`
      document.getElementById('pip-close-button').addEventListener('click', () => {
        window.close();
      });
    `);
  });

  pipWindow.setAlwaysOnTop(true, 'screen-saver');
  pipWindow.setVisibleOnAllWorkspaces(true);
  
  pipWindow.on('closed', () => {
    pipWindow = null;
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Close the PiP window
function closePipWindow() {
  if (pipWindow) {
    pipWindow.close();
    pipWindow = null;
  }
  
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('pip-mode-change', false);
  }
}

// Create the system tray
function createTray() {
  tray = new Tray(path.join(__dirname, 'assets/icon.ico'));
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'AnimeLooku Aç', 
      click: () => { mainWindow.show(); }
    },
    { 
      label: 'Ayarlar', 
      click: () => { 
        mainWindow.show();
        mainWindow.webContents.send('open-settings'); 
      }
    },
    { type: 'separator' },
    { 
      label: 'Çıkış', 
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('AnimeLook');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Set up IPC communication
function setupIPC() {
  ipcMain.on('toggle-mini-mode', (event, isActive) => {
    if (!mainWindow) return;
    
    if (isActive) {
      const { width: screenWidth, height: screenHeight } = require('electron').screen.getPrimaryDisplay().workAreaSize;
      mainWindow.setSize(400, 300);
      mainWindow.setPosition(screenWidth - 420, screenHeight - 320);
      mainWindow.setAlwaysOnTop(true, 'floating');
      mainWindow.setVisibleOnAllWorkspaces(true);
      mainWindow.setSkipTaskbar(false);
    } else {
      mainWindow.setSize(1200, 800);
      mainWindow.center();
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setVisibleOnAllWorkspaces(false);
      mainWindow.setSkipTaskbar(false);
    }

    mainWindow.webContents.send('mini-mode-change', isActive);
  });
  
  ipcMain.on('toggle-pip-mode', (event, url, hasVideo, videoElement) => {
    if (!pipWindow && hasVideo) {
      const pipUrl = url || currentUrl;
      console.log('PiP modu başlatılıyor, URL:', pipUrl);
      
      createPipWindow(pipUrl, videoElement);
      mainWindow.hide();
      mainWindow.webContents.send('pip-mode-change', true);
    } else if (pipWindow) {
      closePipWindow();
    } else {
      mainWindow.webContents.send('pip-error', 'Bu sayfada video veya iframe bulunamadı!');
    }
  });
  
  ipcMain.on('close-pip-window', () => {
    closePipWindow();
  });
  
  ipcMain.handle('get-current-url', () => {
    return currentUrl;
  });
  
  ipcMain.on('update-current-url', (event, url) => {
    currentUrl = url;
    console.log('URL güncellendi:', currentUrl);
  });
  
  ipcMain.on('open-external-url', (event, url) => {
    shell.openExternal(url);
  });

  ipcMain.on('window-control', (event, action) => {
    if (!mainWindow) return;
    
    switch (action) {
      case 'minimize':
        mainWindow.minimize();
        break;
      case 'maximize':
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow.maximize();
        }
        break;
      case 'close':
        if (store.get('runInBackground')) {
          mainWindow.hide();
        } else {
          isQuitting = true;
          app.quit();
        }
        break;
      case 'hide':
        mainWindow.hide();
        break;
      case 'show':
        mainWindow.show();
        mainWindow.focus();
        break;
      case 'back':
        if (mainWindow.webContents.canGoBack()) {
          mainWindow.webContents.goBack();
        }
        break;
      case 'forward':
        if (mainWindow.webContents.canGoForward()) {
          mainWindow.webContents.goForward();
        }
        break;
      case 'reload':
        mainWindow.webContents.reload();
        break;
    }
  });

  ipcMain.on('save-settings', (event, settings) => {
    store.set('startAtBoot', settings.startAtBoot);
    store.set('runInBackground', settings.runInBackground);
    store.set('performanceMode', settings.performanceMode);
    
    setAutoLaunch(settings.startAtBoot);
    applyPerformanceSettings(settings.performanceMode);
    
    event.reply('settings-saved', true);
  });

  ipcMain.handle('get-settings', async () => {
    return {
      startAtBoot: store.get('startAtBoot'),
      runInBackground: store.get('runInBackground'),
      performanceMode: store.get('performanceMode')
    };
  });
  
  // Add handler for app version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  // Add these new IPC handlers for updates
  ipcMain.on('check-for-updates', () => {
    updater.checkForUpdates();
  });

  ipcMain.on('download-update', () => {
    updater.downloadUpdate();
  });

  ipcMain.on('install-update', () => {
    updater.installUpdate();
  });
  
  ipcMain.on('show-main-window', () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    
    // Ana pencere henüz oluşturulmadıysa oluştur
    if (!mainWindow) {
      createWindow();
      // Ana pencere oluşturulduktan sonra updater'ı güncelle
      updater.initUpdater(mainWindow, null);
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Tek instance çalışmasını sağla
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Eğer başka bir instance zaten çalışıyorsa, bu instance'ı kapat
  app.quit();
} else {
  // İkinci bir instance başlatılmaya çalışıldığında
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Eğer ana pencere varsa, minimize edilmişse restore et ve focus ver
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  // App initialization
  app.whenReady().then(() => {
    // Set up IPC handlers first
    setupIPC();
    
    // Create splash window first
    createSplashWindow();
    
    // Create system tray
    createTray();
    
    // Initialize updater with splash window only initially
    updater.initUpdater(null, splashWindow);
    
    // Apply settings
    setAutoLaunch(store.get('startAtBoot'));
    applyPerformanceSettings(store.get('performanceMode'));
    
    // Main window will be created after splash screen checks are complete
    // This is handled by the 'show-main-window' IPC event
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow) {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});