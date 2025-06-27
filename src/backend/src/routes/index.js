
// src/backend/src/routes/index.js

const express = require('express');
const os = require('os');
const IndexController = require('../controllers/index');
const AuthController = require('../controllers/auth.controller');
const RoleController = require('../controllers/role.controller');
const ServerController = require('../controllers/server.controller');
const BackupController = require('../controllers/backup.controller');
const PluginController = require('../controllers/plugin.controller');
const ConsoleController = require('../controllers/console.controller'); 
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
    
    // Create a single instance of the main controller to share state
    const indexController = new IndexController();

    // Instantiate all other controllers, passing the main controller instance
    const authController = new AuthController(indexController);
    const roleController = new RoleController(indexController);
    const serverController = new ServerController(indexController);
    const backupController = new BackupController(indexController);
    const pluginController = new PluginController(indexController);
    const consoleController = new ConsoleController(indexController);
    const fileController = new FileController(indexController);

    // --- Authentication, Roles, and Permissions ---
    router.post('/auth/login', authController.loginUser.bind(authController));
    
    // User Management
    router.get('/auth/users', authController.listAppUsers.bind(authController));
    router.post('/auth/users', authController.addAppUser.bind(authController));
    router.delete('/auth/users/:username', authController.deleteAppUser.bind(authController));
    router.put('/auth/users/:username/roles', authController.updateUserRoles.bind(authController));
    router.put('/auth/users/:username/password', authController.updateUserPassword.bind(authController));
    
    // Role & Permission Management (RBAC)
    router.get('/auth/permissions', roleController.listAvailablePermissions.bind(roleController));
    router.get('/auth/roles', roleController.listRoles.bind(roleController));
    router.post('/auth/roles', roleController.createRole.bind(roleController));
    router.put('/auth/roles/:roleName', roleController.updateRole.bind(roleController));
    router.delete('/auth/roles/:roleName', roleController.deleteRole.bind(roleController));


    // --- Server Management ---
    router.get('/minecraft/servers', serverController.listServers.bind(serverController));
    router.post('/minecraft/servers', serverController.createServer.bind(serverController));
    router.post('/minecraft/servers/create-from-modpack', serverController.createFromModpack.bind(serverController));
    router.post('/minecraft/servers/upload-zip', upload.single('serverZip'), serverController.createFromZip.bind(serverController));
    router.patch('/minecraft/servers/:serverId/settings', serverController.updateServerSettings.bind(serverController));
    router.post('/minecraft/servers/:serverId/delete-recoverable', serverController.deleteServerWithRecovery.bind(serverController));
    router.get('/minecraft/servers/:serverId/banned-players', serverController.getBannedPlayers.bind(serverController));

    // Server Actions
    router.post('/minecraft/start', serverController.startMinecraft.bind(serverController));
    router.post('/minecraft/stop', serverController.stopMinecraft.bind(serverController));
    router.post('/minecraft/restart', serverController.restartServer.bind(serverController));
    router.get('/minecraft/status', serverController.minecraftStatus.bind(serverController));
    
    // Console
    router.get('/minecraft/servers/:serverId/console/stream', consoleController.getLiveConsole.bind(consoleController));
    router.get('/minecraft/servers/:serverId/console/full-log', consoleController.getFullLog.bind(consoleController));
    router.post('/minecraft/servers/:serverId/command', consoleController.sendCommandToServer.bind(consoleController));
    
    // Recovery
    router.get('/minecraft/servers/recovery', serverController.listRecoverableServers.bind(serverController));
    router.post('/minecraft/servers/recovery/restore', serverController.restoreServer.bind(serverController));
    router.post('/minecraft/servers/recovery/delete', serverController.permanentlyDeleteRecoveredServer.bind(serverController));

    // Server Properties
    router.get('/minecraft/servers/:serverId/server-properties', serverController.getServerProperties.bind(serverController));
    router.put('/minecraft/servers/:serverId/server-properties', serverController.updateServerProperties.bind(serverController));
    router.get('/minecraft/servers/:serverId/velocity-toml', serverController.getVelocityToml.bind(serverController));
    router.put('/minecraft/servers/:serverId/velocity-toml', serverController.updateVelocityToml.bind(serverController));


    // File Management
    router.get('/minecraft/servers/:serverId/files', fileController.listFiles.bind(fileController));
    router.get('/minecraft/servers/:serverId/files/content', fileController.getFileContent.bind(fileController));
    router.post('/minecraft/servers/:serverId/files/content', fileController.saveFileContent.bind(fileController));
    router.post('/minecraft/servers/:serverId/files/upload', upload.single('file'), fileController.uploadFileToServer.bind(fileController));
    router.post('/minecraft/servers/:serverId/files/create-folder', fileController.createFolder.bind(fileController));
    router.post('/minecraft/servers/:serverId/files/actions/rename', fileController.renameItem.bind(fileController));
    router.post('/minecraft/servers/:serverId/files/actions/delete', fileController.deleteItem.bind(fileController));

    // Papermc API proxy routes
    router.get('/papermc/versions/:project', pluginController.getPaperMCVersions.bind(pluginController));
    router.get('/papermc/builds/:project/:version', pluginController.getPaperMCBuilds.bind(pluginController));

    // Modrinth Routes
    router.get('/modrinth/search', pluginController.searchModrinth.bind(pluginController));
    router.get('/modrinth/project/:projectId/versions', pluginController.getModrinthProjectVersions.bind(pluginController));

    // Plugin Routes
    router.get('/plugins/search', pluginController.searchSpigetPlugins.bind(pluginController));
    router.get('/plugins/details', pluginController.getSpigetPluginVersions.bind(pluginController));
    router.get('/minecraft/servers/:serverId/plugins', pluginController.listServerPlugins.bind(pluginController));
    router.post('/minecraft/servers/:serverId/plugins/install', pluginController.installPluginToServer.bind(pluginController));
    router.post('/minecraft/servers/:serverId/plugins/toggle', pluginController.togglePluginEnabledState.bind(pluginController));
    router.post('/minecraft/servers/:serverId/plugins/uninstall', pluginController.uninstallPlugin.bind(pluginController));

    // Backup Routes
    router.get('/minecraft/servers/:serverId/backups', backupController.listBackups.bind(backupController));
    router.post('/minecraft/servers/:serverId/backups', backupController.createBackup.bind(backupController));
    router.post('/minecraft/servers/:serverId/backups/:fileName/restore', backupController.restoreBackup.bind(backupController));
    router.get('/minecraft/servers/:serverId/backups/:fileName/download', backupController.downloadBackup.bind(backupController));
    router.delete('/minecraft/servers/:serverId/backups/:fileName', backupController.deleteBackup.bind(backupController));

    return router;
};

module.exports = createApiRouter();
