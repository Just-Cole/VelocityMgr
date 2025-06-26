// backend/controllers/index.js
const fs = require('fs');
const fsPromises = require('fs').promises; // For async file operations
const path = require('path');
const {
    v4: uuidv4
} = require('uuid');
const https = require('https');
const {
    spawn
} = require('child_process');
const crypto = require('crypto');
const util = require('util');
const pidusage = require('pidusage');
const archiver = require('archiver');
const extract = require('extract-zip');
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

function verifyPassword(providedPassword, storedPasswordWithSalt) {
    if (!storedPasswordWithSalt || typeof storedPasswordWithSalt !== 'string') {
        return false; // Invalid stored password
    }
    if (!storedPasswordWithSalt.includes('$')) {
        console.warn("verifyPassword encountered a password that seems unhashed (missing '$'). Denying login for safety.");
        return false;
    }
    const [salt, storedHashHex] = storedPasswordWithSalt.split('$');
    if (!salt || !storedHashHex) return false; // Invalid format

    const hashToVerifyBuffer = crypto.pbkdf2Sync(providedPassword, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST);
    const storedHashBuffer = Buffer.from(storedHashHex, 'hex');

    if (hashToVerifyBuffer.length !== storedHashBuffer.length) {
        return false;
    }

    try {
        return crypto.timingSafeEqual(hashToVerifyBuffer, storedHashBuffer);
    } catch (e) {
        console.error("Error during timingSafeEqual (likely buffer length mismatch):", e.message);
        return false;
    }
}

const parseServerProperties = (data) => {
    const properties = {};
    if (!data) return properties;
    const lines = data.split(/\r?\n/);
    for (const line of lines) {
        if (line.trim().startsWith('#') || !line.includes('=')) {
            continue;
        }
        const equalsIndex = line.indexOf('=');
        const key = line.substring(0, equalsIndex).trim();
        const value = line.substring(equalsIndex + 1).trim();
        if (key) { // Ensure key is not empty
            properties[key] = value;
        }
    }
    return properties;
};

const formatServerProperties = (newProps, existingContent = '') => {
    const properties = { ...newProps };
    const lines = existingContent.split(/\r?\n/);
    const newLines = [];
    const handledKeys = new Set();

    for (const line of lines) {
        if (line.trim().startsWith('#') || !line.includes('=')) {
            newLines.push(line);
            continue;
        }
        const equalsIndex = line.indexOf('=');
        const key = line.substring(0, equalsIndex).trim();
        if (properties.hasOwnProperty(key)) {
            newLines.push(`${key}=${properties[key]}`);
            handledKeys.add(key);
        } else {
            // Keep original line if key is not in newProps
            newLines.push(line);
        }
    }

    for (const key in properties) {
        if (!handledKeys.has(key)) {
            newLines.push(`${key}=${properties[key]}`);
        }
    }

    // Filter out potential empty lines at the end before joining
    return newLines.filter((line, index) => line.trim() !== '' || index !== newLines.length -1).join('\n');
};


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
            
            const properties = parseServerProperties(content);
            properties['server-port'] = newPort;
            
            const newContent = formatServerProperties(properties, content);
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

    // --- Authentication and User Management ---

    loginUser(req, res, next) {
        const {
            username,
            password
        } = req.body;
        if (!username || !password) {
            return res.status(400).json({
                message: "Username and password are required."
            });
        }
        try {
            const config = this._readConfig();
            const user = config.users.find(u => u.username === username);

            if (user && verifyPassword(password, user.password)) {
                const permissionsSet = new Set();
                if (user.roles && config.roles) {
                    user.roles.forEach(roleName => {
                        const roleDetails = config.roles[roleName];
                        if (roleDetails && roleDetails.permissions) {
                            roleDetails.permissions.forEach(permission => {
                                permissionsSet.add(permission);
                            });
                        }
                    });
                }
                res.status(200).json({
                    message: "Login successful.",
                    user: {
                        username: user.username,
                        roles: user.roles,
                        permissions: Array.from(permissionsSet)
                    }
                });
            } else {
                res.status(401).json({
                    message: "Invalid username or password."
                });
            }
        } catch (e) {
            next(e);
        }
    }

    listAppUsers(req, res, next) {
        try {
            const config = this._readConfig();
            const users = config.users.map(u => ({
                username: u.username,
                roles: u.roles || []
            }));
            res.status(200).json(users);
        } catch (e) {
            next(e);
        }
    }

    addAppUser(req, res, next) {
        const {
            username,
            password,
            roles
        } = req.body;
        if (!username || !password || password.length < 6 || !roles || !Array.isArray(roles) || roles.length === 0) {
            return res.status(400).json({
                message: "Valid username, password (min 6 chars), and roles array are required."
            });
        }
        try {
            const config = this._readConfig();
            if (config.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
                return res.status(409).json({
                    message: "Username already exists."
                });
            }
            config.users.push({
                username: username.trim(),
                password: hashPassword(password),
                roles
            });
            this._writeConfig(config);
            res.status(201).json({
                message: `User "${username.trim()}" created successfully.`
            });
        } catch (e) {
            next(e);
        }
    }

    deleteAppUser(req, res, next) {
        const {
            username: userToDelete
        } = req.params;
        if (!userToDelete) return res.status(400).json({
            message: "Username is required."
        });

        try {
            const config = this._readConfig();
            const initialCount = config.users.length;
            if (initialCount <= 1) {
                return res.status(400).json({
                    message: "Cannot delete the last user."
                });
            }
            const filteredUsers = config.users.filter(user => user.username.toLowerCase() !== userToDelete.toLowerCase());
            if (filteredUsers.length === initialCount) {
                return res.status(404).json({
                    message: `User "${userToDelete}" not found.`
                });
            }
            config.users = filteredUsers;
            this._writeConfig(config);
            res.status(200).json({
                message: `User "${userToDelete}" deleted.`
            });
        } catch (e) {
            next(e);
        }
    }

    updateUserRoles(req, res, next) {
        const {
            username
        } = req.params;
        const {
            roles
        } = req.body;
        if (!Array.isArray(roles)) return res.status(400).json({
            message: "'roles' array is required."
        });

        try {
            const config = this._readConfig();
            const userIndex = config.users.findIndex(u => u.username === username);
            if (userIndex === -1) return res.status(404).json({
                message: `User "${username}" not found.`
            });

            const targetUser = config.users[userIndex];
            const originalRoles = targetUser.roles || [];

            if (originalRoles.includes("Admin") && !roles.includes("Admin")) {
                if (config.users.filter(u => u.roles && u.roles.includes("Admin")).length <= 1) {
                    return res.status(400).json({
                        message: "Cannot remove Admin role from the last admin."
                    });
                }
            }

            for (const roleName of roles) {
                if (!config.roles[roleName]) {
                    return res.status(400).json({
                        message: `Role '${roleName}' does not exist.`
                    });
                }
            }

            config.users[userIndex].roles = roles;
            this._writeConfig(config);
            res.status(200).json({
                message: `Roles for "${username}" updated.`
            });
        } catch (e) {
            next(e);
        }
    }

    updateUserPassword(req, res, next) {
        const {
            username
        } = req.params;
        const {
            currentPassword,
            newPassword
        } = req.body;
        if (!currentPassword || !newPassword || newPassword.length < 6) {
            return res.status(400).json({
                message: "Current and new password (min 6 chars) are required."
            });
        }

        try {
            const config = this._readConfig();
            const userIndex = config.users.findIndex(u => u.username === username);
            if (userIndex === -1) return res.status(404).json({
                message: `User "${username}" not found.`
            });

            const targetUser = config.users[userIndex];
            if (!verifyPassword(currentPassword, targetUser.password)) {
                return res.status(401).json({
                    message: "Incorrect current password."
                });
            }

            config.users[userIndex].password = hashPassword(newPassword);
            this._writeConfig(config);
            res.status(200).json({
                message: "Password updated."
            });
        } catch (e) {
            next(e);
        }
    }

    getIndex(req, res) {
        res.status(200).json({
            message: "API root."
        });
    }

    // --- Server & Proxy Methods ---

    async createServer(req, res, next) {
        const {
            serverName,
            port,
            serverType,
        } = req.body;
        let { serverVersion, paperBuild, velocityBuild } = req.body;

        if (!serverName || !port || !serverType || !serverVersion) {
            return res.status(400).json({
                message: "Missing required fields for server creation."
            });
        }

        try {
            let servers = this._readServers();
            if (servers.find(s => s.name.toLowerCase() === serverName.toLowerCase())) {
                return res.status(409).json({
                    message: `A server with the name "${serverName}" already exists.`
                });
            }
            if (servers.find(s => s.port === parseInt(port, 10))) {
                return res.status(409).json({
                    message: `A server is already using port ${port}.`
                });
            }

            const isPaper = serverType === 'PaperMC';
            const apiProjectName = isPaper ? 'paper' : 'velocity';
            let buildNumber = isPaper ? paperBuild : velocityBuild;

            if (!buildNumber) {
                console.log(`[Create Server] Build not specified for ${serverType} ${serverVersion}. Fetching latest build...`);
                const buildsResponse = await httpsGetJson(`https://api.papermc.io/v2/projects/${apiProjectName}/versions/${serverVersion}/builds`);
                const latestBuildDetails = buildsResponse.builds.pop(); // Last in array is latest
                if (!latestBuildDetails) {
                    return res.status(404).json({ message: `Could not find any builds for ${serverType} version ${serverVersion}. Please check the version number.` });
                }
                buildNumber = latestBuildDetails.build;
                // Use the full version string from the API response for accuracy
                serverVersion = buildsResponse.version; 
                console.log(`[Create Server] Found latest build for ${serverVersion}: ${buildNumber}`);
            }

            const newServerId = uuidv4();
            const newServer = {
                id: newServerId,
                name: serverName,
                port: parseInt(port, 10),
                ip: '127.0.0.1',
                softwareType: serverType,
                serverVersion: serverVersion,
                paperBuild: isPaper ? buildNumber : undefined,
                velocityBuild: !isPaper ? buildNumber : undefined,
                status: 'Offline',
                connectedPlayers: [],
                maxPlayers: 20,
                minRam: '1024M',
                maxRam: '2048M',
                description: `A new ${serverType} server.`,
            };

            const serverFolderPath = this._getServerFolderPath(newServer);
            await fsPromises.mkdir(serverFolderPath, {
                recursive: true
            });

            const downloadFileName = `${apiProjectName}-${serverVersion}-${buildNumber}.jar`;
            const serverJarPath = path.join(serverFolderPath, downloadFileName);

            if (!fs.existsSync(serverJarPath)) {
                const downloadUrl = `https://api.papermc.io/v2/projects/${apiProjectName}/versions/${serverVersion}/builds/${buildNumber}/downloads/${downloadFileName}`;
                console.log(`[Create Server] JAR not found. Downloading from ${downloadUrl}`);
                await downloadFile(downloadUrl, serverFolderPath, downloadFileName);
            }

            newServer.jarFileName = downloadFileName;

            const eulaPath = path.join(serverFolderPath, 'eula.txt');
            if (!fs.existsSync(eulaPath)) {
                await fsPromises.writeFile(eulaPath, 'eula=true', 'utf-8');
            }

            servers.push(newServer);
            this._writeServers(servers);

            // --- NEW LOGIC TO UPDATE PROXY CONFIG ---
            if (newServer.softwareType === 'PaperMC') {
                const allServers = this._readServers();
                const proxyServer = allServers.find(s => s.softwareType === 'Velocity');

                if (proxyServer) {
                    const proxyPath = this._getServerFolderPath(proxyServer);
                    const tomlPath = path.join(proxyPath, 'velocity.toml');

                    try {
                        let tomlConfig = {};
                        if (fs.existsSync(tomlPath)) {
                            const tomlContent = await fsPromises.readFile(tomlPath, 'utf8');
                            tomlConfig = TOML.parse(tomlContent);
                        } else {
                            // Create a default velocity.toml if it doesn't exist
                            tomlConfig = {
                                servers: {},
                                'online-mode': true,
                            };
                        }

                        if (!tomlConfig.servers) {
                            tomlConfig.servers = {};
                        }

                        // Sanitize the server name for use as a key in TOML
                        const serverEntryName = newServer.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                        tomlConfig.servers[serverEntryName] = `${newServer.ip}:${newServer.port}`;

                        // Set the try order, adding the new server if a hub doesn't exist
                        if (!tomlConfig.try) {
                            tomlConfig.try = [];
                        }
                        if (tomlConfig.try.length === 0 && serverEntryName.includes('hub')) {
                            tomlConfig.try.push(serverEntryName);
                        } else if (tomlConfig.try.length === 0) {
                            tomlConfig.try.push(serverEntryName);
                        }


                        await fsPromises.writeFile(tomlPath, TOML.stringify(tomlConfig), 'utf8');
                        console.log(`[Create Server] Successfully added new server '${newServer.name}' to proxy '${proxyServer.name}' config.`);
                        
                        // Sync the forwarding secret
                        await this._syncVelocitySecret(newServer, proxyServer);

                        return res.status(201).json({
                            message: `Server "${newServer.name}" created, linked to proxy, and forwarding secret synced. Restart the proxy to apply.`,
                            server: newServer,
                        });

                    } catch (tomlError) {
                        console.error(`[Create Server] Failed to update proxy config for new server:`, tomlError);
                        return res.status(201).json({
                            message: `Server "${newServer.name}" created, but FAILED to link to proxy. You must add it to velocity.toml manually. Error: ${tomlError.message}`,
                            server: newServer,
                        });
                    }
                } else {
                    // No proxy found, just send the standard success message
                    console.log(`[Create Server] New PaperMC server created, but no Velocity proxy was found to link it to.`);
                }
            }
            // --- END OF NEW LOGIC ---

            res.status(201).json({
                message: `Server "${newServer.name}" created successfully. You can now manage it from the dashboard.`,
                server: newServer,
            });

        } catch (error) {
             if (error.statusCode === 404) {
                return res.status(404).json({ message: `Version '${serverVersion}' not found on PaperMC API. Please check the version number.` });
             }
             next(error);
        }
    }

    listServers(req, res, next) {
        try {
            res.status(200).json(this._readServers());
        } catch (e) {
            next(e);
        }
    }

    async deleteServerWithRecovery(req, res, next) {
        const {
            serverId
        } = req.params;
        try {
            const servers = this._readServers();
            const serverIndex = servers.findIndex(s => s.id === serverId);

            if (serverIndex === -1) {
                return res.status(404).json({
                    message: 'Server not found.'
                });
            }

            const [server] = servers.splice(serverIndex, 1);

            // Attempt to stop the server if it's running
            if (server.pid) {
                try {
                    // On Windows, 'SIGTERM' might not be enough, but it's the standard.
                    // For more robust cross-platform, one might use taskkill or similar commands.
                    process.kill(server.pid, 'SIGTERM');
                    console.log(`Sent SIGTERM to process ${server.pid} for server ${server.name}`);
                } catch (e) {
                    // Ignore error if process doesn't exist anymore
                    if (e.code !== 'ESRCH') {
                        console.error(`Error killing process ${server.pid}:`, e);
                    }
                }
            }

            this._cleanupServerProcess(server.id); // Clean up active process tracking

            const serverPath = this._getServerFolderPath(server);

            if (fs.existsSync(serverPath)) {
                await fsPromises.mkdir(RECOVERY_DIR, {
                    recursive: true
                });
                const recoveryFolderName = `${sanitize(server.name)}_${Date.now()}`;
                const recoveryDestPath = path.join(RECOVERY_DIR, recoveryFolderName);

                await fsPromises.rename(serverPath, recoveryDestPath);

                const recoveryFilePath = path.join(RECOVERY_DIR, 'recovery.json');
                let recoveryData = [];
                if (fs.existsSync(recoveryFilePath)) {
                    try {
                        recoveryData = JSON.parse(await fsPromises.readFile(recoveryFilePath, 'utf8'));
                    } catch (readErr) {
                        console.error("Could not parse recovery.json, starting fresh.", readErr);
                        recoveryData = [];
                    }
                }

                recoveryData.push({
                    recoveryFolderName,
                    deletedAt: new Date().toISOString(),
                    server,
                });
                await fsPromises.writeFile(recoveryFilePath, JSON.stringify(recoveryData, null, 2));

            } else {
                console.warn(`Server folder for ${server.name} (ID: ${server.id}) not found at ${serverPath}. Skipping folder move.`);
            }

            this._writeServers(servers); // Write the updated servers list (with the server removed)

            res.status(200).json({
                message: `Server "${server.name}" has been successfully moved to recovery.`
            });

        } catch (error) {
            next(error);
        }
    }

    async listRecoverableServers(req, res, next) {
        try {
            const recoveryFilePath = path.join(RECOVERY_DIR, 'recovery.json');
            if (!fs.existsSync(recoveryFilePath)) {
                return res.status(200).json([]);
            }
            const recoveryData = JSON.parse(await fsPromises.readFile(recoveryFilePath, 'utf8'));
            res.status(200).json(recoveryData);
        } catch (error) {
            next(error);
        }
    }

    async restoreServer(req, res, next) {
        const {
            recoveryFolderName
        } = req.body;
        try {
            const recoveryFilePath = path.join(RECOVERY_DIR, 'recovery.json');
            if (!fs.existsSync(recoveryFilePath)) {
                return res.status(404).json({
                    message: "Recovery data not found."
                });
            }

            let recoveryData = JSON.parse(await fsPromises.readFile(recoveryFilePath, 'utf8'));
            const recoveryIndex = recoveryData.findIndex(item => item.recoveryFolderName === recoveryFolderName);
            if (recoveryIndex === -1) {
                return res.status(404).json({
                    message: "Server not found in recovery data."
                });
            }

            const [recoveryInfo] = recoveryData.splice(recoveryIndex, 1);
            const serverToRestore = recoveryInfo.server;

            // Set status to Offline upon restore and clear runtime data
            serverToRestore.status = 'Offline';
            serverToRestore.pid = undefined;
            serverToRestore.connectedPlayers = [];
            serverToRestore.cpuUsage = 0;
            serverToRestore.ramUsage = 0;
            serverToRestore.currentRam = 0;

            const originalPath = this._getServerFolderPath(serverToRestore);
            const recoveredPath = path.join(RECOVERY_DIR, recoveryFolderName);

            if (fs.existsSync(originalPath)) {
                // If the original path somehow exists, we can't restore over it.
                recoveryData.push(recoveryInfo); // Put it back
                await fsPromises.writeFile(recoveryFilePath, JSON.stringify(recoveryData, null, 2));
                return res.status(409).json({
                    message: `Cannot restore: A server directory already exists at the target location: ${originalPath}`
                });
            }

            if (!fs.existsSync(recoveredPath)) {
                // If folder doesn't exist, just add metadata back.
                console.warn(`Recovered folder for ${serverToRestore.name} not found at ${recoveredPath}. Restoring metadata only.`);
                await fsPromises.mkdir(originalPath, {
                    recursive: true
                }); // Recreate empty dir
            } else {
                await fsPromises.rename(recoveredPath, originalPath);
            }

            const servers = this._readServers();
            servers.push(serverToRestore);
            this._writeServers(servers);

            await fsPromises.writeFile(recoveryFilePath, JSON.stringify(recoveryData, null, 2));

            res.status(200).json({
                message: `Server "${serverToRestore.name}" has been restored.`
            });

        } catch (error) {
            next(error);
        }
    }

    async permanentlyDeleteRecoveredServer(req, res, next) {
        const {
            recoveryFolderName
        } = req.body;
        try {
            const recoveryFilePath = path.join(RECOVERY_DIR, 'recovery.json');
            if (!fs.existsSync(recoveryFilePath)) {
                return res.status(404).json({
                    message: "Recovery data not found."
                });
            }

            let recoveryData = JSON.parse(await fsPromises.readFile(recoveryFilePath, 'utf8'));
            const recoveryIndex = recoveryData.findIndex(item => item.recoveryFolderName === recoveryFolderName);
            if (recoveryIndex === -1) {
                return res.status(404).json({
                    message: "Server not found in recovery data."
                });
            }

            const [recoveryInfo] = recoveryData.splice(recoveryIndex, 1);
            const serverId = recoveryInfo.server.id;

            // Delete server data folder
            const folderToDelete = path.join(RECOVERY_DIR, recoveryFolderName);
            if (fs.existsSync(folderToDelete)) {
                await fsPromises.rm(folderToDelete, {
                    recursive: true,
                    force: true
                });
            }

            // Delete associated backups folder
            const backupsFolderToDelete = path.join(BACKUPS_DIR, serverId);
            if (fs.existsSync(backupsFolderToDelete)) {
                await fsPromises.rm(backupsFolderToDelete, {
                    recursive: true,
                    force: true
                });
            }

            await fsPromises.writeFile(recoveryFilePath, JSON.stringify(recoveryData, null, 2));

            res.status(200).json({
                message: `Server "${recoveryInfo.server.name}" and all its backups have been permanently deleted.`
            });
        } catch (error) {
            next(error);
        }
    }

    async getBannedPlayers(req, res, next) { /* ... */ }

    async startMinecraft(req, res, next) {
        const {
            serverName,
        } = req.body;
        if (!serverName) {
            return res.status(400).json({
                message: "Server name is required."
            });
        }

        try {
            let servers = this._readServers();
            const serverIndex = servers.findIndex(s => s.name === serverName);
            let server = servers[serverIndex];

            if (!server) {
                return res.status(404).json({
                    message: `Server "${serverName}" not found.`
                });
            }

            if (this.activeServerProcesses[server.id]) {
                return res.status(409).json({
                    message: `Server "${server.name}" is already running or in a transitional state.`
                });
            }

            const serverFolderPath = this._getServerFolderPath(server);
            if (!fs.existsSync(serverFolderPath)) {
                await fsPromises.mkdir(serverFolderPath, {
                    recursive: true
                });
            }

            // This block handles cases where the JAR might be missing for simple server types
            const serverJarPath = server.jarFileName ? path.join(serverFolderPath, server.jarFileName) : null;
            if (['PaperMC', 'Velocity'].includes(server.softwareType) && (!server.jarFileName || !fs.existsSync(serverJarPath))) {
                const isPaper = server.softwareType === 'PaperMC';
                const apiProjectName = isPaper ? 'paper' : 'velocity';
                const buildNumber = isPaper ? server.paperBuild : server.velocityBuild;
                const downloadFileName = `${apiProjectName}-${server.serverVersion}-${buildNumber}.jar`;
                const downloadUrl = `https://api.papermc.io/v2/projects/${apiProjectName}/versions/${server.serverVersion}/builds/${buildNumber}/downloads/${downloadFileName}`;

                console.log(`[Start Server] JAR not found for existing server. Re-downloading from ${downloadUrl}`);
                await downloadFile(downloadUrl, serverFolderPath, downloadFileName);

                server.jarFileName = downloadFileName;
                servers[serverIndex] = server;
                this._writeServers(servers);
            }

            const eulaPath = path.join(serverFolderPath, 'eula.txt');
            if (!fs.existsSync(eulaPath)) {
                await fsPromises.writeFile(eulaPath, 'eula=true', 'utf-8');
            }

            const consoleLogFilePath = path.join(serverFolderPath, 'live_console.log');
            server.consoleLogFile = consoleLogFilePath;

            // --- NEW LAUNCH LOGIC ---
            let serverProcess;
            const isForgeLike = server.softwareType && (server.softwareType.toLowerCase().includes('forge') || server.softwareType.toLowerCase().includes('fabric'));
            const scriptName = os.platform() === 'win32' ? 'run.bat' : 'run.sh';
            const scriptPath = path.join(serverFolderPath, scriptName);

            if (isForgeLike && fs.existsSync(scriptPath)) {
                console.log(`[Start Server] Detected Forge/Fabric server with ${scriptName}. Using script to launch.`);
                if (os.platform() !== 'win32') {
                    try {
                        await fsPromises.chmod(scriptPath, '755');
                    } catch (e) {
                        console.warn(`Could not chmod ${scriptName}: ${e.message}`)
                    }
                }

                serverProcess = spawn(scriptPath, [], {
                    cwd: serverFolderPath,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: true // Important for executing .sh/.bat scripts correctly
                });
            } else {
                // Fallback to original java -jar logic for Paper, Velocity, or simple servers
                const javaArgs = [
                    `-Xms${server.minRam || '1G'}`,
                    `-Xmx${server.maxRam || '2G'}`,
                    ...(server.launchArgs ? server.launchArgs.split(' ') : []),
                    '-jar',
                    server.jarFileName,
                ].filter(Boolean);

                if (server.softwareType === 'PaperMC') {
                    javaArgs.push('--nogui');
                }

                console.log(`[Start Server] Spawning process for ${server.name} with args: ${javaArgs.join(' ')}`);
                serverProcess = spawn('java', javaArgs, {
                    cwd: serverFolderPath,
                    stdio: ['pipe', 'pipe', 'pipe']
                });
            }
            // --- END NEW LAUNCH LOGIC ---
            const logStream = fs.createWriteStream(consoleLogFilePath, {
                flags: 'a'
            });
            this.activeLogFileStreams[server.id] = logStream;

            this.activeServerProcesses[server.id] = serverProcess;

            serverProcess.stdout.pipe(logStream, {
                end: false
            });
            serverProcess.stderr.pipe(logStream, {
                end: false
            });

            serverProcess.stdout.on('data', (data) => {
                const text = data.toString();
                if (text.includes("joined the game")) {
                    const match = text.match(/\w+ joined the game/);
                    if (match) this._updatePlayerList(server.id, match[0].split(' ')[0], 'add');
                } else if (text.includes("left the game")) {
                    const match = text.match(/\w+ left the game/);
                    if (match) this._updatePlayerList(server.id, match[0].split(' ')[0], 'remove');
                }

                // More robust 'Done' check for different server types
                const srvs = this._readServers();
                const srvIdx = srvs.findIndex(s => s.id === server.id);
                if (srvIdx !== -1) {
                    const currentServer = srvs[srvIdx];
                    const donePatternPaperAndVelocity = /Done \([\d\.]+s\)!/;
                    const donePatternForge = /Server marked as active for authlib/; // A common Forge message
                    
                    if ((currentServer.status === 'Starting' || currentServer.status === 'restarting') && (donePatternPaperAndVelocity.test(text) || donePatternForge.test(text))) {
                        console.log(`[Status Update] Server ${currentServer.name} detected as fully online.`);
                        srvs[srvIdx].status = 'Online';
                        this._writeServers(srvs);
                    }
                }
            });

            serverProcess.on('spawn', () => {
                let srvs = this._readServers();
                let srvIdx = srvs.findIndex(s => s.id === server.id);
                if (srvIdx !== -1) {
                    const currentServerStateInSpawn = srvs[srvIdx];
                    // Set status to Starting or restarting, not Online immediately
                    srvs[srvIdx].status = currentServerStateInSpawn.status === 'restarting' ? 'restarting' : 'Starting';
                    srvs[srvIdx].pid = serverProcess.pid;
                    srvs[srvIdx].consoleLogFile = consoleLogFilePath;
                    this._writeServers(srvs);
                }
                res.status(200).json({
                    message: `Server "${server.name}" is now starting.`,
                    server: srvs[srvIdx]
                });
            });

            serverProcess.on('exit', (code) => {
                console.log(`Server ${server.name} (PID: ${serverProcess.pid}) exited with code ${code}.`);
                const logStream = this.activeLogFileStreams[server.id];
                if (logStream) {
                    logStream.end();
                }

                const servers = this._readServers();
                const serverIndex = servers.findIndex(s => s.id === server.id);
                if (serverIndex === -1) {
                    this._cleanupServerProcess(server.id);
                    return;
                }

                const currentServer = servers[serverIndex];

                if (currentServer.status === 'restarting') {
                    console.log(`Exit detected for restarting server ${server.name}. Restart logic will take over.`);
                } else if (currentServer.status === 'stopping') {
                    console.log(`Exit detected for stopping server ${server.name}. Setting status to Offline.`);
                    servers[serverIndex].status = 'Offline';
                    this._writeServers(servers);
                } else {
                    console.log(`Unexpected exit for server ${server.name}. Marking as Error.`);
                    servers[serverIndex].status = 'Error';
                    this._writeServers(servers);
                }
                // General cleanup of process and streams
                this._cleanupServerProcess(server.id);
            });

            serverProcess.on('error', (err) => {
                console.error(`Failed to start server ${server.name}:`, err);
                const logStream = this.activeLogFileStreams[server.id];
                if (logStream) {
                    logStream.end();
                }
                const servers = this._readServers();
                const serverIndex = servers.findIndex(s => s.id === server.id);
                 if (serverIndex !== -1) {
                    servers[serverIndex].status = 'Error';
                    this._writeServers(servers);
                 }
                this._cleanupServerProcess(server.id);
            });

        } catch (error) {
            next(error);
        }
    }
    async stopMinecraft(req, res, next) {
        const {
            serverName
        } = req.body;
        if (!serverName) {
            return res.status(400).json({
                message: "Server name is required."
            });
        }

        try {
            let servers = this._readServers();
            const serverIndex = servers.findIndex(s => s.name === serverName);
            if (serverIndex === -1) {
                return res.status(404).json({
                    message: `Server "${serverName}" not found.`
                });
            }

            let server = servers[serverIndex];
            const serverProcess = this.activeServerProcesses[server.id];

            if (!serverProcess || server.status === 'Offline') {
                // If it's already offline, just ensure the state is consistent.
                if (server.status !== 'Offline') {
                    servers[serverIndex].status = 'Offline';
                    servers[serverIndex].pid = undefined;
                    this._writeServers(servers);
                }
                return res.status(200).json({
                    message: `Server "${server.name}" is already offline.`
                });
            }

            servers[serverIndex].status = 'stopping';
            this._writeServers(servers);
            res.status(200).json({
                message: `Stopping server "${server.name}"...`,
                server: servers[serverIndex]
            });

            if (serverProcess.stdin && !serverProcess.stdin.destroyed) {
                serverProcess.stdin.write('stop\n');
            } else {
                process.kill(serverProcess.pid, 'SIGTERM');
            }

            setTimeout(() => {
                const currentProcess = this.activeServerProcesses[server.id];
                if (currentProcess) {
                    console.log(`Server ${server.name} did not stop gracefully, force killing.`);
                    try {
                        process.kill(currentProcess.pid, 'SIGKILL');
                    } catch (e) {
                        // Ignore, process might be gone
                    }
                }
            }, 10000); // 10 seconds timeout

        } catch (error) {
            next(error);
        }
    }
    async restartServer(req, res, next) {
        const {
            serverName
        } = req.body;
        if (!serverName) {
            return res.status(400).json({
                message: "Server name is required."
            });
        }

        try {
            let servers = this._readServers();
            const serverIndex = servers.findIndex(s => s.name === serverName);
            if (serverIndex === -1) {
                return res.status(404).json({
                    message: `Server "${serverName}" not found.`
                });
            }
            let server = servers[serverIndex];
            const serverProcess = this.activeServerProcesses[server.id];

            if (!serverProcess || server.status === 'Offline') {
                console.log(`Restart called on offline server ${serverName}. Starting it.`);
                return this.startMinecraft(req, res, next);
            }

            servers[serverIndex].status = 'restarting';
            this._writeServers(servers);
            res.status(200).json({
                message: `Restarting server "${serverName}"...`,
                server: servers[serverIndex]
            });

            const startServerLogic = async () => {
                const fakeReq = {
                    body: {
                        serverName
                    }
                };
                const fakeRes = {
                    status: () => fakeRes,
                    json: () => {},
                    send: () => {}
                };
                const fakeNext = (err) => {
                    if (err) console.error(`Error during restart's start phase for ${serverName}:`, err);
                };
                await this.startMinecraft(fakeReq, fakeRes, fakeNext);
            };

            serverProcess.once('exit', () => {
                console.log(`Server ${server.name} stopped, now restarting.`);
                setTimeout(startServerLogic, 2000);
            });

            if (serverProcess.stdin && !serverProcess.stdin.destroyed) {
                serverProcess.stdin.write('stop\n');
            } else {
                process.kill(serverProcess.pid, 'SIGTERM');
            }

            setTimeout(() => {
                const currentProcess = this.activeServerProcesses[server.id];
                if (currentProcess) {
                    console.log(`Server ${server.name} did not stop gracefully during restart, force killing.`);
                    try {
                        process.kill(currentProcess.pid, 'SIGKILL');
                    } catch (e) {}
                }
            }, 10000);

        } catch (error) {
            next(error);
        }
    }
    minecraftStatus(req, res) { /* ... */ }
    async searchSpigetPlugins(req, res, next) { /* ... */ }
    async getSpigetPluginVersions(req, res, next) { /* ... */ }
    async listServerPlugins(req, res, next) { /* ... */ }
    async togglePluginEnabledState(req, res, next) { /* ... */ }
    async installPluginToServer(req, res, next) { /* ... */ }
    async uninstallPlugin(req, res, next) { /* ... */ }
    async updateServerSettings(req, res, next) {
        const {
            serverId
        } = req.params;
        const updates = req.body;

        try {
            let servers = this._readServers();
            const serverIndex = servers.findIndex(s => s.id === serverId);

            if (serverIndex === -1) {
                return res.status(404).json({
                    message: 'Server not found.'
                });
            }

            const originalServer = { ...servers[serverIndex]
            };

            // Merge updates into the server object
            const updatedServer = { ...originalServer,
                ...updates
            };

            // For non-proxy servers, update relevant properties in server.properties
            if (updates.port !== undefined && updates.port !== originalServer.port) {
                if (updatedServer.softwareType === 'Velocity') {
                    const tomlPath = path.join(this._getServerFolderPath(updatedServer), 'velocity.toml');
                    if (fs.existsSync(tomlPath)) {
                        const tomlContent = await fsPromises.readFile(tomlPath, 'utf-8');
                        const parsedToml = TOML.parse(tomlContent);
                        parsedToml.bind = `0.0.0.0:${updates.port}`;
                        await fsPromises.writeFile(tomlPath, TOML.stringify(parsedToml), 'utf-8');
                    }
                } else {
                    const serverPropsPath = path.join(this._getServerFolderPath(updatedServer), 'server.properties');
                    let content = '';
                    if (fs.existsSync(serverPropsPath)) {
                        content = await fsPromises.readFile(serverPropsPath, 'utf-8');
                    }
                    let props = parseServerProperties(content);
                    props['server-port'] = updates.port;
                    if (updates.maxPlayers !== undefined) {
                        props['max-players'] = updates.maxPlayers;
                    }
                    const newContent = formatServerProperties(props, content);
                    await fsPromises.writeFile(serverPropsPath, newContent, 'utf-8');
                }
            }


            servers[serverIndex] = updatedServer;
            this._writeServers(servers);

            res.status(200).json({
                message: `Server "${updatedServer.name}" updated successfully.`,
                server: updatedServer
            });
        } catch (error) {
            next(error);
        }
    }

    async getServerProperties(req, res, next) {
        const {
            serverId
        } = req.params;
        try {
            const servers = this._readServers();
            const server = servers.find(s => s.id === serverId);

            if (!server) {
                return res.status(404).json({
                    message: 'Server not found.'
                });
            }

            // Only applies to non-proxy servers
            if (server.softwareType === 'Velocity') {
                return res.status(400).json({
                    message: 'server.properties does not apply to Velocity proxies.'
                });
            }

            const serverPath = this._getServerFolderPath(server);
            const propsPath = path.join(serverPath, 'server.properties');

            if (!fs.existsSync(propsPath)) {
                // If it doesn't exist, we can return an empty object,
                // as saving will create it.
                return res.status(200).json({});
            }

            const content = await fsPromises.readFile(propsPath, 'utf8');
            const properties = parseServerProperties(content);
            res.status(200).json(properties);

        } catch (error) {
            next(error);
        }
    }

    async updateServerProperties(req, res, next) {
        const {
            serverId
        } = req.params;
        const newProperties = req.body;
        try {
            const servers = this._readServers();
            const server = servers.find(s => s.id === serverId);

            if (!server) {
                return res.status(404).json({
                    message: 'Server not found.'
                });
            }
            if (server.softwareType === 'Velocity') {
                return res.status(400).json({
                    message: 'server.properties does not apply to Velocity proxies.'
                });
            }

            const serverPath = this._getServerFolderPath(server);
            const propsPath = path.join(serverPath, 'server.properties');

            let existingContent = '';
            if (fs.existsSync(propsPath)) {
                existingContent = await fsPromises.readFile(propsPath, 'utf8');
            }

            const newContent = formatServerProperties(newProperties, existingContent);

            await fsPromises.writeFile(propsPath, newContent, 'utf8');

            res.status(200).json({
                message: 'server.properties updated successfully. A server restart is required for changes to take effect.'
            });

        } catch (error) {
            next(error);
        }
    }

    async getVelocityToml(req, res, next) {
        const {
            serverId
        } = req.params;
        try {
            const servers = this._readServers();
            const server = servers.find(s => s.id === serverId);

            if (!server) return res.status(404).json({
                message: 'Server not found.'
            });
            if (server.softwareType !== 'Velocity') return res.status(400).json({
                message: 'This is not a Velocity server.'
            });

            const tomlPath = path.join(this._getServerFolderPath(server), 'velocity.toml');
            if (!fs.existsSync(tomlPath)) return res.status(200).json({});

            const content = await fsPromises.readFile(tomlPath, 'utf8');
            res.status(200).json(TOML.parse(content));
        } catch (error) {
            next(error);
        }
    }

    async updateVelocityToml(req, res, next) {
        const {
            serverId
        } = req.params;
        const newTomlData = req.body;
        try {
            const servers = this._readServers();
            const server = servers.find(s => s.id === serverId);

            if (!server) return res.status(404).json({
                message: 'Server not found.'
            });
            if (server.softwareType !== 'Velocity') return res.status(400).json({
                message: 'This is not a Velocity server.'
            });

            const tomlPath = path.join(this._getServerFolderPath(server), 'velocity.toml');
            const newContent = TOML.stringify(newTomlData);
            await fsPromises.writeFile(tomlPath, newContent, 'utf8');

            res.status(200).json({
                message: 'velocity.toml updated successfully. A proxy restart is required for changes to take effect.'
            });
        } catch (error) {
            next(error);
        }
    }


    addProxy(req, res, next) {
        res.status(501).json({
            message: "Not Implemented"
        });
    }
    listProxies(req, res, next) {
        try {
            res.status(200).json(this._readProxies());
        } catch (e) {
            next(e);
        }
    }
    removeProxy(req, res, next) {
        res.status(501).json({
            message: "Not Implemented"
        });
    }
    startProxy(req, res) {
        res.status(501).json({
            message: "Not Implemented"
        });
    }
    stopProxy(req, res) {
        res.status(501).json({
            message: "Not Implemented"
        });
    }
    proxyStatus(req, res) {
        res.status(501).json({
            message: "Not Implemented"
        });
    }

    async createBackup(req, res, next) {
        const {
            serverId
        } = req.params;
        try {
            const servers = this._readServers();
            const server = servers.find(s => s.id === serverId);
            if (!server) {
                return res.status(404).json({
                    message: 'Server not found.'
                });
            }

            const serverFolderPath = this._getServerFolderPath(server);
            if (!fs.existsSync(serverFolderPath)) {
                return res.status(404).json({
                    message: 'Server directory to back up does not exist.'
                });
            }

            const backupFolderPath = this._getBackupFolderPath(server);
            await fsPromises.mkdir(backupFolderPath, {
                recursive: true
            });

            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-');
            const backupFileName = `backup-${timestamp}.zip`;
            const outputPath = path.join(backupFolderPath, backupFileName);

            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', {
                zlib: {
                    level: 9
                }
            });

            output.on('close', () => {
                console.log(`Backup created successfully for server ${serverId}: ${backupFileName}`);
                res.status(201).json({
                    message: `Backup "${backupFileName}" created successfully.`
                });
            });

            archive.on('warning', (err) => {
                if (err.code === 'ENOENT') {
                    console.warn(`Archiver warning: ${err.message}`);
                } else {
                    throw err;
                }
            });

            archive.on('error', (err) => {
                throw err;
            });

            archive.pipe(output);
            archive.directory(serverFolderPath, false);
            await archive.finalize();

        } catch (error) {
            next(error);
        }
    }

    async listBackups(req, res, next) {
        const {
            serverId
        } = req.params;
        try {
            const servers = this._readServers();
            const server = servers.find(s => s.id === serverId);
            if (!server) {
                return res.status(404).json({
                    message: 'Server not found.'
                });
            }

            const backupFolderPath = this._getBackupFolderPath(server);
            if (!fs.existsSync(backupFolderPath)) {
                return res.status(200).json([]); // No backup directory means no backups
            }

            const files = await fsPromises.readdir(backupFolderPath);
            const backupDetailsPromises = files
                .filter(file => file.endsWith('.zip'))
                .map(async file => {
                    const filePath = path.join(backupFolderPath, file);
                    try {
                        const stats = await fsPromises.stat(filePath);
                        const sizeInBytes = stats.size;
                        let formattedSize;
                        if (sizeInBytes < 1024) {
                            formattedSize = `${sizeInBytes} B`;
                        } else if (sizeInBytes < 1024 * 1024) {
                            formattedSize = `${(sizeInBytes / 1024).toFixed(1)} KB`;
                        } else if (sizeInBytes < 1024 * 1024 * 1024) {
                            formattedSize = `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
                        } else {
                            formattedSize = `${(sizeInBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
                        }

                        return {
                            fileName: file,
                            size: formattedSize,
                            createdAt: stats.birthtime.toISOString(),
                        };
                    } catch (statError) {
                        console.error(`Could not stat file ${filePath}:`, statError);
                        return null;
                    }
                });

            const backupDetails = (await Promise.all(backupDetailsPromises))
                .filter(Boolean)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            res.status(200).json(backupDetails);
        } catch (error) {
            next(error);
        }
    }

    async restoreBackup(req, res, next) {
        const {
            serverId,
            fileName
        } = req.params;
        try {
            const servers = this._readServers();
            const server = servers.find(s => s.id === serverId);
            if (!server) {
                return res.status(404).json({
                    message: 'Server not found.'
                });
            }
            if (server.status !== 'Offline') {
                return res.status(400).json({
                    message: 'Server must be offline to perform a restore.'
                });
            }

            const serverFolderPath = this._getServerFolderPath(server);
            const backupFilePath = path.join(this._getBackupFolderPath(server), fileName);

            if (!fs.existsSync(backupFilePath)) {
                return res.status(404).json({
                    message: 'Backup file not found.'
                });
            }
            if (!fs.existsSync(serverFolderPath)) {
                await fsPromises.mkdir(serverFolderPath, {
                    recursive: true
                });
            }

            console.log(`[Restore] Starting restore for server ${server.name} from ${fileName}`);
            // Delete current server contents
            const items = await fsPromises.readdir(serverFolderPath);
            for (const item of items) {
                await fsPromises.rm(path.join(serverFolderPath, item), {
                    recursive: true,
                    force: true
                });
            }

            // Extract backup
            await extract(backupFilePath, {
                dir: serverFolderPath
            });

            res.status(200).json({
                message: `Server successfully restored from "${fileName}".`
            });
        } catch (error) {
            next(error);
        }
    }

    async downloadBackup(req, res, next) {
        const {
            serverId,
            fileName
        } = req.params;
        try {
            const servers = this._readServers();
            const server = servers.find(s => s.id === serverId);
            if (!server) {
                return res.status(404).json({
                    message: 'Server not found.'
                });
            }

            const backupFilePath = path.join(this._getBackupFolderPath(server), fileName);
            if (!fs.existsSync(backupFilePath)) {
                return res.status(404).json({
                    message: 'Backup file not found.'
                });
            }

            res.download(backupFilePath, fileName, (err) => {
                if (err) {
                    console.error(`Error downloading backup ${fileName} for server ${serverId}:`, err);
                    if (!res.headersSent) {
                        next(err);
                    }
                }
            });
        } catch (error) {
            next(error);
        }
    }

    async deleteBackup(req, res, next) {
        const {
            serverId,
            fileName
        } = req.params;
        try {
            const servers = this._readServers();
            const server = servers.find(s => s.id === serverId);
            if (!server) {
                return res.status(404).json({
                    message: 'Server not found.'
                });
            }

            const backupFilePath = path.join(this._getBackupFolderPath(server), fileName);
            if (!fs.existsSync(backupFilePath)) {
                return res.status(404).json({
                    message: 'Backup file not found.'
                });
            }

            await fsPromises.unlink(backupFilePath);
            res.status(200).json({
                message: `Backup "${fileName}" deleted successfully.`
            });
        } catch (error) {
            next(error);
        }
    }

    // --- NEW MODRINTH METHODS ---

    async searchModrinth(req, res, next) {
        const query = req.query.q || '';
        const facets = JSON.stringify([
            ["project_type:modpack"]
        ]);
        const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}&limit=21`;

        console.log(`[Modrinth] Searching for modpacks with query: "${query}"`);

        try {
            const data = await httpsGetJson(url);
            res.status(200).json(data);
        } catch (error) {
            next(error);
        }
    }

    async getModrinthProjectVersions(req, res, next) {
        const {
            projectId
        } = req.params;
        const loaders = JSON.stringify(["fabric", "forge", "quilt", "neoforge"]);
        const url = `https://api.modrinth.com/v2/project/${projectId}/version?loaders=${encodeURIComponent(loaders)}`;

        console.log(`[Modrinth] Getting versions for project ID: ${projectId}`);

        try {
            const data = await httpsGetJson(url);
            res.status(200).json(data);
        } catch (error) {
            next(error);
        }
    }

    createFromModpack(req, res, next) {
        const {
            serverName,
            port,
            modpackVersionId
        } = req.body;
        if (!serverName || !port || !modpackVersionId) {
            return res.status(400).json({
                message: "Missing required fields for modpack creation."
            });
        }

        // Fire-and-forget the background task
        this._background_createFromModpack(req.body)
            .catch(err => {
                // This catch is for programming errors in the background task itself,
                // not for operational errors like download failures, which are handled inside.
                console.error(`[FATAL] Unhandled error in _background_createFromModpack for ${serverName}:`, err);
            });

        // Immediately respond to the client
        res.status(202).json({
            message: `Server "${serverName}" creation has been initiated. It will appear on the dashboard shortly.`
        });
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
            const versionDetails = await httpsGetJson(`https://api.modrinth.com/v2/version/${modpackVersionId}`);
            const serverFile = versionDetails.files.find(f => f.primary && f.filename.endsWith('.mrpack'));
            if (!serverFile) throw new Error("Could not find a primary server pack (.mrpack) in this version.");

            await fsPromises.mkdir(serverPath, {
                recursive: true
            });
            tempExtractDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'modpack-'));
            console.log(`[Modrinth Create] Downloading ${serverFile.filename} to ${tempExtractDir}`);
            const mrpackPath = await downloadFile(serverFile.url, tempExtractDir, serverFile.filename);
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
                await downloadFile(file.downloads[0], targetDir, path.basename(file.path));
            }

            let jarFileName;
            const isFabric = versionDetails.loaders.includes('fabric');
            if (isFabric) {
                console.log('[Modrinth Create] Detected Fabric modpack. Fetching direct server launcher.');
                const minecraftVersion = manifest.dependencies.minecraft;
                const loaderVersion = manifest.dependencies['fabric-loader'];
                if (!minecraftVersion || !loaderVersion) throw new Error("Could not determine Minecraft or Fabric Loader version from modpack manifest.");

                const fabricInstallersMeta = await httpsGetJson(`https://meta.fabricmc.net/v2/versions/installer`);
                const latestStableInstaller = fabricInstallersMeta.find(v => v.stable === true);
                if (!latestStableInstaller) throw new Error("Could not find a stable Fabric installer version.");

                const installerVersion = latestStableInstaller.version;
                const launcherDownloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${minecraftVersion}/${loaderVersion}/${installerVersion}/server/jar`;
                jarFileName = `fabric-server-launch.jar`; // Use a consistent name
                console.log(`[Modrinth Create] Downloading Fabric server launcher as: ${jarFileName}`);
                await downloadFile(launcherDownloadUrl, serverPath, jarFileName);
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
            
                        const serverEntryName = newServer.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                        tomlConfig.servers[serverEntryName] = `${newServer.ip}:${newServer.port}`;
                        
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

    // --- NEW PAPERTMC API METHODS ---

    async getPaperMCVersions(req, res, next) {
        const {
            project
        } = req.params; // 'paper' or 'velocity'
        if (!['paper', 'velocity'].includes(project)) {
            return res.status(400).json({
                message: 'Invalid project specified.'
            });
        }
        const url = `https://api.papermc.io/v2/projects/${project}`;

        try {
            const data = await httpsGetJson(url);
            res.status(200).json(data);
        } catch (error) {
            console.error(`Error fetching PaperMC versions for ${project}:`, error);
            error.message = `Failed to fetch versions from PaperMC API for ${project}. ${error.message}`;
            next(error);
        }
    }

    async getPaperMCBuilds(req, res, next) {
        const {
            project,
            version
        } = req.params;
        if (!['paper', 'velocity'].includes(project)) {
            return res.status(400).json({
                message: 'Invalid project specified.'
            });
        }
        const url = `https://api.papermc.io/v2/projects/${project}/versions/${version}/builds`;

        try {
            const data = await httpsGetJson(url);
            res.status(200).json(data);
        } catch (error) {
            console.error(`Error fetching PaperMC builds for ${project} v${version}:`, error);
            error.message = `Failed to fetch builds from PaperMC API for ${project} v${version}. ${error.message}`;
            next(error);
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
