
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

class FileController {
    constructor(indexControllerInstance) {
        this.indexController = indexControllerInstance;
        console.log("FileController instantiated and linked with IndexController.");
    }

    async listFiles(req, res, next) {
        try {
            const { serverId } = req.params;
            const relativePathQuery = req.query.path || '/';

            const servers = this.indexController._readServers();
            const server = servers.find(s => s.id === serverId);
            if (!server) {
                return res.status(404).json({ message: 'Server not found.' });
            }

            const serverFolderPath = this.indexController._getServerFolderPath(server);
            if (!serverFolderPath || !fs.existsSync(serverFolderPath)) {
                return res.status(404).json({ message: 'Server directory not found.' });
            }

            const absolutePath = path.join(serverFolderPath, relativePathQuery);

            if (!path.resolve(absolutePath).startsWith(path.resolve(serverFolderPath))) {
                return res.status(400).json({ message: 'Invalid path: access denied.' });
            }

            if (!fs.existsSync(absolutePath)) {
                return res.status(404).json({ message: `Directory not found at: ${relativePathQuery}` });
            }

            const entries = await fsPromises.readdir(absolutePath, { withFileTypes: true });

            const itemsPromises = entries.map(async (entry) => {
                const entryAbsolutePath = path.join(absolutePath, entry.name);
                const stats = await fsPromises.stat(entryAbsolutePath).catch(() => null);
                if (!stats) return null;

                const sizeInBytes = stats.size;
                let formattedSize;
                if (entry.isDirectory()) {
                    formattedSize = '-';
                } else if (sizeInBytes < 1024) {
                    formattedSize = `${sizeInBytes} B`;
                } else if (sizeInBytes < 1024 * 1024) {
                    formattedSize = `${(sizeInBytes / 1024).toFixed(1)} KB`;
                } else {
                    formattedSize = `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
                }

                const serverRelativePath = path.join(relativePathQuery, entry.name);

                return {
                    id: `${serverId}-${Buffer.from(serverRelativePath).toString('base64')}`,
                    name: entry.name,
                    type: entry.isDirectory() ? 'folder' : 'file',
                    path: serverRelativePath,
                    size: formattedSize,
                    lastModified: stats.mtime.toISOString(),
                    serverId: serverId,
                };
            });

            let items = (await Promise.all(itemsPromises)).filter(Boolean);

            items.sort((a, b) => {
                if (a.type === 'folder' && b.type === 'file') return -1;
                if (a.type === 'file' && b.type === 'folder') return 1;
                return a.name.localeCompare(b.name);
            });

            res.json(items);
        } catch (error) {
            next(error);
        }
    }

    async getFileContent(req, res, next) {
        try {
            const { serverId } = req.params;
            const filePathQuery = req.query.path;
            if (!filePathQuery) return res.status(400).send('File path is required.');

            const servers = this.indexController._readServers();
            const server = servers.find(s => s.id === serverId);
            if (!server) return res.status(404).send('Server not found.');

            const serverFolderPath = this.indexController._getServerFolderPath(server);
            if (!serverFolderPath) return res.status(404).send('Server directory path could not be determined.');

            const absolutePath = path.join(serverFolderPath, filePathQuery);
            if (!path.resolve(absolutePath).startsWith(path.resolve(serverFolderPath))) {
                return res.status(403).send('Invalid file path: access denied.');
            }

            const stats = await fsPromises.stat(absolutePath);
            if (!stats.isFile()) return res.status(400).send('Path is not a file.');

            const content = await fsPromises.readFile(absolutePath, 'utf8');
            res.status(200).send(content);
        } catch (error) {
            next(error);
        }
    }

    async saveFileContent(req, res, next) {
        const { serverId } = req.params;
        const { filePath, newContent } = req.body;

        if (!filePath || newContent === undefined) {
            return res.status(400).json({ message: 'File path and content are required.' });
        }

        const servers = this.indexController._readServers();
        const server = servers.find(s => s.id === serverId);
        if (!server) {
            return res.status(404).json({ message: 'Server not found.' });
        }
        
        const serverFolderPath = this.indexController._getServerFolderPath(server);
        const absolutePath = path.join(serverFolderPath, filePath);

        if (!path.resolve(absolutePath).startsWith(path.resolve(serverFolderPath))) {
            return res.status(400).json({ message: 'Invalid file path.' });
        }

        try {
            await fsPromises.writeFile(absolutePath, newContent, 'utf8');
            res.json({ message: 'File saved successfully.' });
        } catch (err) {
            next(err);
        }
    }

    async uploadFileToServer(req, res, next) {
        const { serverId } = req.params;
        const { destinationPath } = req.query;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }
        if (!destinationPath) {
             return res.status(400).json({ message: 'Destination path is required.' });
        }

        const servers = this.indexController._readServers();
        const server = servers.find(s => s.id === serverId);
        if (!server) {
            return res.status(404).json({ message: 'Server not found.' });
        }
        
        const serverFolderPath = this.indexController._getServerFolderPath(server);
        const absoluteDestinationPath = path.join(serverFolderPath, destinationPath);
        const absoluteFilePath = path.join(absoluteDestinationPath, file.originalname);

        if (!path.resolve(absoluteDestinationPath).startsWith(path.resolve(serverFolderPath))) {
            return res.status(400).json({ message: 'Invalid destination path.' });
        }

        try {
            await fsPromises.mkdir(absoluteDestinationPath, { recursive: true });
            // Multer disk storage writes to temp dir, we need to move it
            await fsPromises.rename(file.path, absoluteFilePath);
            res.json({ message: `File uploaded successfully to ${destinationPath}.` });
        } catch (err) {
            next(err);
        }
    }

    async createFolder(req, res, next) {
        const { serverId } = req.params;
        const { currentPath, newFolderName } = req.body;

        if (!currentPath || !newFolderName) {
            return res.status(400).json({ message: 'Current path and new folder name are required.' });
        }
        
        const servers = this.indexController._readServers();
        const server = servers.find(s => s.id === serverId);
        if (!server) {
            return res.status(404).json({ message: 'Server not found.' });
        }

        const serverFolderPath = this.indexController._getServerFolderPath(server);
        const absolutePath = path.join(serverFolderPath, currentPath, newFolderName);

        if (!path.resolve(absolutePath).startsWith(path.resolve(serverFolderPath))) {
            return res.status(400).json({ message: 'Invalid path.' });
        }

        try {
            await fsPromises.mkdir(absolutePath, { recursive: true });
            res.json({ message: 'Folder created successfully.' });
        } catch (err) {
            next(err);
        }
    }

    async renameItem(req, res, next) {
        const { serverId } = req.params;
        const { itemPathToRename, newItemName } = req.body;

        if (!itemPathToRename || !newItemName) {
             return res.status(400).json({ message: 'Item path and new name are required.' });
        }

        const servers = this.indexController._readServers();
        const server = servers.find(s => s.id === serverId);
        if (!server) {
            return res.status(404).json({ message: 'Server not found.' });
        }

        const serverFolderPath = this.indexController._getServerFolderPath(server);
        const absoluteCurrentPath = path.join(serverFolderPath, itemPathToRename);
        const absoluteNewPath = path.join(path.dirname(absoluteCurrentPath), newItemName);

        if (!path.resolve(absoluteCurrentPath).startsWith(path.resolve(serverFolderPath)) || !path.resolve(absoluteNewPath).startsWith(path.resolve(serverFolderPath))) {
            return res.status(400).json({ message: 'Invalid path.' });
        }

        try {
            await fsPromises.rename(absoluteCurrentPath, absoluteNewPath);
            res.json({ message: 'Item renamed successfully.' });
        } catch (err) {
            next(err);
        }
    }

    async deleteItem(req, res, next) {
        const { serverId } = req.params;
        const { filePathToDelete } = req.body;

        if (!filePathToDelete) {
             return res.status(400).json({ message: 'File path to delete is required.' });
        }
        
        const servers = this.indexController._readServers();
        const server = servers.find(s => s.id === serverId);
        if (!server) {
            return res.status(404).json({ message: 'Server not found.' });
        }

        const serverFolderPath = this.indexController._getServerFolderPath(server);
        const absolutePath = path.join(serverFolderPath, filePathToDelete);

        if (!path.resolve(absolutePath).startsWith(path.resolve(serverFolderPath))) {
            return res.status(400).json({ message: 'Invalid path.' });
        }

        try {
            const stats = await fsPromises.stat(absolutePath);
            if (stats.isDirectory()) {
                await fsPromises.rm(absolutePath, { recursive: true, force: true });
            } else {
                await fsPromises.unlink(absolutePath);
            }
            res.json({ message: 'Item deleted successfully.' });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = FileController;
