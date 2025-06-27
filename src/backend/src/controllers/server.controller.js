
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const TOML = require('@iarna/toml');

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
    return newLines.filter((line, index) => line.trim() !== '' || index !== newLines.length - 1).join('\n');
};

class ServerController {
    constructor(indexControllerInstance) {
        this.indexController = indexControllerInstance;
        console.log("ServerController instantiated.");
    }

    listServers(req, res, next) {
        try {
            res.status(200).json(this.indexController._readServers());
        } catch (e) {
            next(e);
        }
    }

    async createServer(req, res, next) {
        const {
            serverName,
            port,
            serverType,
        } = req.body;
        let { serverVersion } = req.body;

        if (!serverName || !port || !serverType || !serverVersion) {
            return res.status(400).json({
                message: "Missing required fields for server creation."
            });
        }

        try {
            let servers = this.indexController._readServers();
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
            
            console.log(`[Create Server] Build not specified for ${serverType} ${serverVersion}. Fetching latest build...`);
            const buildsResponse = await this.indexController.httpsGetJson(`https://api.papermc.io/v2/projects/${apiProjectName}/versions/${serverVersion}/builds`);
            const latestBuildDetails = buildsResponse.builds.pop(); // Last in array is latest
            if (!latestBuildDetails) {
                return res.status(404).json({ message: `Could not find any builds for ${serverType} version ${serverVersion}. Please check the version number.` });
            }
            const buildNumber = latestBuildDetails.build;
            // Use the full version string from the API response for accuracy
            serverVersion = buildsResponse.version; 
            console.log(`[Create Server] Found latest build for ${serverVersion}: ${buildNumber}`);
            

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
                tags: [],
            };

            const serverFolderPath = this.indexController._getServerFolderPath(newServer);
            await fsPromises.mkdir(serverFolderPath, {
                recursive: true
            });

            const downloadFileName = `${apiProjectName}-${serverVersion}-${buildNumber}.jar`;
            const serverJarPath = path.join(serverFolderPath, downloadFileName);

            if (!fs.existsSync(serverJarPath)) {
                const downloadUrl = `https://api.papermc.io/v2/projects/${apiProjectName}/versions/${serverVersion}/builds/${buildNumber}/downloads/${downloadFileName}`;
                console.log(`[Create Server] JAR not found. Downloading from ${downloadUrl}`);
                await this.indexController.downloadFile(downloadUrl, serverFolderPath, downloadFileName);
            }

            newServer.jarFileName = downloadFileName;

            const eulaPath = path.join(serverFolderPath, 'eula.txt');
            if (!fs.existsSync(eulaPath)) {
                await fsPromises.writeFile(eulaPath, 'eula=true', 'utf-8');
            }

            if (newServer.softwareType === 'PaperMC') {
                await this.indexController._updateServerPropertiesPort(newServer, newServer.port);
            } else if (newServer.softwareType === 'Velocity') {
                const tomlPath = path.join(serverFolderPath, 'velocity.toml');
                if (!fs.existsSync(tomlPath)) {
                    console.log(`[Create Server] Creating default velocity.toml for new proxy ${newServer.name}`);
                    const defaultConfig = {
                        bind: `0.0.0.0:${newServer.port}`,
                        motd: `'A Velocity Server'`,
                        'show-max-players': 500,
                        'online-mode': true,
                        servers: {
                            // Example server, user will need to configure this
                            lobby: '127.0.0.1:25566' 
                        },
                        try: ['lobby'],
                        'player-info-forwarding-mode': 'modern', // The requested change
                        forwarding: {
                            'secret-file': 'forwarding.secret'
                        }
                    };
                    
                    const secretFilePath = path.join(serverFolderPath, 'forwarding.secret');
                    if (!fs.existsSync(secretFilePath)) {
                        const secret = crypto.randomBytes(12).toString('hex');
                        await fsPromises.writeFile(secretFilePath, secret, 'utf-8');
                        console.log(`[Create Server] Generated new forwarding.secret for proxy ${newServer.name}.`);
                    }

                    await fsPromises.writeFile(tomlPath, TOML.stringify(defaultConfig), 'utf-8');
                }
            }
            
            // --- Copy companion plugin ---
            let pluginJarName, pluginSrcPath;
            if (newServer.softwareType === 'PaperMC') {
                pluginJarName = 'spigot-vmanager-plugin-1.0.0.jar';
                pluginSrcPath = path.join(__dirname, '..', '..', '..', 'spigot-plugin', 'target', pluginJarName);
            } else if (newServer.softwareType === 'Velocity') {
                pluginJarName = 'velocity-manager-plugin-1.0.0.jar';
                pluginSrcPath = path.join(__dirname, '..', '..', '..', 'velocity-plugin', 'target', pluginJarName);
            }

            if (pluginJarName && pluginSrcPath) {
                if (fs.existsSync(pluginSrcPath)) {
                    const pluginsDestDir = path.join(serverFolderPath, 'plugins');
                    await fsPromises.mkdir(pluginsDestDir, { recursive: true });
                    const pluginDestPath = path.join(pluginsDestDir, pluginJarName);
                    await fsPromises.copyFile(pluginSrcPath, pluginDestPath);
                    console.log(`[Create Server] Copied ${pluginJarName} to new server's plugins folder.`);
                } else {
                    console.warn(`[Create Server] Companion plugin JAR not found at ${pluginSrcPath}. It was not copied. Please build the plugins first.`);
                }
            }
            // --- End plugin copy ---


            servers.push(newServer);
            this.indexController._writeServers(servers);

            if (newServer.softwareType === 'PaperMC') {
                const allServers = this.indexController._readServers();
                const proxyServer = allServers.find(s => s.softwareType === 'Velocity');

                if (proxyServer) {
                    const proxyPath = this.indexController._getServerFolderPath(proxyServer);
                    const tomlPath = path.join(proxyPath, 'velocity.toml');

                    try {
                        let tomlConfig = {};
                        if (fs.existsSync(tomlPath)) {
                            const tomlContent = await fsPromises.readFile(tomlPath, 'utf8');
                            tomlConfig = TOML.parse(tomlContent);
                        } else {
                            tomlConfig = {
                                servers: {},
                                'online-mode': true,
                            };
                        }

                        if (!tomlConfig.servers) {
                            tomlConfig.servers = {};
                        }
                        if (!tomlConfig['forced-hosts']) {
                            tomlConfig['forced-hosts'] = {};
                        }

                        const serverEntryName = newServer.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                        tomlConfig.servers[serverEntryName] = `${newServer.ip}:${newServer.port}`;

                        const forcedHostKey = `${serverEntryName}.example.com`;
                        tomlConfig['forced-hosts'][forcedHostKey] = [serverEntryName];

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
                        
                        await this.indexController._syncVelocitySecret(newServer, proxyServer);

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
                    console.log(`[Create Server] New PaperMC server created, but no Velocity proxy was found to link it to.`);
                }
            }

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
    
    async createFromModpack(req, res, next) {
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
        this.indexController._background_createFromModpack(req.body)
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

    async deleteServerWithRecovery(req, res, next) {
        const {
            serverId
        } = req.params;
        try {
            const servers = this.indexController._readServers();
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

            this.indexController._cleanupServerProcess(server.id); // Clean up active process tracking

            const serverPath = this.indexController._getServerFolderPath(server);

            if (fs.existsSync(serverPath)) {
                await fsPromises.mkdir(this.indexController.RECOVERY_DIR, {
                    recursive: true
                });
                const recoveryFolderName = `${this.indexController.sanitize(server.name)}_${Date.now()}`;
                const recoveryDestPath = path.join(this.indexController.RECOVERY_DIR, recoveryFolderName);

                await fsPromises.rename(serverPath, recoveryDestPath);

                const recoveryFilePath = path.join(this.indexController.RECOVERY_DIR, 'recovery.json');
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

            this.indexController._writeServers(servers); // Write the updated servers list (with the server removed)

            res.status(200).json({
                message: `Server "${server.name}" has been successfully moved to recovery.`
            });

        } catch (error) {
            next(error);
        }
    }

    async listRecoverableServers(req, res, next) {
        try {
            const recoveryFilePath = path.join(this.indexController.RECOVERY_DIR, 'recovery.json');
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
            const recoveryFilePath = path.join(this.indexController.RECOVERY_DIR, 'recovery.json');
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
            if (serverToRestore.tags === undefined) {
              serverToRestore.tags = [];
            }


            const originalPath = this.indexController._getServerFolderPath(serverToRestore);
            const recoveredPath = path.join(this.indexController.RECOVERY_DIR, recoveryFolderName);

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

            const servers = this.indexController._readServers();
            servers.push(serverToRestore);
            this.indexController._writeServers(servers);

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
            const recoveryFilePath = path.join(this.indexController.RECOVERY_DIR, 'recovery.json');
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
            const folderToDelete = path.join(this.indexController.RECOVERY_DIR, recoveryFolderName);
            if (fs.existsSync(folderToDelete)) {
                await fsPromises.rm(folderToDelete, {
                    recursive: true,
                    force: true
                });
            }

            // Delete associated backups folder
            const backupsFolderToDelete = path.join(this.indexController.BACKUPS_DIR, serverId);
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
    
    async getBannedPlayers(req, res, next) {
        res.status(501).json({ message: "Not Implemented" });
    }
    
    async startMinecraft(req, res, next) {
        const {
            serverName
        } = req.body;
        if (!serverName) {
            return res.status(400).json({
                message: "Server name is required."
            });
        }

        try {
            let servers = this.indexController._readServers();
            const serverIndex = servers.findIndex(s => s.name === serverName);
            let server = servers[serverIndex];

            if (!server) {
                return res.status(404).json({
                    message: `Server "${serverName}" not found.`
                });
            }

            if (this.indexController.activeServerProcesses[server.id]) {
                return res.status(409).json({
                    message: `Server "${serverName}" is already running or in a transitional state.`
                });
            }

            const serverFolderPath = this.indexController._getServerFolderPath(server);
            if (!fs.existsSync(serverFolderPath)) {
                await fsPromises.mkdir(serverFolderPath, {
                    recursive: true
                });
            }

            // --- Add/Update companion plugin on start ---
            let pluginJarName, pluginSrcPath;
            if (server.softwareType === 'PaperMC') {
                pluginJarName = 'spigot-vmanager-plugin-1.0.0.jar';
                pluginSrcPath = path.join(__dirname, '..', '..', '..', 'spigot-plugin', 'target', pluginJarName);
            } else if (server.softwareType === 'Velocity') {
                pluginJarName = 'velocity-manager-plugin-1.0.0.jar';
                pluginSrcPath = path.join(__dirname, '..', '..', '..', 'velocity-plugin', 'target', pluginJarName);
            }

            if (pluginJarName && pluginSrcPath) {
                if (fs.existsSync(pluginSrcPath)) {
                    const pluginsDestDir = path.join(serverFolderPath, 'plugins');
                    await fsPromises.mkdir(pluginsDestDir, { recursive: true });
                    const pluginDestPath = path.join(pluginsDestDir, pluginJarName);
                    
                    await fsPromises.copyFile(pluginSrcPath, pluginDestPath);
                    console.log(`[Start Server Check] Ensured latest companion plugin '${pluginJarName}' is present for server '${server.name}'.`);
                } else {
                    console.warn(`[Start Server Check] Companion plugin source JAR not found at ${pluginSrcPath}. It cannot be automatically installed.`);
                }
            }
            // --- End plugin add/update ---

            // This block handles cases where the JAR might be missing for simple server types
            const serverJarPath = server.jarFileName ? path.join(serverFolderPath, server.jarFileName) : null;
            if (['PaperMC', 'Velocity'].includes(server.softwareType) && (!server.jarFileName || !fs.existsSync(serverJarPath))) {
                const isPaper = server.softwareType === 'PaperMC';
                const apiProjectName = isPaper ? 'paper' : 'velocity';
                const buildNumber = isPaper ? server.paperBuild : server.velocityBuild;
                const downloadFileName = `${apiProjectName}-${server.serverVersion}-${buildNumber}.jar`;
                const downloadUrl = `https://api.papermc.io/v2/projects/${apiProjectName}/versions/${server.serverVersion}/builds/${buildNumber}/downloads/${downloadFileName}`;

                console.log(`[Start Server] JAR not found for existing server. Re-downloading from ${downloadUrl}`);
                await this.indexController.downloadFile(downloadUrl, serverFolderPath, downloadFileName);

                server.jarFileName = downloadFileName;
                servers[serverIndex] = server;
                this.indexController._writeServers(servers);
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
            this.indexController.activeLogFileStreams[server.id] = logStream;

            this.indexController.activeServerProcesses[server.id] = serverProcess;

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
                    if (match) this.indexController._updatePlayerList(server.id, match[0].split(' ')[0], 'add');
                } else if (text.includes("left the game")) {
                    const match = text.match(/\w+ left the game/);
                    if (match) this.indexController._updatePlayerList(server.id, match[0].split(' ')[0], 'remove');
                }

                // More robust 'Done' check for different server types
                const srvs = this.indexController._readServers();
                const srvIdx = srvs.findIndex(s => s.id === server.id);
                if (srvIdx !== -1) {
                    const currentServer = srvs[srvIdx];
                    const donePatternPaperAndVelocity = /Done \([\d\.]+s\)!/;
                    const donePatternForge = /Server marked as active for authlib/; // A common Forge message
                    
                    if ((currentServer.status === 'Starting' || currentServer.status === 'restarting') && (donePatternPaperAndVelocity.test(text) || donePatternForge.test(text))) {
                        console.log(`[Status Update] Server ${currentServer.name} detected as fully online.`);
                        srvs[srvIdx].status = 'Online';
                        this.indexController._writeServers(srvs);
                    }
                }
            });

            serverProcess.on('spawn', () => {
                let srvs = this.indexController._readServers();
                let srvIdx = srvs.findIndex(s => s.id === server.id);
                if (srvIdx !== -1) {
                    const currentServerStateInSpawn = srvs[srvIdx];
                    // Set status to Starting or restarting, not Online immediately
                    srvs[srvIdx].status = currentServerStateInSpawn.status === 'restarting' ? 'restarting' : 'Starting';
                    srvs[srvIdx].pid = serverProcess.pid;
                    srvs[srvIdx].consoleLogFile = consoleLogFilePath;
                    this.indexController._writeServers(srvs);
                }
                res.status(200).json({
                    message: `Server "${server.name}" is now starting.`,
                    server: srvs[srvIdx]
                });
            });

            serverProcess.on('exit', (code) => {
                console.log(`Server ${server.name} (PID: ${serverProcess.pid}) exited with code ${code}.`);
                const logStream = this.indexController.activeLogFileStreams[server.id];
                if (logStream) {
                    logStream.end();
                }

                const servers = this.indexController._readServers();
                const serverIndex = servers.findIndex(s => s.id === server.id);
                if (serverIndex === -1) {
                    this.indexController._cleanupServerProcess(server.id);
                    return;
                }

                const currentServer = servers[serverIndex];

                if (currentServer.status === 'restarting' || currentServer.status === 'stopping') {
                    console.log(`Exit detected for a managed shutdown of server ${server.name}. Setting status to Offline.`);
                    servers[serverIndex].status = 'Offline';
                    this.indexController._writeServers(servers);
                } else {
                    console.log(`Unexpected exit for server ${server.name}. Marking as Error.`);
                    servers[serverIndex].status = 'Error';
                    this.indexController._writeServers(servers);
                }
                // General cleanup of process and streams
                this.indexController._cleanupServerProcess(server.id);
            });

            serverProcess.on('error', (err) => {
                console.error(`Failed to start server ${server.name}:`, err);
                const logStream = this.indexController.activeLogFileStreams[server.id];
                if (logStream) {
                    logStream.end();
                }
                const servers = this.indexController._readServers();
                const serverIndex = servers.findIndex(s => s.id === server.id);
                 if (serverIndex !== -1) {
                    servers[serverIndex].status = 'Error';
                    this.indexController._writeServers(servers);
                 }
                 this.indexController._cleanupServerProcess(server.id);
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
            let servers = this.indexController._readServers();
            const serverIndex = servers.findIndex(s => s.name === serverName);
            if (serverIndex === -1) {
                return res.status(404).json({
                    message: `Server "${serverName}" not found.`
                });
            }

            let server = servers[serverIndex];
            const serverProcess = this.indexController.activeServerProcesses[server.id];

            if (!serverProcess || server.status === 'Offline') {
                // If it's already offline, just ensure the state is consistent.
                if (server.status !== 'Offline') {
                    servers[serverIndex].status = 'Offline';
                    servers[serverIndex].pid = undefined;
                    this.indexController._writeServers(servers);
                }
                return res.status(200).json({
                    message: `Server "${server.name}" is already offline.`
                });
            }

            servers[serverIndex].status = 'stopping';
            this.indexController._writeServers(servers);
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
                const currentProcess = this.indexController.activeServerProcesses[server.id];
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
            let servers = this.indexController._readServers();
            const serverIndex = servers.findIndex(s => s.name === serverName);
            if (serverIndex === -1) {
                return res.status(404).json({
                    message: `Server "${serverName}" not found.`
                });
            }
            let server = servers[serverIndex];
            const serverProcess = this.indexController.activeServerProcesses[server.id];

            if (!serverProcess || server.status === 'Offline') {
                console.log(`Restart called on offline server ${serverName}. Starting it.`);
                return this.startMinecraft(req, res, next);
            }

            servers[serverIndex].status = 'restarting';
            this.indexController._writeServers(servers);
            res.status(200).json({
                message: `Restarting server "${server.name}"...`,
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
                const currentProcess = this.indexController.activeServerProcesses[server.id];
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

    minecraftStatus(req, res) {
        res.status(501).json({ message: "Not Implemented" });
    }

    async updateServerSettings(req, res, next) {
        const {
            serverId
        } = req.params;
        const updates = req.body;

        try {
            let servers = this.indexController._readServers();
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

             // Explicitly handle tags to ensure it's an array
            if (updates.tags !== undefined) {
              if (Array.isArray(updates.tags)) {
                updatedServer.tags = updates.tags;
              } else {
                // Handle cases where it might not be an array, though client should send one
                updatedServer.tags = []; 
              }
            }

            // For non-proxy servers, update relevant properties in server.properties
            if (updates.port !== undefined && updates.port !== originalServer.port) {
                if (updatedServer.softwareType === 'Velocity') {
                    const tomlPath = path.join(this.indexController._getServerFolderPath(updatedServer), 'velocity.toml');
                    if (fs.existsSync(tomlPath)) {
                        const tomlContent = await fsPromises.readFile(tomlPath, 'utf-8');
                        const parsedToml = TOML.parse(tomlContent);
                        parsedToml.bind = `0.0.0.0:${updates.port}`;
                        await fsPromises.writeFile(tomlPath, TOML.stringify(parsedToml), 'utf-8');
                    }
                } else {
                    const serverPropsPath = path.join(this.indexController._getServerFolderPath(updatedServer), 'server.properties');
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
            this.indexController._writeServers(servers);

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
            const servers = this.indexController._readServers();
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

            const serverPath = this.indexController._getServerFolderPath(server);
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
            const servers = this.indexController._readServers();
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

            const serverPath = this.indexController._getServerFolderPath(server);
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
            const servers = this.indexController._readServers();
            const server = servers.find(s => s.id === serverId);

            if (!server) return res.status(404).json({
                message: 'Server not found.'
            });
            if (server.softwareType !== 'Velocity') return res.status(400).json({
                message: 'This is not a Velocity server.'
            });

            const tomlPath = path.join(this.indexController._getServerFolderPath(server), 'velocity.toml');
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
            const servers = this.indexController._readServers();
            const server = servers.find(s => s.id === serverId);

            if (!server) return res.status(404).json({
                message: 'Server not found.'
            });
            if (server.softwareType !== 'Velocity') return res.status(400).json({
                message: 'This is not a Velocity server.'
            });

            const tomlPath = path.join(this.indexController._getServerFolderPath(server), 'velocity.toml');
            const newContent = TOML.stringify(newTomlData);
            await fsPromises.writeFile(tomlPath, newContent, 'utf8');

            res.status(200).json({
                message: 'velocity.toml updated successfully. A proxy restart is required for changes to take effect.'
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = ServerController;
