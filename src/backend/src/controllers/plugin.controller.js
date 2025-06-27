const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const {
    spawn
} = require('child_process');

class PluginController {
    constructor(indexControllerInstance) {
        this.indexController = indexControllerInstance;
        console.log("PluginController instantiated.");
    }

    async searchSpigetPlugins(req, res, next) {
        res.status(501).json({ message: "Not Implemented" });
    }
    
    async getSpigetPluginVersions(req, res, next) {
        res.status(501).json({ message: "Not Implemented" });
    }
    
    async listServerPlugins(req, res, next) {
        res.status(501).json({ message: "Not Implemented" });
    }
    
    async togglePluginEnabledState(req, res, next) {
        res.status(501).json({ message: "Not Implemented" });
    }
    
    async installPluginToServer(req, res, next) {
        res.status(501).json({ message: "Not Implemented" });
    }
    
    async uninstallPlugin(req, res, next) {
        res.status(501).json({ message: "Not Implemented" });
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
