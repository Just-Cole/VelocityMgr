// electron.js

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs =require('fs');

const isDev = process.env.NODE_ENV !== 'production';

let mainWindow;
let backendProcess;

// Load config.json to get ports
let config = { backend_port: 3005, frontend_port: 9002 };
const configPath = path.resolve(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
    try {
        config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) };
    } catch (e) {
        console.error('Electron: Error reading config.json:', e);
    }
}

const frontendPort = config.frontend_port || 9002;
const backendPort = config.backend_port || 3005;

function startBackend() {
  const backendPath = path.join(__dirname, 'src', 'backend', 'src', 'index.js');
  
  // Set the BACKEND_PORT env var for the child process
  const env = { ...process.env, BACKEND_PORT: backendPort };
  
  backendProcess = fork(backendPath, [], { silent: true, env });

  backendProcess.stdout.on('data', (data) => {
    console.log(`Backend STDOUT: ${data.toString()}`);
  });
  backendProcess.stderr.on('data', (data) => {
    console.error(`Backend STDERR: ${data.toString()}`);
  });
  backendProcess.on('exit', (code) => {
    console.log(`Backend process exited with code ${code}`);
    // Optionally, you can try to restart it or notify the user
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // In development, load from the Next.js dev server.
  // In production, load the static HTML file.
  const startUrl = isDev
    ? `http://localhost:${frontendPort}`
    : `file://${path.join(__dirname, 'dist', 'index.html')}`; // This path assumes Next.js static export

  mainWindow.loadURL(startUrl);

  // Open external links in the default browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  console.log('App is ready. Starting backend and creating window...');
  startBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  // On macOS it's common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Kill the backend process when the Electron app quits
  if (backendProcess) {
    console.log('Quitting app, terminating backend process...');
    backendProcess.kill();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});
