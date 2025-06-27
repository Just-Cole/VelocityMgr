
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const fetch = require('node-fetch'); // You might need to install this: npm install node-fetch@2

class PluginController {
    constructor(indexControllerInstance) {
        this.indexController = indexControllerInstance;
        console.log("PluginController instantiated.");
    }

    async searchSpigetPlugins(req, res, next) {
        const query = req.query.q || '';
        const page = parseInt(req.query.page, 10) || 1;
        const size = 21; // 3 rows of 7
        const offset = (page - 1) * size;
        const url = `https://api.spiget.org/v2/search/resources/${encodeURIComponent(query)}?sort=-downloads&size=${size}&page=${page}&fields=id,name,tag,downloads,testedVersions,author,icon`;
    
        console.log(`[Spiget] Searching for plugins with query: "${query}", page: ${page}`);
        
        try {
            const data = await this.indexController.httpsGetJson(url);
            
            const countUrl = `https://api.spiget.org/v2/search/resources/${encodeURIComponent(query)}?size=1&fields=id`;
            const countResponse = await fetch(countUrl);
            const totalPlugins = parseInt(countResponse.headers.get('x-resource-count') || '0', 10);
    
            const responsePayload = {
                pagination: {
                    limit: size,
                    offset: offset,
                    count: totalPlugins
                },
                result: data
            };
    
            res.status(200).json(responsePayload);
        } catch (error) {
            console.error(`Error fetching from Spiget: ${error.message}`);
            res.status(200).json({ pagination: { count: 0 }, result: [] });
        }
    }
    
    async getSpigetPluginVersions(req, res, next) {
        const resourceId = req.query.resourceId;
        if (!resourceId) return res.status(400).json({ message: "Resource ID is required." });
    
        const url = `https://api.spiget.org/v2/resources/${resourceId}/versions?sort=-releaseDate&size=10&fields=id,name`;
        console.log(`[Spiget] Getting versions for resource ID: ${resourceId}`);
        
        try {
            const data = await this.indexController.httpsGetJson(url);
            res.status(200).json(data);
        } catch (error) {
             next(error);
        }
    }
    
    async listServerPlugins(req, res, next) {
        const { serverId } = req.params;
        try {
            const servers = this.indexController._readServers();
            const server = servers.find(s => s.id === serverId);
            if (!server) return res.status(404).json({ message: 'Server not found.' });
    
            const pluginsPath = path.join(this.indexController._getServerFolderPath(server), 'plugins');
            if (!fs.existsSync(pluginsPath)) return res.status(200).json([]);
    
            const files = await fsPromises.readdir(pluginsPath);
            const pluginFiles = files.filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled'));
    
            const pluginDetails = pluginFiles.map(fileName => {
                const isEnabled = !fileName.endsWith('.jar.disabled');
                const nameMatch = fileName.match(/^(.*?)(?:-([\d.]+))?\.jar/);
                const name = nameMatch ? nameMatch[1] : fileName.replace(/\.jar(\.disabled)?$/, '');
                const version = nameMatch && nameMatch[2] ? nameMatch[2] : 'Unknown';
                
                return {
                    id: `${serverId}-${fileName}`,
                    name,
                    version,
                    isEnabled,
                    fileName,
                    serverId,
                };
            });
    
            res.status(200).json(pluginDetails);
        } catch (error) {
            next(error);
        }
    }
    
    async togglePluginEnabledState(req, res, next) {
        const { serverId } = req.params;
        const { pluginFileName, targetIsEnabled } = req.body;
        try {
            const servers = this.indexController._readServers();
            const server = servers.find(s => s.id === serverId);
            if (!server) return res.status(404).json({ message: 'Server not found.' });
    
            const pluginsPath = path.join(this.indexController._getServerFolderPath(server), 'plugins');
            const currentPath = path.join(pluginsPath, pluginFileName);
            
            if (!fs.existsSync(currentPath)) {
                return res.status(404).json({ message: 'Plugin file not found.' });
            }
    
            const newFileName = targetIsEnabled 
                ? pluginFileName.replace(/\.jar\.disabled$/, '.jar')
                : pluginFileName.replace(/\.jar$/, '.jar.disabled');
                
            const newPath = path.join(pluginsPath, newFileName);
    
            await fsPromises.rename(currentPath, newPath);
            res.status(200).json({ message: `Plugin ${pluginFileName} has been ${targetIsEnabled ? 'enabled' : 'disabled'}. A server restart is required.` });
        } catch (error) {
            next(error);
        }
    }
    
    async installPluginToServer(req, res, next) {
        const { serverId } = req.params;
        const { spigetResourceId, spigetVersionId, pluginNameForToast } = req.body;
        
        try {
            const servers = this.indexController._readServers();
            const server = servers.find(s => s.id === serverId);
            if (!server) return res.status(404).json({ message: 'Server not found.' });
    
            const pluginsPath = path.join(this.indexController._getServerFolderPath(server), 'plugins');
            await fsPromises.mkdir(pluginsPath, { recursive: true });
    
            const downloadUrl = `https://api.spiget.org/v2/resources/${spigetResourceId}/download`;
            const safePluginName = this.indexController.sanitize(pluginNameForToast || `plugin_${spigetResourceId}`);
            const finalFilename = `${safePluginName}.jar`;
    
            await this.indexController.downloadFile(downloadUrl, pluginsPath, finalFilename);
    
            res.status(200).json({ message: `Plugin "${pluginNameForToast}" downloaded successfully. A server restart is required.` });
    
        } catch (error) {
            next(error);
        }
    }
    
    async uninstallPlugin(req, res, next) {
        const { serverId } = req.params;
        const { pluginFileName } = req.body;
        try {
            const servers = this.indexController._readServers();
            const server = servers.find(s => s.id === serverId);
            if (!server) return res.status(404).json({ message: 'Server not found.' });
    
            const pluginPath = path.join(this.indexController._getServerFolderPath(server), 'plugins', pluginFileName);
             if (!fs.existsSync(pluginPath)) {
                return res.status(404).json({ message: 'Plugin file not found.' });
            }
            await fsPromises.unlink(pluginPath);
            res.status(200).json({ message: `Plugin ${pluginFileName} has been uninstalled. A server restart is required.` });
        } catch (error) {
            next(error);
        }
    }
    
    async searchModrinth(req, res, next) {
        const query = req.query.q || '';
        const facets = JSON.stringify([
            ["project_type:modpack"]
        ]);
        const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}&limit=21`;

        console.log(`[Modrinth] Searching for modpacks with query: "${query}"`);

        try {
            const data = await this.indexController.httpsGetJson(url);
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
            const data = await this.indexController.httpsGetJson(url);
            res.status(200).json(data);
        } catch (error) {
            next(error);
        }
    }

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
            const data = await this.indexController.httpsGetJson(url);
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
            const data = await this.indexController.httpsGetJson(url);
            res.status(200).json(data);
        } catch (error) {
            console.error(`Error fetching PaperMC builds for ${project} v${version}:`, error);
            error.message = `Failed to fetch builds from PaperMC API for ${project} v${version}. ${error.message}`;
            next(error);
        }
    }
}

module.exports = PluginController;
