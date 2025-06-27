const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const extract = require('extract-zip');


class BackupController {
    constructor(indexControllerInstance) {
        this.indexController = indexControllerInstance;
        console.log("BackupController instantiated.");
    }

    async createBackup(req, res, next) {
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

            const serverFolderPath = this.indexController._getServerFolderPath(server);
            if (!fs.existsSync(serverFolderPath)) {
                return res.status(404).json({
                    message: 'Server directory to back up does not exist.'
                });
            }

            const backupFolderPath = this.indexController._getBackupFolderPath(server);
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
            const servers = this.indexController._readServers();
            const server = servers.find(s => s.id === serverId);
            if (!server) {
                return res.status(404).json({
                    message: 'Server not found.'
                });
            }

            const backupFolderPath = this.indexController._getBackupFolderPath(server);
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
            const servers = this.indexController._readServers();
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

            const serverFolderPath = this.indexController._getServerFolderPath(server);
            const backupFilePath = path.join(this.indexController._getBackupFolderPath(server), fileName);

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
            const servers = this.indexController._readServers();
            const server = servers.find(s => s.id === serverId);
            if (!server) {
                return res.status(404).json({
                    message: 'Server not found.'
                });
            }

            const backupFilePath = path.join(this.indexController._getBackupFolderPath(server), fileName);
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
            const servers = this.indexController._readServers();
            const server = servers.find(s => s.id === serverId);
            if (!server) {
                return res.status(404).json({
                    message: 'Server not found.'
                });
            }

            const backupFilePath = path.join(this.indexController._getBackupFolderPath(server), fileName);
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
}

module.exports = BackupController;
