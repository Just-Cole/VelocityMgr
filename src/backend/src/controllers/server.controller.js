

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const TOML = require('@iarna/toml');
const extract = require('extract-zip');

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

const velocityTomlTemplate = `
# Config version. Do not change this
config-version = "2.7"
# What port should the proxy be bound to? By default, we'll bind to all addresses on port 25565.
bind = "0.0.0.0:25565"
# What should be the MOTD? This gets displayed when the player adds your server to
# their server list. Only MiniMessage format is accepted.
motd = "<#09add3>A Velocity Server"
# What should we display for the maximum number of players? (Velocity does not support a cap
# on the number of players online.)
show-max-players = 500
# Should we authenticate players with Mojang? By default, this is on.
online-mode = true
# Should the proxy enforce the new public key security standard? By default, this is on.
force-key-authentication = true
# If client's ISP/AS sent from this proxy is different from the one from Mojang's
# authentication server, the player is kicked. This disallows some VPN and proxy
# connections but is a weak form of protection.
prevent-client-proxy-connections = false

[forwarding]
# Should we forward IP addresses and other data to backend servers?
# Available options:
# - "none":        No forwarding will be done. All players will appear to be connecting
#                  from the proxy and will have offline-mode UUIDs.
# - "legacy":      Forward player IPs and UUIDs in a BungeeCord-compatible format. Use this
#                  if you run servers using Minecraft 1.12 or lower.
# - "bungeeguard": Forward player IPs and UUIDs in a format supported by the BungeeGuard
#                  plugin. Use this if you run servers using Minecraft 1.12 or lower, and are
#                  unable to implement network level firewalling (on a shared host).
# - "modern":      Forward player IPs and UUIDs as part of the login process using
#                  Velocity's native forwarding. Only applicable for Minecraft 1.13 or higher.
player-info-forwarding-mode = "modern"
# If you are using modern or BungeeGuard IP forwarding, configure a file that contains a unique secret here.
# The file is expected to be UTF-8 encoded and not empty.
forwarding-secret-file = "forwarding.secret"

[servers]
# Configure your servers here. Each key represents the server's name, and the value
# represents the IP address of the server to connect to.
try = []

[forced-hosts]
# Configure your forced hosts here.
# "lobby.example.com" = ["lobby"]

[advanced]
# How large a Minecraft packet has to be before we compress it. Setting this to zero will
# compress all packets, and setting it to -1 will disable compression entirely.
compression-threshold = 256
# How much compression should be done (from 0-9). The default is -1, which uses the
# default level of 6.
compression-level = -1
# How fast (in milliseconds) are clients allowed to connect after the last connection? By
# default, this is three seconds. Disable this by setting this to 0.
login-ratelimit = 3000
# Specify a custom timeout for connection timeouts here. The default is five seconds.
connection-timeout = 5000
# Specify a read timeout for connections here. The default is 30 seconds.
read-timeout = 30000
# Enables compatibility with HAProxy's PROXY protocol. If you don't know what this is for, then
# don't enable it.
haproxy-protocol = false
# Enables TCP fast open support on the proxy. Requires the proxy to run on Linux.
tcp-fast-open = false
# Enables BungeeCord plugin messaging channel support on Velocity.
bungee-plugin-message-channel = true
# Shows ping requests to the proxy from clients.
show-ping-requests = false
# By default, Velocity will attempt to gracefully handle situations where the user unexpectedly
# loses connection to the server without an explicit disconnect message by attempting to fall the
# user back, except in the case of read timeouts. BungeeCord will disconnect the user instead. You
# can disable this setting to use the BungeeCord behavior.
failover-on-unexpected-server-disconnect = true
# Declares the proxy commands to 1.13+ clients.
announce-proxy-commands = true
# Enables the logging of commands
log-command-executions = false
# Enables logging of player connections when connecting to the proxy, switching servers
# and disconnecting from the proxy.
log-player-connections = true
# Allows players transferred from other hosts via the
# Transfer packet (Minecraft 1.20.5) to be received.
accepts-transfers = false
# Enables support for SO_REUSEPORT. This may help the proxy scale better on multicore systems
# with a lot of incoming connections, and provide better CPU utilization than the existing
# strategy of having a single thread accepting connections and distributing them to worker
# threads. Disabled by default. Requires Linux or macOS.
enable-reuse-port = false
# How fast (in milliseconds) are clients allowed to send commands after the last command
# By default this is 50ms (20 commands per second)
command-rate-limit = 50
# Should we forward commands to the backend upon being rate limited?
# This will forward the command to the server instead of processing it on the proxy.
# Since most server implementations have a rate limit, this will prevent the player
# from being able to send excessive commands to the server.
forward-commands-if-rate-limited = true
# How many commands are allowed to be sent after the rate limit is hit before the player is kicked?
# Setting this to 0 or lower will disable this feature.
kick-after-rate-limited-commands = 0
# How fast (in milliseconds) are clients allowed to send tab completions after the last tab completion
tab-complete-rate-limit = 10
# How many tab completions are allowed to be sent after the rate limit is hit before the player is kicked?
# Setting this to 0 or lower will disable this feature.
kick-after-rate-limited-tab-completes = 0
`;


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

    async _addServerToProxyConfig(serverToAdd, proxyServer) {
        try {
            const tomlPath = path.join(this.indexController._getServerFolderPath(proxyServer), 'velocity.toml');
            let tomlContent = '';
            
            if (fs.existsSync(tomlPath)) {
                tomlContent = await fsPromises.readFile(tomlPath, 'utf8');
            } else {
                console.warn(`[Link Server] velocity.toml not found for proxy ${proxyServer.name}. Cannot link server.`);
                return;
            }

            const parsedToml = TOML.parse(tomlContent);
            if (!parsedToml.servers) parsedToml.servers = {};
            
            const serverEntryName = serverToAdd.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const serverAddress = `${serverToAdd.ip}:${serverToAdd.port}`;

            parsedToml.servers[serverEntryName] = serverAddress;

            if (!parsedToml.try) parsedToml.try = [];
            if (!parsedToml.try.includes(serverEntryName)) {
                // Add the new server to the beginning of the try list to make it the default
                parsedToml.try.unshift(serverEntryName);
            }
            
            if (!parsedToml['forced-hosts']) parsedToml['forced-hosts'] = {};
            const forcedHostKey = `${serverEntryName}.example.com`;
            if (!parsedToml['forced-hosts'][forcedHostKey]) {
                parsedToml['forced-hosts'][forcedHostKey] = [serverEntryName];
            }

            await fsPromises.writeFile(tomlPath, TOML.stringify(parsedToml), 'utf8');
            console.log(`[Link Server] Successfully added new server '${serverToAdd.name}' to proxy '${proxyServer.name}' config.`);
        } catch (tomlError) {
            console.error(`[Link Server] Failed to update proxy config for new server:`, tomlError);
        }
    }
    
    async createServer(req, res, next) {
        const {
            serverName,
            port,
            serverType,
            serverVersion,
            createHubServer,
            hubVersion,
            linkToProxy,
        } = req.body;
    
        if (!serverName || !port || !serverType || !serverVersion) {
            return res.status(400).json({ message: "Missing required fields for server creation." });
        }
    
        try {
            let allServers = this.indexController._readServers();
            const safeServers = allServers.filter(s => s && s.name && s.port);
            
            if (safeServers.some(s => s.name.toLowerCase() === serverName.toLowerCase())) {
                return res.status(409).json({ message: `A server with the name "${serverName}" already exists.` });
            }
            if (safeServers.some(s => s.port === parseInt(port,10))) {
                return res.status(409).json({ message: `A server is already using port ${port}.` });
            }
            
            const isPaper = serverType === 'PaperMC';
            const apiProjectName = isPaper ? 'paper' : 'velocity';

            const buildsResponse = await this.indexController.httpsGetJson(`https://api.papermc.io/v2/projects/${apiProjectName}/versions/${serverVersion}/builds`);
            const latestBuildDetails = buildsResponse.builds.pop();
            if (!latestBuildDetails) throw new Error(`Could not find any builds for ${serverType} version ${serverVersion}.`);
            const buildNumber = latestBuildDetails.build;
            const fullVersionString = buildsResponse.version;

            const newServer = {
                id: uuidv4(),
                name: serverName,
                port: parseInt(port, 10),
                ip: '127.0.0.1',
                softwareType: serverType,
                serverVersion: fullVersionString,
                paperBuild: isPaper ? buildNumber : undefined,
                velocityBuild: !isPaper ? buildNumber : undefined,
                status: 'Offline',
                connectedPlayers: [],
                maxPlayers: 20,
                minRam: this.indexController.config.default_min_ram || '1024M',
                maxRam: this.indexController.config.default_max_ram || '2048M',
                description: `A new ${serverType} server.`,
            };
    
            const serverFolderPath = this.indexController._getServerFolderPath(newServer);
            await fsPromises.mkdir(serverFolderPath, { recursive: true });
    
            const downloadFileName = `${apiProjectName}-${fullVersionString}-${buildNumber}.jar`;
            const serverJarPath = path.join(serverFolderPath, downloadFileName);
    
            if (!fs.existsSync(serverJarPath)) {
                const downloadUrl = `https://api.papermc.io/v2/projects/${apiProjectName}/versions/${fullVersionString}/builds/${buildNumber}/downloads/${downloadFileName}`;
                await this.indexController.downloadFile(downloadUrl, serverFolderPath, downloadFileName);
            }
            
            newServer.jarFileName = downloadFileName;
            await fsPromises.writeFile(path.join(serverFolderPath, 'eula.txt'), 'eula=true', 'utf-8');

             if (isPaper) {
                await this.indexController._updateServerPropertiesPort(newServer, newServer.port);
            } else { // Velocity
                const tomlPath = path.join(serverFolderPath, 'velocity.toml');
                if (!fs.existsSync(tomlPath)) {
                    const finalTomlContent = velocityTomlTemplate.replace(/bind\s*=\s*"0\.0\.0\.0:25565"/, `bind = "0.0.0.0:${newServer.port}"`);
                    await fsPromises.writeFile(tomlPath, finalTomlContent.trim(), 'utf-8');
                    const secretFilePath = path.join(serverFolderPath, 'forwarding.secret');
                    if (!fs.existsSync(secretFilePath)) {
                        await fsPromises.writeFile(secretFilePath, crypto.randomBytes(12).toString('hex'), 'utf-8');
                    }
                }
            }
    
            allServers.push(newServer);

            // --- Link to existing proxy if requested ---
            if (linkToProxy && linkToProxy !== 'none' && newServer.softwareType === 'PaperMC') {
                const proxyServer = allServers.find(s => s.id === linkToProxy && s.softwareType === 'Velocity');
                if (proxyServer) {
                    console.log(`[Create Server] Linking new server '${newServer.name}' to proxy '${proxyServer.name}'.`);
                    await this._addServerToProxyConfig(newServer, proxyServer);
                    await this.indexController._syncVelocitySecret(newServer, proxyServer);
                } else {
                    console.warn(`[Create Server] Could not find proxy with ID ${linkToProxy} to link the new server to.`);
                }
            }

            // --- Companion Hub Server Creation ---
            if (serverType === 'Velocity' && createHubServer && hubVersion) {
                const hubName = 'Hub';
                const hubPort = 25566;

                const hubExists = allServers.some(s => s && s.name && s.name.toLowerCase() === hubName.toLowerCase());
                const portInUse = allServers.some(s => s && s.port === hubPort);

                if (!hubExists && !portInUse) {
                    const hubPaperBuilds = await this.indexController.httpsGetJson(`https://api.papermc.io/v2/projects/paper/versions/${hubVersion}/builds`);
                    const latestHubBuild = hubPaperBuilds.builds.pop();
                    const hubBuildNum = latestHubBuild.build;
                    
                    const hubServer = {
                        id: uuidv4(),
                        name: hubName,
                        port: hubPort,
                        ip: '127.0.0.1',
                        softwareType: 'PaperMC',
                        serverVersion: hubVersion,
                        paperBuild: hubBuildNum,
                        status: 'Offline',
                        connectedPlayers: [],
                        maxPlayers: 20,
                        minRam: '1024M',
                        maxRam: '2048M',
                        description: 'Default Hub server for the network.',
                    };

                    const hubFolderPath = this.indexController._getServerFolderPath(hubServer);
                    await fsPromises.mkdir(hubFolderPath, { recursive: true });

                    const hubJarName = `paper-${hubVersion}-${hubBuildNum}.jar`;
                    hubServer.jarFileName = hubJarName;
                    const hubDownloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${hubVersion}/builds/${hubBuildNum}/downloads/${hubJarName}`;
                    await this.indexController.downloadFile(hubDownloadUrl, hubFolderPath, hubJarName);

                    await fsPromises.writeFile(path.join(hubFolderPath, 'eula.txt'), 'eula=true', 'utf-8');
                    await this.indexController._updateServerPropertiesPort(hubServer, hubPort);
                    
                    allServers.push(hubServer);

                    // Link Hub to Proxy
                    await this._addServerToProxyConfig(hubServer, newServer);
                    
                    // Sync forwarding secret
                    await this.indexController._syncVelocitySecret(hubServer, newServer);
                } else {
                     console.warn(`Skipping Hub creation: A server named 'Hub' or a server on port ${hubPort} already exists.`);
                }
            }
    
            this.indexController._writeServers(allServers);
    
            res.status(201).json({
                message: `Server "${newServer.name}" created successfully. You can now manage it from the dashboard.`,
                server: newServer,
            });
    
        } catch (error) {
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

    async createFromZip(req, res, next) {
        const { serverName, port, jarFileName, minRam, maxRam, description } = req.body;
        const file = req.file;

        if (!serverName || !port || !jarFileName || !minRam || !maxRam || !file) {
            return res.status(400).json({ message: "Missing required fields for zip upload." });
        }
        
        try {
            let servers = this.indexController._readServers();
            if (servers.find(s => s && s.name && (s.name.toLowerCase() === serverName.toLowerCase() || s.port === parseInt(port, 10)))) {
                return res.status(409).json({ message: 'A server with that name or port already exists.' });
            }

            const newServerId = uuidv4();
            const newServer = {
                id: newServerId,
                name: serverName,
                port: parseInt(port, 10),
                ip: '127.0.0.1',
                softwareType: 'Imported',
                serverVersion: 'Unknown',
                jarFileName: jarFileName.trim(),
                minRam,
                maxRam,
                description: description || 'An imported server.',
                status: 'Offline',
                connectedPlayers: [],
            };

            const serverFolderPath = this.indexController._getServerFolderPath(newServer);
            await fsPromises.mkdir(serverFolderPath, { recursive: true });

            await extract(file.path, { dir: serverFolderPath });
            await fsPromises.unlink(file.path);

            const eulaPath = path.join(serverFolderPath, 'eula.txt');
            if (!fs.existsSync(eulaPath)) {
                await fsPromises.writeFile(eulaPath, 'eula=true', 'utf-8');
            }

            servers.push(newServer);
            this.indexController._writeServers(servers);
            res.status(201).json({ message: `Server "${serverName}" created successfully from zip.` });

        } catch (error) {
            next(error);
        }
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
        const { serverId } = req.params;
        try {
            const servers = this.indexController._readServers();
            const server = servers.find(s => s.id === serverId);
            if (!server) return res.status(404).json({ message: "Server not found." });
    
            const serverPath = this.indexController._getServerFolderPath(server);
            const bannedPlayersPath = path.join(serverPath, 'banned-players.json');
    
            if (!fs.existsSync(bannedPlayersPath)) {
                return res.status(200).json([]);
            }
    
            const content = await fsPromises.readFile(bannedPlayersPath, 'utf8');
            res.status(200).json(JSON.parse(content));
        } catch (error) {
            next(error);
        }
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
                serverProcess = spawn(this.indexController.config.java_executable_path || 'java', javaArgs, {
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


    

    

```
  </change>
  <change>
    <file>/src/backend/src/controllers/index.js</file>
    <content><![CDATA[

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
    constructor(config) {
        console.log("IndexController instantiated in backend/controllers");
        this.config = config || {}; // Store the config
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
        const interval = this.config.stats_poll_interval_ms || 2500;
        this.statsUpdateInterval = setInterval(() => this._updateAllServerStats(), interval);
        console.log(`Started server stats monitoring loop with interval: ${interval}ms.`);
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
        const availablePermissions = ["view_server_stats", "view_logs", "edit_configs", "control_servers", "create_servers", "create_users", "assign_roles", "manage_roles", "manage_recovery", "manage_backups", "send_console_commands", "delete_servers", "manage_plugins"];
        configData.availablePermissions = availablePermissions;
        if (!configData.roles) {
            configData.roles = {
                "Admin": {
                    permissions: [...availablePermissions]
                },
                "Operator": {
                    permissions: [
                        "view_server_stats", 
                        "view_logs", 
                        "edit_configs", 
                        "control_servers", 
                        "create_servers",
                        "manage_backups",
                        "send_console_commands",
                        "delete_servers",
                        "manage_plugins",
                        "manage_recovery"
                    ]
                },
                "Moderator": {
                    permissions: [
                        "view_server_stats",
                        "view_logs",
                        "control_servers",
                        "send_console_commands"
                    ]
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
            if (fs.existsSync(SERVERS_FILE_PATH)) {
                let servers;
                try {
                    servers = JSON.parse(fs.readFileSync(SERVERS_FILE_PATH, 'utf-8'));
                } catch (e) {
                    console.error(`[Data Repair] Failed to parse ${SERVERS_FILE_PATH}. Moving to .corrupted and starting fresh.`, e);
                    fs.renameSync(SERVERS_FILE_PATH, `${SERVERS_FILE_PATH}.${Date.now()}.corrupted`);
                    return [];
                }

                if (!Array.isArray(servers)) {
                    console.warn(`[Data Repair] ${SERVERS_FILE_PATH} is not an array. Resetting to empty.`);
                    this._writeServers([]);
                    return [];
                }

                let needsRewrite = false;
                const repairedServers = servers.map(server => {
                    if (server && typeof server === 'object' && !server.name) {
                        console.warn(`[Data Repair] Found a server with no name (ID: ${server.id || 'N/A'}). Assigning a placeholder name.`);
                        server.name = `Unnamed Server`;
                        needsRewrite = true;
                    }
                    return server;
                }).filter(server => server && typeof server === 'object'); // Filter out null/bad entries

                if (needsRewrite) {
                    console.log("[Data Repair] Rewriting servers.json to fix missing names.");
                    this._writeServers(repairedServers);
                }
                return repairedServers;
            }
            return [];
        } catch (error) {
            console.error("Critical error in _readServers. Returning empty list.", error);
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
            const mrpackPath = await this.downloadFile(tempExtractDir, tempExtractDir, serverFile.filename);
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
                        if (!tomlConfig.try.includes(serverEntryName)) {
                            // Add the new server to the beginning of the try list
                            tomlConfig.try.unshift(serverEntryName);
                        }
            
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
        const proxyPath = this.indexController._getServerFolderPath(velocityProxy);
        const paperServerPath = this.indexController._getServerFolderPath(paperServer);
    
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
# This file is automatically generated by Velocity Manager for proxy compatibility.
settings:
  proxy-protocol: false
proxies:
  bungee-cord:
    online-mode: true
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

