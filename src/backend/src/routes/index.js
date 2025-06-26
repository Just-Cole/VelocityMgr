
// src/backend/src/routes/index.js

const express = require('express');
const os = require('os');
const IndexController = require('../controllers/index');
const ConsoleController = require('../controllers/console.controller'); 
const RoleController = require('../controllers/role.controller');
const FileController = require('../controllers/file.controller');
const multer = require('multer');

const storage = multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => {
        cb(null, `velocity-manager-upload-${Date.now()}-${file.originalname}`);
    }
});


// Configure multer for file uploads
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 500 } // 500 MB limit
});

// Function to create and configure the router
const createApiRouter = () => {
    const router = express.Router();
    const indexController = new IndexController();
    const consoleController = new ConsoleController(indexController);
    const roleController = new RoleController(indexController);
    const fileController = new FileController(indexController);

    // --- Authentication, Roles, and Permissions ---
    router.post('/auth/login', indexController.loginUser.bind(indexController));
    
    // User Management
    router.get('/auth/users', indexController.listAppUsers.bind(indexController));
    router.post('/auth/users', indexController.addAppUser.bind(indexController));
    router.delete('/auth/users/:username', indexController.deleteAppUser.bind(indexController));
    router.put('/auth/users/:username/roles', indexController.updateUserRoles.bind(indexController));
    router.put('/auth/users/:username/password', indexController.updateUserPassword.bind(indexController));
    
    // Role & Permission Management (RBAC)
    router.get('/auth/permissions', roleController.listAvailablePermissions.bind(roleController));
    router.get('/auth/roles', roleController.listRoles.bind(roleController));
    router.post('/auth/roles', roleController.createRole.bind(roleController));
    router.put('/auth/roles/:roleName', roleController.updateRole.bind(roleController));
    router.delete('/auth/roles/:roleName', roleController.deleteRole.bind(roleController));


    // --- Server Management ---
    router.get('/', indexController.getIndex.bind(indexController));
    router.post('/minecraft/servers', indexController.createServer.bind(indexController));
    router.post('/minecraft/servers/create-from-modpack', indexController.createFromModpack.bind(indexController));
    router.get('/minecraft/servers', indexController.listServers.bind(indexController));
    router.patch('/minecraft/servers/:serverId/settings', indexController.updateServerSettings.bind(indexController));
    router.post('/minecraft/servers/:serverId/delete-recoverable', indexController.deleteServerWithRecovery.bind(indexController));
    router.get('/minecraft/servers/:serverId/banned-players', indexController.getBannedPlayers.bind(indexController));

    // Server Actions
    router.post('/minecraft/start', indexController.startMinecraft.bind(indexController));
    router.post('/minecraft/stop', indexController.stopMinecraft.bind(indexController));
    router.post('/minecraft/restart', indexController.restartServer.bind(indexController));
    router.get('/minecraft/status', indexController.minecraftStatus.bind(indexController));
    
    // Console
    router.get('/minecraft/servers/:serverId/console/stream', consoleController.getLiveConsole.bind(consoleController));
    router.get('/minecraft/servers/:serverId/console/full-log', consoleController.getFullLog.bind(consoleController));
    router.post('/minecraft/servers/:serverId/command', consoleController.sendCommandToServer.bind(consoleController));
    
    // Recovery
    router.get('/minecraft/servers/recovery', indexController.listRecoverableServers.bind(indexController));
    router.post('/minecraft/servers/recovery/restore', indexController.restoreServer.bind(indexController));
    router.post('/minecraft/servers/recovery/delete', indexController.permanentlyDeleteRecoveredServer.bind(indexController));

    // Server Properties
    router.get('/minecraft/servers/:serverId/server-properties', indexController.getServerProperties.bind(indexController));
    router.put('/minecraft/servers/:serverId/server-properties', indexController.updateServerProperties.bind(indexController));
    router.get('/minecraft/servers/:serverId/velocity-toml', indexController.getVelocityToml.bind(indexController));
    router.put('/minecraft/servers/:serverId/velocity-toml', indexController.updateVelocityToml.bind(indexController));


    // File Management
    router.get('/minecraft/servers/:serverId/files', fileController.listFiles.bind(fileController));
    router.get('/minecraft/servers/:serverId/files/content', fileController.getFileContent.bind(fileController));
    router.post('/minecraft/servers/:serverId/files/content', fileController.saveFileContent.bind(fileController));
    router.post('/minecraft/servers/:serverId/files/upload', upload.single('file'), fileController.uploadFileToServer.bind(fileController));
    router.post('/minecraft/servers/:serverId/files/create-folder', fileController.createFolder.bind(fileController));
    router.post('/minecraft/servers/:serverId/files/actions/rename', fileController.renameItem.bind(fileController));
    router.post('/minecraft/servers/:serverId/files/actions/delete', fileController.deleteItem.bind(fileController));

    // Papermc API proxy routes
    router.get('/papermc/versions/:project', indexController.getPaperMCVersions.bind(indexController));
    router.get('/papermc/builds/:project/:version', indexController.getPaperMCBuilds.bind(indexController));

    // Modrinth Routes
    router.get('/modrinth/search', indexController.searchModrinth.bind(indexController));
    router.get('/modrinth/project/:projectId/versions', indexController.getModrinthProjectVersions.bind(indexController));

    // Plugin Routes
    router.get('/plugins/search', indexController.searchSpigetPlugins.bind(indexController));
    router.get('/plugins/details', indexController.getSpigetPluginVersions.bind(indexController));
    router.get('/minecraft/servers/:serverId/plugins', indexController.listServerPlugins.bind(indexController));
    router.post('/minecraft/servers/:serverId/plugins/install', indexController.installPluginToServer.bind(indexController));
    router.post('/minecraft/servers/:serverId/plugins/toggle', indexController.togglePluginEnabledState.bind(indexController));
    router.post('/minecraft/servers/:serverId/plugins/uninstall', indexController.uninstallPlugin.bind(indexController));

    // Backup Routes
    router.get('/minecraft/servers/:serverId/backups', indexController.listBackups.bind(indexController));
    router.post('/minecraft/servers/:serverId/backups', indexController.createBackup.bind(indexController));
    router.post('/minecraft/servers/:serverId/backups/:fileName/restore', indexController.restoreBackup.bind(indexController));
    router.get('/minecraft/servers/:serverId/backups/:fileName/download', indexController.downloadBackup.bind(indexController));
    router.delete('/minecraft/servers/:serverId/backups/:fileName', indexController.deleteBackup.bind(indexController));

    // Legacy Proxy Routes
    router.post('/proxy/add', indexController.addProxy.bind(indexController));
    router.get('/proxies', indexController.listProxies.bind(indexController));
    router.delete('/proxy/:proxyId/remove', indexController.removeProxy.bind(indexController));
    router.post('/proxy/:proxyId/start', indexController.startProxy.bind(indexController));
    router.post('/proxy/:proxyId/stop', indexController.stopProxy.bind(indexController));
    router.get('/proxy/:proxyId/status', indexController.proxyStatus.bind(indexController));

    return router;
};

module.exports = createApiRouter();
