

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
player-info-forwarding-mode = "MODERN"
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

            const serverEntryName = serverToAdd.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const serverAddress = `${serverToAdd.ip}:${serverToAdd.port}`;

            // Use regex to be more robust against formatting variations
            const serversSectionRegex = /(\[servers\]\s*[\s\S]*?)(?=\n\[|$)/;
            const tryLineRegex = /try\s*=\s*(\[.*\])/;

            let newTomlContent = tomlContent;

            if (serversSectionRegex.test(newTomlContent)) {
                 newTomlContent = newTomlContent.replace(serversSectionRegex, (match, serversSection) => {
                    let newSection = serversSection;
                    // Add the server if it doesn't exist
                    if (!newSection.includes(`${serverEntryName} =`)) {
                        newSection = newSection.trimEnd() + `\n${serverEntryName} = "${serverAddress}"\n`;
                    }
                    // Handle the 'try' array
                    if (tryLineRegex.test(newSection)) {
                        newSection = newSection.replace(tryLineRegex, (tryMatch, tryArrayString) => {
                            try {
                                const tryArray = JSON.parse(tryArrayString.replace(/'/g, '"'));
                                if (!tryArray.includes(serverEntryName)) {
                                    tryArray.push(serverEntryName);
                                    return `try = ${JSON.stringify(tryArray).replace(/"/g, "'")}`;
                                }
                                return tryMatch;
                            } catch (e) { return tryMatch; } // Fallback on parse error
                        });
                    } else {
                        newSection += `try = ['${serverEntryName}']\n`;
                    }
                    return newSection;
                });
            } else {
                newTomlContent += `\n[servers]\ntry = ["${serverEntryName}"]\n${serverEntryName} = "${serverAddress}"\n`;
            }

            const forcedHostsSectionRegex = /(\[forced-hosts\]\s*[\s\S]*?)(?=\n\[|$)/;
            const forcedHostEntry = `"${serverEntryName}.example.com" = ["${serverEntryName}"]`;

            if(forcedHostsSectionRegex.test(newTomlContent)) {
                 newTomlContent = newTomlContent.replace(forcedHostsSectionRegex, (match) => {
                    if (!match.includes(forcedHostEntry)) {
                        return match.trimEnd() + `\n${forcedHostEntry}\n`;
                    }
                    return match;
                });
            } else {
                newTomlContent += `\n[forced-hosts]\n${forcedHostEntry}\n`;
            }

            await fsPromises.writeFile(tomlPath, newTomlContent, 'utf8');
            console.log(`[Link Server] Successfully added new server '${serverToAdd.name}' to proxy '${proxyServer.name}' config.`);
        } catch (tomlError) {
            console.error(`[Link Server] Failed to update proxy config for new server:`, tomlError);
        }
    }
    
    async _internalCreateServer(serverDetails) {
        const {
            name,
            port,
            serverType,
        } = serverDetails;
    
        let { serverVersion } = serverDetails;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            throw new Error("Internal error: A server name must be provided to create a server.");
        }
    
        try {
            let servers = this.indexController._readServers();
            if (servers.find(s => s && s.name && s.name.toLowerCase() === name.toLowerCase())) {
                throw new Error(`A server with the name "${name}" already exists.`);
            }
            if (servers.find(s => s && s.port === parseInt(port, 10))) {
                throw new Error(`A server is already using port ${port}.`);
            }
    
            const isPaper = serverType === 'PaperMC';
            const apiProjectName = isPaper ? 'paper' : 'velocity';
    
            if (!serverVersion) {
                const versionData = await this.indexController.httpsGetJson(`https://api.papermc.io/v2/projects/${apiProjectName}`);
                serverVersion = versionData.versions.pop();
            }
    
            const buildsResponse = await this.indexController.httpsGetJson(`https://api.papermc.io/v2/projects/${apiProjectName}/versions/${serverVersion}/builds`);
            const latestBuildDetails = buildsResponse.builds.pop();
            if (!latestBuildDetails) {
                throw new Error(`Could not find any builds for ${serverType} version ${serverVersion}.`);
            }
            const buildNumber = latestBuildDetails.build;
            const fullVersion = buildsResponse.version;
    
            const newServer = {
                id: uuidv4(),
                name: name,
                port: parseInt(port, 10),
                ip: '127.0.0.1',
                softwareType: serverType,
                serverVersion: serverVersion,
                paperBuild: isPaper ? buildNumber : undefined,
                velocityBuild: !isPaper ? buildNumber : undefined,
                status: 'Offline',
                connectedPlayers: [],
                maxPlayers: 20,
                minRam: this.indexController.config.default_min_ram || '1024M',
                maxRam: this.indexController.config.default_max_ram || '2048M',
                description: `A new ${serverType} server.`,
                tags: [],
            };
    
            const serverFolderPath = this.indexController._getServerFolderPath(newServer);
            await fsPromises.mkdir(serverFolderPath, { recursive: true });
    
            const downloadFileName = `${apiProjectName}-${fullVersion}-${buildNumber}.jar`;
            const serverJarPath = path.join(serverFolderPath, downloadFileName);
            if (!fs.existsSync(serverJarPath)) {
                const downloadUrl = `https://api.papermc.io/v2/projects/${apiProjectName}/versions/${fullVersion}/builds/${buildNumber}/downloads/${downloadFileName}`;
                await this.indexController.downloadFile(downloadUrl, serverFolderPath, downloadFileName);
            }
            newServer.jarFileName = downloadFileName;
    
            await fsPromises.writeFile(path.join(serverFolderPath, 'eula.txt'), 'eula=true', 'utf-8');
    
            if (isPaper) {
                await this.indexController._updateServerPropertiesPort(newServer, newServer.port);
            } else {
                const tomlPath = path.join(serverFolderPath, 'velocity.toml');
                if (!fs.existsSync(tomlPath)) {
                    const finalTomlContent = velocityTomlTemplate
                        .replace(/bind\s*=\s*"0\.0\.0\.0:25565"/, `bind = "0.0.0.0:${newServer.port}"`);
                    await fsPromises.writeFile(tomlPath, finalTomlContent.trim(), 'utf-8');
    
                    const secretFilePath = path.join(serverFolderPath, 'forwarding.secret');
                    if (!fs.existsSync(secretFilePath)) {
                        const secret = crypto.randomBytes(12).toString('hex');
                        await fsPromises.writeFile(secretFilePath, secret, 'utf-8');
                    }
                }
            }
    
            let pluginJarName, pluginSrcPath;
            if (isPaper) {
                pluginJarName = 'spigot-vmanager-plugin-1.0.0.jar';
                pluginSrcPath = path.join(__dirname, '..', '..', '..', 'spigot-plugin', 'target', pluginJarName);
            } else {
                pluginJarName = 'velocity-manager-plugin-1.0.0.jar';
                pluginSrcPath = path.join(__dirname, '..', '..', '..', 'velocity-plugin', 'target', pluginJarName);
            }
    
            if (pluginJarName && pluginSrcPath && fs.existsSync(pluginSrcPath)) {
                const pluginsDestDir = path.join(serverFolderPath, 'plugins');
                await fsPromises.mkdir(pluginsDestDir, { recursive: true });
                await fsPromises.copyFile(pluginSrcPath, path.join(pluginsDestDir, pluginJarName));
            }
    
            let allServers = this.indexController._readServers();
            allServers.push(newServer);
            this.indexController._writeServers(allServers);
    
            return newServer;
    
        } catch (error) {
            console.error(`[Internal Create] Failed to create server ${name}:`, error);
            throw error;
        }
    }
    
    async createServer(req, res, next) {
        try {
            const { serverName, port, serverType, serverVersion, createHubServer, hubVersion } = req.body;
    
            if (serverType === 'Velocity') {
                 const proxyDetails = {
                    name: serverName,
                    port: parseInt(port, 10),
                    serverType: 'Velocity',
                    serverVersion: serverVersion,
                };
                const proxyServer = await this._internalCreateServer(proxyDetails);
                let hubCreationMessage = '';

                if (createHubServer && hubVersion) {
                    const allServers = this.indexController._readServers();
                    const hubExists = allServers.some(s => s && s.name && (s.name.toLowerCase() === 'hub' || s.port === 25566));
        
                    if (!hubExists) {
                        const hubDetails = {
                            name: 'Hub',
                            port: 25566,
                            serverType: 'PaperMC',
                            serverVersion: hubVersion,
                        };
                        try {
                            const hubServer = await this._internalCreateServer(hubDetails);
                            await this._addServerToProxyConfig(hubServer, proxyServer);
                            await this.indexController._syncVelocitySecret(hubServer, proxyServer);
                            hubCreationMessage = 'Companion Hub server was also created and linked.';
                        } catch (hubError) {
                            hubCreationMessage = `Warning: Failed to create companion Hub server. Error: ${hubError.message}`;
                        }
                    } else {
                        hubCreationMessage = 'A server named "Hub" or using port 25566 already exists. Skipping Hub creation.';
                    }
                }
                
                res.status(201).json({
                    message: `Velocity proxy "${proxyServer.name}" created. ${hubCreationMessage}`,
                    server: proxyServer,
                });
    
            } else { // PaperMC
                 const paperDetails = {
                    name: serverName,
                    port: parseInt(port, 10),
                    serverType: 'PaperMC',
                    serverVersion,
                };
                const paperServer = await this._internalCreateServer(paperDetails);
    
                const allServers = this.indexController._readServers();
                const proxyServer = allServers.find(s => s && s.softwareType === 'Velocity');
                if (proxyServer) {
                    await this._addServerToProxyConfig(paperServer, proxyServer);
                    await this.indexController._syncVelocitySecret(paperServer, proxyServer);
                    res.status(201).json({
                        message: `Server "${paperServer.name}" created and linked to proxy. Restart the proxy to apply.`,
                        server: paperServer,
                    });
                } else {
                    res.status(201).json({
                        message: `Server "${paperServer.name}" created successfully.`,
                        server: paperServer,
                    });
                }
            }
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
                tags: ['imported'],
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
