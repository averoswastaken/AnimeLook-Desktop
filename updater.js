const { app, dialog, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const axios = require('axios');
const semver = require('semver');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// GitHub repository information
// Update these lines in your updater.js file
const GITHUB_OWNER = 'averoswastaken';
const GITHUB_REPO = 'AnimeLook-Desktop';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

// Update states
let updateAvailable = false;
let updateDownloaded = false;
let updateInfo = null;
let mainWindow = null;

// Configure logging
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

// Force updates in development mode
autoUpdater.forceDevUpdateConfig = true;

// Initialize updater
// Add these variables at the top
let splashWindow = null;
let isStartupCheck = true;

// Update the initUpdater function
function initUpdater(window, splash) {
  mainWindow = window;
  splashWindow = splash;
  
  // Check for updates on app start
  setTimeout(checkForUpdates, 1000);
  
  // Set up event handlers
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

// Add this function to send status to splash screen
function sendStatusToSplash(message, isUpdating, progress) {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('splash-update-status', {
        message,
        isUpdating,
        progress
      });
    }
  }

// Check for updates using GitHub API
async function checkForUpdates() {
  try {
    // First try with electron-updater
    autoUpdater.checkForUpdates().catch(err => {
      console.log('electron-updater ile kontrol başarısız, GitHub API kullanılıyor:', err);
      checkForUpdatesManually();
    });
  } catch (error) {
    console.error('Güncelleme kontrolü başlatılamadı:', error);
    checkForUpdatesManually();
  }
}

// Manual update check using GitHub API
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

// Get download URL for the appropriate asset
function getAssetDownloadUrl(release) {
  const assets = release.assets;
  // Look for Windows installer (.exe)
  const windowsAsset = assets.find(asset => 
    asset.name.endsWith('.exe') && 
    asset.name.includes('setup') && 
    !asset.name.includes('debug')
  );
  
  return windowsAsset ? windowsAsset.browser_download_url : null;
}

// Send update status to renderer process
function sendStatusToWindow(message, data = null) {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', { message, data });
  }
  console.log(message, data);
}

// Show notification about available update
function showUpdateNotification(info) {
  if (!mainWindow) return;
  
  mainWindow.webContents.send('update-available', info);
}

// Show notification that update is downloaded and ready
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

// Install the update
function installUpdate() {
  if (updateDownloaded) {
    autoUpdater.quitAndInstall(false, true);
  } else if (updateAvailable && updateInfo && updateInfo.downloadUrl) {
    downloadAndInstallManually(updateInfo.downloadUrl);
  }
}

// Manual download and install for GitHub releases
async function downloadAndInstallManually(downloadUrl) {
  try {
    sendStatusToWindow('Güncelleme indiriliyor...');
    
    // Check if URL is valid
    if (!downloadUrl) {
      throw new Error('Geçerli indirme URL\'si bulunamadı');
    }
    
    // Log the URL we're trying to download from
    console.log('Trying to download from:', downloadUrl);
    
    // Try to get the release directly from GitHub API as fallback
    if (downloadUrl.includes('github.com') && downloadUrl.includes('404')) {
      console.log('GitHub 404 error, trying alternative download method...');
      try {
        const releaseResponse = await axios.get(GITHUB_API_URL);
        const assets = releaseResponse.data.assets || [];
        const exeAsset = assets.find(a => a.name.endsWith('.exe'));
        
        if (exeAsset && exeAsset.browser_download_url) {
          downloadUrl = exeAsset.browser_download_url;
          console.log('Found alternative download URL:', downloadUrl);
        }
      } catch (err) {
        console.error('Failed to get alternative download URL:', err);
      }
    }
    
    const tempDir = path.join(app.getPath('temp'), 'animelook-updates');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const installerPath = path.join(tempDir, 'AnimeLook-Setup.exe');
    
    // Download the file with better error handling
    try {
      const response = await axios({
        method: 'GET',
        url: downloadUrl,
        responseType: 'stream',
        timeout: 30000, // 30 second timeout
        validateStatus: status => status === 200
      });
      
      const writer = fs.createWriteStream(installerPath);
      response.data.pipe(writer);
      
      writer.on('finish', () => {
        sendStatusToWindow('Güncelleme indirildi, kurulum başlatılıyor...');
        
        // Run the installer
        const installer = spawn(installerPath, ['--updated'], {
          detached: true,
          stdio: 'ignore'
        });
        
        installer.unref();
        
        // Quit the app after a short delay
        setTimeout(() => {
          app.exit(0);
        }, 1000);
      });
      
      writer.on('error', (err) => {
        sendStatusToWindow('İndirme hatası', err);
        console.error('Download write error:', err);
      });
    } catch (downloadError) {
      console.error('Download request failed:', downloadError);
      sendStatusToWindow('İndirme başarısız', downloadError);
      
      // Notify user about manual download option
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Otomatik Güncelleme Başarısız',
          message: 'Güncelleme indirilemedi.',
          detail: 'Lütfen en son sürümü GitHub sayfasından manuel olarak indirin.',
          buttons: ['GitHub\'a Git', 'İptal'],
          defaultId: 0
        }).then(({ response }) => {
          if (response === 0) {
            shell.openExternal(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`);
          }
        });
      }
    }
  } catch (error) {
    console.error('Manuel indirme hatası:', error);
    sendStatusToWindow('İndirme başarısız', error);
  }
}

// Check if update is available
function isUpdateAvailable() {
  return updateAvailable;
}

// Download update manually
function downloadUpdate() {
  if (updateAvailable && !updateDownloaded) {
    if (autoUpdater.autoDownload === false) {
      autoUpdater.downloadUpdate();
    } else if (updateInfo && updateInfo.downloadUrl) {
      downloadAndInstallManually(updateInfo.downloadUrl);
    }
  }
}

// Export the updated functions
module.exports = {
  initUpdater,
  checkForUpdates,
  isUpdateAvailable,
  downloadUpdate,
  installUpdate,
  sendStatusToSplash
};