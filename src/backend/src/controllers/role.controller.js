
class RoleController {
    constructor(indexControllerInstance) {
        this.indexController = indexControllerInstance;
        console.log("RoleController instantiated and linked with IndexController.");
    }

    listAvailablePermissions(req, res, next) {
        try {
            const config = this.indexController._readConfig();
            res.status(200).json(config.availablePermissions || []);
        } catch (error) {
            next(error);
        }
    }
    
    listRoles(req, res, next) {
        try {
            const config = this.indexController._readConfig();
            res.status(200).json(config.roles || {});
        } catch (error) {
            next(error);
        }
    }
    
    createRole(req, res, next) {
        const { name, permissions } = req.body;
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ message: "Role name is required." });
        }
        if (!Array.isArray(permissions)) {
            return res.status(400).json({ message: "Permissions must be an array." });
        }
    
        try {
            const config = this.indexController._readConfig();
            if (config.roles[name]) {
                return res.status(409).json({ message: `Role '${name}' already exists.` });
            }
    
            const validPermissions = permissions.filter(p => config.availablePermissions.includes(p));
            config.roles[name] = { permissions: validPermissions };
            this.indexController._writeConfig(config);
    
            res.status(201).json({ message: `Role '${name}' created successfully.` });
        } catch (error) {
            next(error);
        }
    }
    
    updateRole(req, res, next) {
        const { roleName } = req.params;
        const { permissions } = req.body;
    
        if (!Array.isArray(permissions)) {
            return res.status(400).json({ message: "Permissions must be an array." });
        }
    
        try {
            const config = this.indexController._readConfig();
            if (!config.roles[roleName]) {
                return res.status(404).json({ message: `Role '${roleName}' not found.` });
            }
            if (roleName === "Admin") {
                return res.status(403).json({ message: "The 'Admin' role permissions cannot be modified." });
            }
    
            const validPermissions = permissions.filter(p => config.availablePermissions.includes(p));
            config.roles[roleName].permissions = validPermissions;
            this.indexController._writeConfig(config);
    
            res.status(200).json({ message: `Role '${roleName}' updated successfully.` });
        } catch (error) {
            next(error);
        }
    }
    
    deleteRole(req, res, next) {
        const { roleName } = req.params;
    
        try {
            const config = this.indexController._readConfig();
            if (!config.roles[roleName]) {
                return res.status(404).json({ message: `Role '${roleName}' not found.` });
            }
            if (roleName === "Admin" || roleName === "Editor" || roleName === "Viewer") {
                return res.status(403).json({ message: `Default role '${roleName}' cannot be deleted.` });
            }
    
            // Remove the role from any user that has it
            config.users.forEach(user => {
                if (user.roles) {
                    user.roles = user.roles.filter(r => r !== roleName);
                }
            });
    
            delete config.roles[roleName];
            this.indexController._writeConfig(config);
    
            res.status(200).json({ message: `Role '${roleName}' deleted successfully.` });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = RoleController;
