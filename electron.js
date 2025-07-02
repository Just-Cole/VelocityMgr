
// electron.js

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs =require('fs');
const waitOn = require('wait-on');

const isDev = process.env.NODE_ENV !== 'production';

let mainWindow;
let backendProcess;
let frontendProcess;

// Load config.json to get ports
let config = { backend_port: 9002, frontend_port: 9000 };
const configPath = path.resolve(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
    try {
        config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) };
    } catch (e) {
        console.error('Electron: Error reading config.json:', e);
    }
}

const frontendPort = config.frontend_port || 9000;
const backendPort = config.backend_port || 9002;

function startBackend() {
  const backendPath = path.join(__dirname, 'src', 'backend', 'src', 'index.js');
  
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
  });
}

function startFrontendProd() {
    // Use the direct path to the Next.js CLI script for reliability in packaged apps
    const nextCliPath = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
    const env = { ...process.env, BACKEND_PORT: backendPort }; 
    
    frontendProcess = fork(nextCliPath, ['start', '-p', frontendPort], {
        cwd: __dirname,
        silent: true,
        env: env,
    });

    frontendProcess.stdout.on('data', (data) => {
        console.log(`Frontend STDOUT: ${data.toString()}`);
    });
    frontendProcess.stderr.on('data', (data) => {
        console.error(`Frontend STDERR: ${data.toString()}`);
    });
    frontendProcess.on('exit', (code) => {
        console.log(`Frontend process exited with code ${code}`);
    });
}


async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#111111',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const startUrl = `http://localhost:${frontendPort}`;
  
  if (!isDev) {
    try {
      // Wait for the Next.js server to be ready before loading the URL
      await waitOn({ resources: [startUrl], timeout: 30000 });
    } catch (err) {
      console.error('Error waiting for frontend to start:', err);
      // Allow it to try loading the URL so the user sees an error page.
    }
  }

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

// Make the ready handler async to allow for awaiting createWindow
app.on('ready', async () => {
  console.log('App is ready. Starting servers and creating window...');
  startBackend();
  
  if (!isDev) {
    startFrontendProd();
  }
  
  // Await the window creation, which itself awaits for the server to be ready
  await createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Kill child processes when the Electron app quits
  if (backendProcess) {
    console.log('Quitting app, terminating backend process...');
    backendProcess.kill();
  }
  if (frontendProcess) {
    console.log('Quitting app, terminating frontend process...');
    frontendProcess.kill();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
