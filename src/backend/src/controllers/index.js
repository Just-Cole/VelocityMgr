// backend/controllers/index.js
const fs = require('fs');
const fsPromises = require('fs').promises; // For async file operations
const path = require('path');
const https = require('https');
const {
    spawn
} = require('child_process');
const crypto = require('crypto');
const util = require('util');
const pidusage = require('pidusage');
const os = require('os');
const TOML = require('@iarna/toml');


const isPackagedElectron = process.versions && process.versions.electron && process.mainModule && process.mainModule.filename.includes('app.asar');
let APP_DATA_ROOT;

if (isPackagedElectron) {
    APP_DATA_ROOT = path.resolve(process.resourcesPath, '..');
    console.log(`[Controller] Packaged app. APP_DATA_ROOT set to: ${APP_DATA_ROOT}`);
} else {
    APP_DATA_ROOT = path.join(__dirname, '..', '..', 'app_data');
    console.log(`[Controller] Development app. APP_DATA_ROOT set to: ${APP_DATA_ROOT}`);
}

try {
    if (!fs.existsSync(APP_DATA_ROOT)) {
        fs.mkdirSync(APP_DATA_ROOT, {
            recursive: true
        });
        console.log(`Created main app data directory at ${APP_DATA_ROOT}`);
    }
} catch (e) {
    console.error(`CRITICAL: Failed to create or access APP_DATA_ROOT at ${APP_DATA_ROOT}`, e);
}


const SERVERS_FILE_PATH = path.join(APP_DATA_ROOT, 'servers.json');
const PROXIES_FILE_PATH = path.join(APP_DATA_ROOT, 'proxies.json');
const CONFIG_FILE_PATH = path.join(APP_DATA_ROOT, 'config.json');
const MAIN_SERVERS_DIR = path.join(APP_DATA_ROOT, 'servers');
const RECOVERY_DIR = path.join(APP_DATA_ROOT, 'recovery');
const BACKUPS_DIR = path.join(APP_DATA_ROOT, 'backups');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

// Password Hashing Constants
const SALT_LENGTH = 16;
const HASH_ITERATIONS = 100000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';

// Helper to sanitize folder names
const sanitize = (name) => String(name).replace(/[^a-zA-Z0-9_.-]/g, '_');


// Helper function to find a file recursively within a directory.
const findFileRecursive = async (dir, fileName) => {
    try {
        const entries = await fsPromises.readdir(dir, {
            withFileTypes: true
        });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const found = await findFileRecursive(fullPath, fileName);
                if (found) return found;
            } else if (entry.name === fileName) {
                return fullPath;
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') console.error(`Error during recursive find in ${dir}:`, err);
    }
    return null;
};


// Password Hashing Helper Functions
function hashPassword(password, saltProvided) {
    const salt = saltProvided || crypto.randomBytes(SALT_LENGTH).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString('hex');
    return `${salt}$${hash}`;
}

const downloadFile = (url, targetDir, targetFilename = null) => {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'VelocityManager/1.0 (contact@example.com)'
            }
        }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                downloadFile(response.headers.location, targetDir, targetFilename).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download file: ${response.statusCode} ${response.statusMessage}`));
                response.resume();
                return;
            }

            let finalFilename = targetFilename;
            if (!finalFilename) {
                const contentDisposition = response.headers['content-disposition'];
                if (contentDisposition) {
                    const match = /filename="([^"]+)"/.exec(contentDisposition);
                    if (match && match[1]) {
                        finalFilename = match[1];
                    }
                }
                if (!finalFilename) {
                    finalFilename = path.basename(new URL(url).pathname);
                }
            }

            const filePath = path.join(targetDir, finalFilename);
            const fileStream = fs.createWriteStream(filePath);
            response.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close(() => resolve(filePath));
            });

            fileStream.on('error', (err) => {
                fs.unlink(filePath, () => reject(err));
            });

        }).on('error', (err) => {
            reject(err);
        });
    });
};

const httpsGetJson = (url) => {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'VelocityManager/1.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // Handle redirect
                return httpsGetJson(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
                const err = new Error(`Request Failed. Status Code: ${res.statusCode}`);
                err.statusCode = res.statusCode;
                res.resume(); // Consume response data to free up memory
                return reject(err);
            }

            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(rawData));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON response: ${e.message}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(new Error(`Request error: ${e.message}`));
        });

        req.end();
    });
};


class IndexController {
    constructor() {
        console.log("IndexController instantiated in backend/controllers");
        this.activeServerProcesses = {};
        this.activeLogFileStreams = {};
        this.stdoutBuffers = {};
        this.statsUpdateInterval = null;
        this.RECOVERY_DIR = RECOVERY_DIR;
        this.BACKUPS_DIR = BACKUPS_DIR;
        this.sanitize = sanitize;
        this.downloadFile = downloadFile;
        this.httpsGetJson = httpsGetJson;

        this._readConfig();
        this._initializeServerStates().catch(err => console.error("Critical error during server state initialization:", err));
        this.startStatsMonitoring();
    }
    
    _parseRamToBytes(ramString) {
        if (!ramString || typeof ramString !== 'string') return 0;
        const upper = ramString.toUpperCase();
        const value = parseInt(upper, 10);
        if (isNaN(value)) return 0;

        if (upper.endsWith('G')) {
            return value * 1024 * 1024 * 1024;
        }
        if (upper.endsWith('M')) {
            return value * 1024 * 1024;
        }
        return value;
    }

    async _updateServerPropertiesPort(server, newPort) {
        // This is a specific utility. The more generic updateServerProperties should be used for UI-driven changes.
        // This function is useful for initial setup or specific automated tasks.
        if (server.softwareType === 'Velocity') {
            return;
        }
        const serverRootPath = this._getServerFolderPath(server);
        if (!serverRootPath) return;
        const serverPropsPath = path.join(serverRootPath, 'server.properties');
        try {
            let content = '';
            if (fs.existsSync(serverPropsPath)) {
                content = await fsPromises.readFile(serverPropsPath, 'utf-8');
            }
            
            // This is a minimal helper. A more robust one would be in the server controller.
            let lines = content.split('\n');
            let found = false;
            lines = lines.map(line => {
                if (line.startsWith('server-port=')) {
                    found = true;
                    return `server-port=${newPort}`;
                }
                return line;
            });
            if (!found) {
                lines.push(`server-port=${newPort}`);
            }

            const newContent = lines.join('\n');
            await fsPromises.writeFile(serverPropsPath, newContent, 'utf-8');
        } catch (error) {
            console.error(`_updateServerPropertiesPort: Failed to update server.properties for server ${server.name}:`, error);
        }
    }

    async _updateAllServerStats() {
        let servers = this._readServers();
        if (!servers || servers.length === 0) return;
        let hasChanges = false;
        const pidPromises = servers.map(async (server, index) => {
            if (server.status === 'Online' && server.pid) {
                try {
                    const stats = await pidusage(server.pid);
                    const maxRamBytes = this._parseRamToBytes(server.maxRam);
                    const newCpu = parseFloat(stats.cpu.toFixed(1));
                    const newCurrentRam = Math.round(stats.memory / (1024 * 1024));
                    const newRamUsage = maxRamBytes > 0 ? Math.round((stats.memory / maxRamBytes) * 100) : 0;
                    if (servers[index].cpuUsage !== newCpu || servers[index].ramUsage !== newRamUsage || servers[index].currentRam !== newCurrentRam) {
                        servers[index].cpuUsage = newCpu;
                        servers[index].ramUsage = newRamUsage > 100 ? 100 : newRamUsage;
                        servers[index].currentRam = newCurrentRam;
                        hasChanges = true;
                    }
                } catch (e) {
                    this._cleanupServerProcess(server.id);
                    servers[index].status = 'Error';
                    servers[index].pid = undefined;
                    servers[index].cpuUsage = 0;
                    servers[index].ramUsage = 0;
                    servers[index].currentRam = 0;
                    hasChanges = true;
                }
            } else {
                if (server.cpuUsage !== 0 || server.ramUsage !== 0 || server.currentRam !== 0) {
                    servers[index].cpuUsage = 0;
                    servers[index].ramUsage = 0;
                    servers[index].currentRam = 0;
                    hasChanges = true;
                }
            }
        });
        await Promise.all(pidPromises);
        if (hasChanges) {
            this._writeServers(servers);
        }
    }

    startStatsMonitoring() {
        if (this.statsUpdateInterval) clearInterval(this.statsUpdateInterval);
        this.statsUpdateInterval = setInterval(() => this._updateAllServerStats(), 2500);
        console.log("Started server stats monitoring loop.");
    }

    stopStatsMonitoring() {
        if (this.statsUpdateInterval) {
            clearInterval(this.statsUpdateInterval);
            this.statsUpdateInterval = null;
        }
    }

    async _initializeServerStates() {
        console.log("Initializing server states...");
        let servers = this._readServers();
        let changesMade = false;
        for (let i = 0; i < servers.length; i++) {
            const server = servers[i];
            if (server.pid && (server.status === 'Online' || server.status === 'Starting' || server.status === 'restarting')) {
                try {
                    process.kill(server.pid, 0);
                    this.activeServerProcesses[server.id] = {
                        pid: server.pid,
                        recovered: true,
                        stdin: null
                    };
                } catch (e) {
                    servers[i].status = 'Offline';
                    servers[i].pid = undefined;
                    servers[i].connectedPlayers = [];
                    changesMade = true;
                    this._cleanupServerProcess(server.id);
                }
            } else if (server.pid && server.status === 'Offline') {
                servers[i].pid = undefined;
                changesMade = true;
            }
             if (servers[i].tags === undefined) {
              servers[i].tags = [];
              changesMade = true;
            }
        }
        if (changesMade) {
            this._writeServers(servers);
        }
    }

    _writeConfig(configData) {
        try {
            fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(configData, null, 2), 'utf-8');
        } catch (error) {
            console.error(`Error writing to ${CONFIG_FILE_PATH}:`, error);
        }
    }

    _readConfig() {
        let configData = {};
        let needsRewrite = false;
        try {
            if (fs.existsSync(CONFIG_FILE_PATH)) {
                configData = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf-8'));
            } else {
                needsRewrite = true;
            }
        } catch (error) {
            needsRewrite = true;
        }
        const availablePermissions = ["view_server_stats", "view_logs", "edit_configs", "start_stop_servers", "create_servers", "create_users", "assign_roles", "manage_roles", "manage_recovery", "manage_backups", "send_console_commands", "delete_server", "install_plugins"];
        configData.availablePermissions = availablePermissions;
        if (!configData.roles) {
            configData.roles = {
                "Admin": {
                    permissions: [...availablePermissions]
                },
                "Editor": {
                    permissions: ["view_server_stats", "view_logs", "edit_configs", "start_stop_servers", "create_servers", "manage_backups", "send_console_commands", "delete_server", "install_plugins"]
                },
                "Viewer": {
                    permissions: ["view_server_stats", "view_logs"]
                }
            };
            needsRewrite = true;
        }
        if (!configData.users) configData.users = [];
        configData.users = configData.users.map(user => {
            if (user.password && !user.password.includes('$')) {
                user.password = hashPassword(user.password);
                needsRewrite = true;
            }
            if (user.role && !user.roles) {
                user.roles = [user.role];
                delete user.role;
                needsRewrite = true;
            }
            if (!user.roles) user.roles = ["Viewer"];
            return user;
        });
        if (configData.users.length === 0) {
            configData.users.push({
                username: "admin",
                password: hashPassword("password"),
                roles: ["Admin"]
            });
            needsRewrite = true;
        }
        if (needsRewrite) this._writeConfig(configData);
        return configData;
    }

    _readServers() {
        try {
            if (fs.existsSync(SERVERS_FILE_PATH)) return JSON.parse(fs.readFileSync(SERVERS_FILE_PATH, 'utf-8'));
            return [];
        } catch (error) {
            return [];
        }
    }

    _writeServers(servers) {
        try {
            fs.writeFileSync(SERVERS_FILE_PATH, JSON.stringify(servers, null, 2), 'utf-8');
        } catch (error) {
            console.error(`Error writing to ${SERVERS_FILE_PATH}:`, error);
        }
    }

    _readProxies() {
        try {
            if (fs.existsSync(PROXIES_FILE_PATH)) return JSON.parse(fs.readFileSync(PROXIES_FILE_PATH, 'utf-8'));
            return [];
        } catch (error) {
            return [];
        }
    }

    _writeProxies(proxies) {
        try {
            fs.writeFileSync(PROXIES_FILE_PATH, JSON.stringify(proxies, null, 2), 'utf-8');
        } catch (error) {
            console.error("Error writing to proxies.json:", error);
        }
    }

    _getServerFolderPath(server) {
        if (!server || typeof server.id !== 'string') return null;
        const folderName = `${sanitize(server.name)}-${server.id}`;
        return path.join(MAIN_SERVERS_DIR, folderName);
    }

    _getBackupFolderPath(server) {
        if (!server || typeof server.id !== 'string') return null;
        return path.join(BACKUPS_DIR, server.id);
    }

    _updatePlayerList(serverId, playerName, action) {
        const servers = this._readServers();
        const serverIndex = servers.findIndex(s => s.id === serverId);
        if (serverIndex !== -1) {
            let playerList = servers[serverIndex].connectedPlayers || [];
            const playerExists = playerList.includes(playerName);
            if (action === 'add' && !playerExists) playerList.push(playerName);
            else if (action === 'remove' && playerExists) playerList = playerList.filter(p => p !== playerName);
            servers[serverIndex].connectedPlayers = playerList;
            this._writeServers(servers);
        }
    }

    _cleanupServerProcess(serverId) {
        if (this.activeLogFileStreams[serverId]) {
            this.activeLogFileStreams[serverId].end();
            delete this.activeLogFileStreams[serverId];
        }
        if (this.stdoutBuffers[serverId]) delete this.stdoutBuffers[serverId];
        const serverProcess = this.activeServerProcesses[serverId];
        if (serverProcess) {
            if (serverProcess.stdin && !serverProcess.stdin.destroyed) serverProcess.stdin.end();
            delete this.activeServerProcesses[serverId];
        }
    }

    async _background_createFromModpack(body) {
        const {
            serverName,
            port,
            minRam,
            maxRam,
            modpackVersionId,
            description
        } = body;
        const { v4: uuidv4 } = require('uuid');
        const extract = require('extract-zip');
        const newServerId = uuidv4();
        let tempExtractDir;

        const serverPath = this._getServerFolderPath({
            id: newServerId,
            name: serverName
        });

        const placeholderServer = {
            id: newServerId,
            name: serverName,
            port: parseInt(port, 10),
            status: 'Starting',
            description: 'Creating from Modrinth pack...',
            ip: '127.0.0.1',
            minRam,
            maxRam,
            connectedPlayers: [],
            cpuUsage: 0,
            ramUsage: 0,
            currentRam: 0,
            tags: [],
        };

        try {
            let servers = this._readServers();
            if (servers.find(s => s.name.toLowerCase() === serverName.toLowerCase()) || servers.find(s => s.port === parseInt(port, 10))) {
                // To avoid race conditions, do a quick check. If a server with same name/port was created
                // between the user clicking and this background task starting, we just log and exit.
                console.warn(`[Modrinth Create] A server with name "${serverName}" or port ${port} already exists. Aborting background creation.`);
                return;
            }
            servers.push(placeholderServer);
            this._writeServers(servers);

            console.log(`[Modrinth Create] Fetching version details for ${modpackVersionId}`);
            const versionDetails = await this.httpsGetJson(`https://api.modrinth.com/v2/version/${modpackVersionId}`);
            const serverFile = versionDetails.files.find(f => f.primary && f.filename.endsWith('.mrpack'));
            if (!serverFile) throw new Error("Could not find a primary server pack (.mrpack) in this version.");

            await fsPromises.mkdir(serverPath, {
                recursive: true
            });
            tempExtractDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'modpack-'));
            console.log(`[Modrinth Create] Downloading ${serverFile.filename} to ${tempExtractDir}`);
            const mrpackPath = await this.downloadFile(serverFile.url, tempExtractDir, serverFile.filename);
            await extract(mrpackPath, {
                dir: tempExtractDir
            });

            const manifestPath = path.join(tempExtractDir, 'modrinth.index.json');
            const manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
            console.log(`[Modrinth Create] Downloading ${manifest.files.length} dependency files for ${serverName}...`);

            // Download files sequentially instead of in parallel
            for (const file of manifest.files) {
                const targetPath = path.join(serverPath, ...file.path.split('/'));
                const targetDir = path.dirname(targetPath);
                await fsPromises.mkdir(targetDir, {
                    recursive: true
                });
                // Optional: add a small delay to be polite to the API
                await new Promise(resolve => setTimeout(resolve, 25));
                await this.downloadFile(file.downloads[0], targetDir, path.basename(file.path));
            }

            let jarFileName;
            const isFabric = versionDetails.loaders.includes('fabric');
            if (isFabric) {
                console.log('[Modrinth Create] Detected Fabric modpack. Fetching direct server launcher.');
                const minecraftVersion = manifest.dependencies.minecraft;
                const loaderVersion = manifest.dependencies['fabric-loader'];
                if (!minecraftVersion || !loaderVersion) throw new Error("Could not determine Minecraft or Fabric Loader version from modpack manifest.");

                const fabricInstallersMeta = await this.httpsGetJson(`https://meta.fabricmc.net/v2/versions/installer`);
                const latestStableInstaller = fabricInstallersMeta.find(v => v.stable === true);
                if (!latestStableInstaller) throw new Error("Could not find a stable Fabric installer version.");

                const installerVersion = latestStableInstaller.version;
                const launcherDownloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${minecraftVersion}/${loaderVersion}/${installerVersion}/server/jar`;
                jarFileName = `fabric-server-launch.jar`; // Use a consistent name
                console.log(`[Modrinth Create] Downloading Fabric server launcher as: ${jarFileName}`);
                await this.downloadFile(launcherDownloadUrl, serverPath, jarFileName);
            } else { // Handle Forge
                const overridesDir = path.join(tempExtractDir, 'overrides');
                if (fs.existsSync(overridesDir)) {
                    await fsPromises.cp(overridesDir, serverPath, {
                        recursive: true
                    });
                }
                const rootFiles = await fsPromises.readdir(serverPath);
                const startupScripts = rootFiles.filter(f => f.toLowerCase() === 'run.sh' || f.toLowerCase() === 'run.bat');
                let detectedJar = rootFiles.find(f => f.toLowerCase().startsWith('forge') && f.toLowerCase().endsWith('.jar'));

                if (!detectedJar && startupScripts.length > 0) {
                    const scriptContent = await fsPromises.readFile(path.join(serverPath, startupScripts[0]), 'utf-8');
                    const jarMatch = scriptContent.match(/forge-.*\.jar|server\.jar/);
                    if (jarMatch) detectedJar = jarMatch[0];
                }

                if (!detectedJar) {
                    // Final fallback: just look for *any* .jar that isn't the installer
                    const allJars = rootFiles.filter(f => f.toLowerCase().endsWith('.jar') && !f.toLowerCase().includes('installer'));
                    if (allJars.length === 1) {
                        detectedJar = allJars[0];
                    } else {
                        throw new Error("Could not automatically determine the main Forge server JAR file. Please check run scripts.");
                    }
                }

                jarFileName = detectedJar;
            }
            console.log(`[Modrinth Create] Determined server JAR to be: ${jarFileName}`);

            await fsPromises.writeFile(path.join(serverPath, 'eula.txt'), 'eula=true', 'utf-8');
            const consoleLogFilePath = path.join(serverPath, 'live_console.log');
            await fsPromises.writeFile(consoleLogFilePath, `--- Server ${serverName} created from Modrinth pack at ${new Date().toISOString()} ---\n`);

            let finalServers = this._readServers();
            const serverIndex = finalServers.findIndex(s => s.id === newServerId);
            if (serverIndex !== -1) {
                const finalServerData = {
                    ...finalServers[serverIndex],
                    jarFileName,
                    description: description || versionDetails.name || `Modpack server for ${serverName}`,
                    serverVersion: versionDetails.game_versions.join(', '),
                    softwareType: versionDetails.loaders.join(', '),
                    status: 'Offline',
                    logoUrl: versionDetails.project?.icon_url || null,
                    consoleLogFile: consoleLogFilePath,
                    tags: [],
                };
                finalServers[serverIndex] = finalServerData;
                this._writeServers(finalServers);
                console.log(`[Modrinth Create] Successfully created server ${serverName}`);

                // Link to proxy if applicable
                const newServer = finalServerData;
                const allServers = this._readServers();
                const proxies = allServers.filter(s => s.softwareType === 'Velocity');
                if (proxies.length > 0) {
                    const proxyServer = proxies[0];
                    const proxyPath = this._getServerFolderPath(proxyServer);
                    const tomlPath = path.join(proxyPath, 'velocity.toml');
                    
                    try {
                        let tomlConfig = {};
                        if (fs.existsSync(tomlPath)) {
                            const tomlContent = await fsPromises.readFile(tomlPath, 'utf8');
                            tomlConfig = TOML.parse(tomlContent);
                        } else {
                            tomlConfig = { servers: {} };
                        }
                        if (!tomlConfig.servers) tomlConfig.servers = {};
                        if (!tomlConfig['forced-hosts']) tomlConfig['forced-hosts'] = {};
            
                        const serverEntryName = newServer.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                        tomlConfig.servers[serverEntryName] = `${newServer.ip}:${newServer.port}`;
                        const forcedHostKey = `${serverEntryName}.example.com`;
                        tomlConfig['forced-hosts'][forcedHostKey] = [serverEntryName];
                        
                        if (!tomlConfig.try) tomlConfig.try = [];
                        if (tomlConfig.try.length === 0) tomlConfig.try.push(serverEntryName);
            
                        await fsPromises.writeFile(tomlPath, TOML.stringify(tomlConfig), 'utf8');
                        console.log(`[Modrinth Create] Successfully added new modpack server '${newServer.name}' to proxy '${proxyServer.name}' config.`);
                    } catch (tomlError) {
                         console.error(`[Modrinth Create] Failed to update proxy config for new modpack server:`, tomlError);
                    }
                }
            }

        } catch (error) {
            console.error(`Error during background modpack creation for ${serverName}:`, error);
            let finalServers = this._readServers();
            const serverIndex = finalServers.findIndex(s => s.id === newServerId);
            if (serverIndex !== -1) {
                finalServers[serverIndex].status = 'Error';
                finalServers[serverIndex].description = `Failed creation: ${error.message.substring(0, 150)}`;
                this._writeServers(finalServers);
            }
        } finally {
            if (tempExtractDir) {
                await fsPromises.rm(tempExtractDir, {
                    recursive: true,
                    force: true
                }).catch(e => console.error("Failed to cleanup temp modpack dir:", e));
            }
        }
    }

    async _syncVelocitySecret(paperServer, velocityProxy) {
        console.log(`[Secret Sync] Starting secret sync for ${paperServer.name} with proxy ${velocityProxy.name}.`);
        const proxyPath = this._getServerFolderPath(velocityProxy);
        const paperServerPath = this._getServerFolderPath(paperServer);
    
        if (!proxyPath || !paperServerPath) {
            console.error(`[Secret Sync] Could not determine folder path for server or proxy.`);
            return;
        }
    
        const secretFilePath = path.join(proxyPath, 'forwarding.secret');
        let secret = '';
    
        try {
            if (fs.existsSync(secretFilePath)) {
                secret = await fsPromises.readFile(secretFilePath, 'utf-8');
            } else {
                secret = crypto.randomBytes(12).toString('hex'); // Generate a new secret
                await fsPromises.writeFile(secretFilePath, secret, 'utf-8');
                console.log(`[Secret Sync] Generated new forwarding.secret for proxy ${velocityProxy.name}.`);
            }
            secret = secret.trim();
    
            const paperConfigDir = path.join(paperServerPath, 'config');
            const paperGlobalYmlPath = path.join(paperConfigDir, 'paper-global.yml');
    
            await fsPromises.mkdir(paperConfigDir, { recursive: true });
    
            const defaultConfig = `
# This is the global configuration file for Paper.
# As you can see, there's not much here. This is because Paper ships
# with a default configuration file, and it is not recommended to copy
# and edit it. It's better to only override the settings you want to change.
#
# You can find the full list of configuration options here:
# https://docs.papermc.io/paper/configuration

proxies:
  bungee-cord:
    online-mode: true
  proxy-protocol: false
  velocity:
    enabled: true
    online-mode: true
    secret: "${secret}"
`;
    
            await fsPromises.writeFile(paperGlobalYmlPath, defaultConfig.trim(), 'utf-8');
            console.log(`[Secret Sync] Successfully wrote forwarding secret to ${paperServer.name}'s paper-global.yml.`);
    
        } catch (error) {
            console.error(`[Secret Sync] Failed to sync Velocity secret for server ${paperServer.name}:`, error);
        }
    }
}

// ... (rest of the file with initialization logic) ...
try {
    if (!fs.existsSync(APP_DATA_ROOT)) fs.mkdirSync(APP_DATA_ROOT, {
        recursive: true
    });
} catch (e) {
    console.error(`Failed to create APP_DATA_ROOT`, e);
}
try {
    if (!fs.existsSync(MAIN_SERVERS_DIR)) fs.mkdirSync(MAIN_SERVERS_DIR, {
        recursive: true
    });
} catch (e) {
    console.error(`Failed to create MAIN_SERVERS_DIR`, e);
}
try {
    if (!fs.existsSync(RECOVERY_DIR)) fs.mkdirSync(RECOVERY_DIR, {
        recursive: true
    });
} catch (e) {
    console.error(`Failed to create RECOVERY_DIR`, e);
}
try {
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, {
        recursive: true
    });
} catch (e) {
    console.error(`Failed to create BACKUPS_DIR`, e);
}
try {
    if (!fs.existsSync(SERVERS_FILE_PATH)) fs.writeFileSync(SERVERS_FILE_PATH, '[]', 'utf-8');
} catch (e) {
    console.error(`Failed to create servers.json`, e);
}
try {
    if (!fs.existsSync(PROXIES_FILE_PATH)) fs.writeFileSync(PROXIES_FILE_PATH, '[]', 'utf-8');
} catch (e) {
    console.error(`Failed to create proxies.json`, e);
}

module.exports = IndexController;
