
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

class ConsoleController {
    constructor(indexControllerInstance) {
        this.indexController = indexControllerInstance;
        console.log("ConsoleController instantiated and linked with IndexController.");
    }

    async getLiveConsole(req, res, next) {
        const { serverId } = req.params;
        const charOffset = parseInt(req.query.offset || '0', 10);

        const servers = this.indexController._readServers();
        const server = servers.find(s => s.id === serverId);

        if (!server) {
            return res.status(404).json({ message: "Server not found." });
        }

        const currentStatus = server.status; 

        if (currentStatus === 'Offline' || currentStatus === 'Stopping') { 
             return res.status(200).json({ logs: `\n--- Server is ${currentStatus}. Console inactive. ---\n`, newOffset: charOffset, status: currentStatus });
        }

        if (!server.consoleLogFile) {
            return res.status(404).json({ message: "Console log file path not configured for this server." });
        }

        try {
            if (!fs.existsSync(server.consoleLogFile)) {
                 return res.status(200).json({ logs: `--- Console log file not yet created or server not fully started. ---\n`, newOffset: 0, status: currentStatus });
            }

            const stats = await fsPromises.stat(server.consoleLogFile);
            const totalSize = stats.size;

            if (charOffset >= totalSize && currentStatus !== 'Starting' && currentStatus !== 'Online' && currentStatus !== 'Restarting') { 
                 return res.status(200).json({ logs: `\n--- Server is ${currentStatus}. Console may be stale. ---\n`, newOffset: totalSize, status: currentStatus });
            } else if (charOffset >= totalSize) {
                return res.status(200).json({ logs: '', newOffset: totalSize, status: currentStatus });
            }

            const bufferSize = totalSize - charOffset;
            const buffer = Buffer.alloc(bufferSize);
            const fileDescriptor = await fsPromises.open(server.consoleLogFile, 'r');

            await fileDescriptor.read(buffer, 0, bufferSize, charOffset);
            await fileDescriptor.close();

            const newContent = buffer.toString('utf-8');

            res.status(200).json({ logs: newContent, newOffset: totalSize, status: currentStatus });

        } catch (error) {
            console.error(`Error in ConsoleController.getLiveConsole for server ${serverId}:`, error);
            next(error);
        }
    }

    async getFullLog(req, res, next) {
        const { serverId } = req.params;
        try {
            const servers = this.indexController._readServers();
            const server = servers.find(s => s.id === serverId);

            if (!server) {
                return res.status(404).json({ message: "Server not found." });
            }

            if (!server.consoleLogFile || !fs.existsSync(server.consoleLogFile)) {
                return res.status(404).json({ message: "Console log file not found for this server. It may not have been run yet." });
            }

            const logContent = await fsPromises.readFile(server.consoleLogFile, 'utf-8');
            res.status(200).type('text/plain').send(logContent);

        } catch (error) {
            console.error(`Error in getFullLog for server ${serverId}:`, error);
            next(error);
        }
    }

    async sendCommandToServer(req, res, next) {
        const { serverId } = req.params;
        const { command } = req.body;

        if (!command || typeof command !== 'string' || !command.trim()) {
            return res.status(400).json({ message: "Command is required and must be a non-empty string." });
        }

        const servers = this.indexController._readServers();
        const server = servers.find(s => s.id === serverId);

        if (!server) {
            return res.status(404).json({ message: "Server not found." });
        }

        const allowedStatusesForCommand = ['Online', 'Starting', 'Restarting']; 
        if (!allowedStatusesForCommand.includes(server.status)) {
             return res.status(400).json({ message: `Cannot send command. Server is currently ${server.status}.` });
        }

        const serverProcess = this.indexController.activeServerProcesses[serverId];
        const trimmedCommand = command.trim();

        if (serverProcess && serverProcess.recovered === true && !serverProcess.stdin) {
            return res.status(400).json({ 
                message: "Cannot send command: This server was found running when the panel (re)started and its command input cannot be re-attached. To regain full command control, please 'Restart' the server using the panel's action buttons." 
            });
        }

        if (serverProcess && serverProcess.stdin && !serverProcess.stdin.destroyed) {
            try {
                serverProcess.stdin.write(trimmedCommand + '\n');
                console.log(`ConsoleController: Sent command "${trimmedCommand}" to server ${server.name} (ID: ${serverId}, PID: ${serverProcess.pid || 'N/A'})`);
                return res.status(200).json({ message: `Command "${trimmedCommand}" sent.` });
            } catch (error) {
                console.error(`Error writing command to server ${serverId} stdin (PID: ${serverProcess.pid || 'N/A'}, Status: ${server.status}, Command: "${trimmedCommand}"): ${error.message}`);
                next(error);
            }
        } else {
            let reason = "Server process not found in panel's active memory or its command input (stdin) is not available.";
            if (!serverProcess) {
                reason = `No active server process found in memory for server ${serverId} (Status: ${server.status}, PID from record: ${server.pid || 'N/A'}).`;
            } else if (!serverProcess.stdin) {
                 reason = `Active server process found for server ${serverId} (PID: ${serverProcess.pid || 'N/A'}), but its stdin is not available. This can happen if the panel restarted while the server was running.`;
            } else if (serverProcess.stdin.destroyed) {
                reason = `Active server process found for server ${serverId} (PID: ${serverProcess.pid || 'N/A'}), but its stdin is destroyed.`;
            }
             console.log(`ConsoleController: ${reason} Command: "${trimmedCommand}"`);
            return res.status(404).json({ message: reason });
        }
    }
}

module.exports = ConsoleController;

