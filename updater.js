const { app, dialog, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const axios = require('axios');
const semver = require('semver');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const GITHUB_OWNER = 'averoswastaken';
const GITHUB_REPO = 'AnimeLook-Desktop';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

let updateAvailable = false;
let updateDownloaded = false;
let updateInfo = null;
let mainWindow = null;

autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

// Force updates in development mode
autoUpdater.forceDevUpdateConfig = true;

// Initialize updater
// Add these variables at the top
let splashWindow = null;
let isStartupCheck = true;

// Update the initUpdater function to ensure proper timing
function initUpdater(window, splash) {
  mainWindow = window;
  splashWindow = splash;
  
  setTimeout(checkForUpdates, 1000);

  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow('Güncellemeler kontrol ediliyor...');
    sendStatusToSplash('Güncellemeler kontrol ediliyor...', false);
  });
  
  autoUpdater.on('update-available', (info) => {
    updateAvailable = true;
    updateInfo = info;
    sendStatusToWindow('Güncelleme mevcut', info);
    
    if (isStartupCheck) {
      sendStatusToSplash(`Güncelleme indiriliyor: ${info.version}`, true);
      autoUpdater.downloadUpdate();
    } else {
      showUpdateNotification(info);
    }
  });
  
  autoUpdater.on('update-not-available', () => {
    sendStatusToWindow('Uygulama güncel');
    
    if (isStartupCheck) {
      sendStatusToSplash('Uygulama güncel, başlatılıyor...', false);
      setTimeout(() => {
        if (splashWindow) {
          splashWindow.webContents.send('app-ready');
        }
      }, 500);
      isStartupCheck = false;
    }
  });
  
  autoUpdater.on('error', (err) => {
    sendStatusToWindow('Güncelleme hatası', err);
    
    if (isStartupCheck) {
      sendStatusToSplash('Güncelleme kontrolü başarısız, uygulama başlatılıyor...', false);
      setTimeout(() => {
        if (splashWindow) {
          splashWindow.webContents.send('app-ready');
        }
      }, 500);
      isStartupCheck = false;
    }
  });
  
  autoUpdater.on('download-progress', (progressObj) => {
    let message = `İndiriliyor: ${Math.round(progressObj.percent)}%`;
    sendStatusToWindow(message, progressObj);
    
    if (isStartupCheck) {
      sendStatusToSplash('Güncelleme indiriliyor...', true, progressObj.percent);
    }
  });
  
  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true;
    sendStatusToWindow('Güncelleme indirildi', info);
    
    if (isStartupCheck) {
      sendStatusToSplash('Güncelleme indirildi, uygulanıyor...', true, 100);
      setTimeout(() => {
        installUpdate();
      }, 1000);
    } else {
      showUpdateDownloadedNotification(info);
    }
  });
}

function sendStatusToSplash(message, isUpdating, progress) {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('splash-update-status', {
        message,
        isUpdating,
        progress
      });
    }
  }

async function checkForUpdates() {
  try {
    autoUpdater.checkForUpdates().catch(err => {
      console.log('electron-updater ile kontrol başarısız, GitHub API kullanılıyor:', err);
      checkForUpdatesManually();
    });
  } catch (error) {
    console.error('Güncelleme kontrolü başlatılamadı:', error);
    checkForUpdatesManually();
  }
}

async function checkForUpdatesManually() {
  try {
    const response = await axios.get(GITHUB_API_URL);
    const latestRelease = response.data;
    const latestVersion = latestRelease.tag_name.replace('v', '');
    const currentVersion = app.getVersion();
    
    if (semver.gt(latestVersion, currentVersion)) {
      updateAvailable = true;
      updateInfo = {
        version: latestVersion,
        releaseDate: new Date(latestRelease.published_at),
        releaseNotes: latestRelease.body,
        downloadUrl: getAssetDownloadUrl(latestRelease)
      };
      
      sendStatusToWindow('Güncelleme mevcut', updateInfo);
      showUpdateNotification(updateInfo);
    } else {
      sendStatusToWindow('Uygulama güncel');
    }
  } catch (error) {
    console.error('GitHub API ile güncelleme kontrolü hatası:', error);
    sendStatusToWindow('Güncelleme kontrolü başarısız', error);
  }
}

function getAssetDownloadUrl(release) {
  const assets = release.assets;
  const windowsAsset = assets.find(asset => 
    asset.name.endsWith('.exe') && 
    asset.name.includes('setup') && 
    !asset.name.includes('debug')
  );
  
  return windowsAsset ? windowsAsset.browser_download_url : null;
}

function sendStatusToWindow(message, data = null) {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', { message, data });
  }
  console.log(message, data);
}

function showUpdateNotification(info) {
  if (!mainWindow) return;
  
  mainWindow.webContents.send('update-available', info);
}

function showUpdateDownloadedNotification(info) {
  if (!mainWindow) return;
  
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Güncelleme Hazır',
    message: `AnimeLook ${info.version} sürümü indirildi.`,
    detail: 'Uygulama kapatılıp yeni sürüm kurulacak. Devam etmek istiyor musunuz?',
    buttons: ['Şimdi Yükle', 'Daha Sonra'],
    defaultId: 0
  }).then(({ response }) => {
    if (response === 0) {
      installUpdate();
    }
  });
}

function installUpdate() {
  if (updateDownloaded) {
    autoUpdater.quitAndInstall(false, true);
  } else if (updateAvailable && updateInfo && updateInfo.downloadUrl) {
    downloadAndInstallManually(updateInfo.downloadUrl);
  }
}

async function downloadAndInstallManually(downloadUrl) {
  try {
    sendStatusToWindow('Güncelleme indiriliyor...');
    
    const tempDir = path.join(app.getPath('temp'), 'animelook-updates');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const installerPath = path.join(tempDir, 'AnimeLook-Setup.exe');
    
    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream'
    });
    
    const writer = fs.createWriteStream(installerPath);
    response.data.pipe(writer);
    
    writer.on('finish', () => {
      sendStatusToWindow('Güncelleme indirildi, kurulum başlatılıyor...');
      
      const installer = spawn(installerPath, ['--updated'], {
        detached: true,
        stdio: 'ignore'
      });
      
      installer.unref();
      app.quit();
    });
    
    writer.on('error', (err) => {
      sendStatusToWindow('İndirme hatası', err);
    });
  } catch (error) {
    sendStatusToWindow('Güncelleme indirme hatası', error);
  }
}

function isUpdateAvailable() {
  return updateAvailable;
}

function downloadUpdate() {
  if (updateAvailable && !updateDownloaded) {
    if (autoUpdater.autoDownload === false) {
      autoUpdater.downloadUpdate();
    } else if (updateInfo && updateInfo.downloadUrl) {
      downloadAndInstallManually(updateInfo.downloadUrl);
    }
  }
}

module.exports = {
  initUpdater,
  checkForUpdates,
  isUpdateAvailable,
  downloadUpdate,
  installUpdate,
  sendStatusToSplash
};
