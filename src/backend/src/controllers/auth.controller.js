const crypto = require('crypto');

// Password Hashing Constants
const SALT_LENGTH = 16;
const HASH_ITERATIONS = 100000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';

// Password Hashing Helper Functions
function hashPassword(password, saltProvided) {
    const salt = saltProvided || crypto.randomBytes(SALT_LENGTH).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString('hex');
    return `${salt}$${hash}`;
}

function verifyPassword(providedPassword, storedPasswordWithSalt) {
    if (!storedPasswordWithSalt || typeof storedPasswordWithSalt !== 'string') {
        return false; // Invalid stored password
    }
    if (!storedPasswordWithSalt.includes('$')) {
        console.warn("verifyPassword encountered a password that seems unhashed (missing '$'). Denying login for safety.");
        return false;
    }
    const [salt, storedHashHex] = storedPasswordWithSalt.split('$');
    if (!salt || !storedHashHex) return false; // Invalid format

    const hashToVerifyBuffer = crypto.pbkdf2Sync(providedPassword, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST);
    const storedHashBuffer = Buffer.from(storedHashHex, 'hex');

    if (hashToVerifyBuffer.length !== storedHashBuffer.length) {
        return false;
    }

    try {
        return crypto.timingSafeEqual(hashToVerifyBuffer, storedHashBuffer);
    } catch (e) {
        console.error("Error during timingSafeEqual (likely buffer length mismatch):", e.message);
        return false;
    }
}


class AuthController {
    constructor(indexControllerInstance) {
        this.indexController = indexControllerInstance;
        console.log("AuthController instantiated.");
    }

    loginUser(req, res, next) {
        const {
            username,
            password
        } = req.body;
        if (!username || !password) {
            return res.status(400).json({
                message: "Username and password are required."
            });
        }
        try {
            const config = this.indexController._readConfig();
            const user = config.users.find(u => u.username === username);

            if (user && verifyPassword(password, user.password)) {
                const permissionsSet = new Set();
                if (user.roles && config.roles) {
                    user.roles.forEach(roleName => {
                        const roleDetails = config.roles[roleName];
                        if (roleDetails && roleDetails.permissions) {
                            roleDetails.permissions.forEach(permission => {
                                permissionsSet.add(permission);
                            });
                        }
                    });
                }
                res.status(200).json({
                    message: "Login successful.",
                    user: {
                        username: user.username,
                        roles: user.roles,
                        permissions: Array.from(permissionsSet)
                    }
                });
            } else {
                res.status(401).json({
                    message: "Invalid username or password."
                });
            }
        } catch (e) {
            next(e);
        }
    }

    listAppUsers(req, res, next) {
        try {
            const config = this.indexController._readConfig();
            const users = config.users.map(u => ({
                username: u.username,
                roles: u.roles || []
            }));
            res.status(200).json(users);
        } catch (e) {
            next(e);
        }
    }

    addAppUser(req, res, next) {
        const {
            username,
            password,
            roles
        } = req.body;
        if (!username || !password || password.length < 6 || !roles || !Array.isArray(roles) || roles.length === 0) {
            return res.status(400).json({
                message: "Valid username, password (min 6 chars), and roles array are required."
            });
        }
        try {
            const config = this.indexController._readConfig();
            if (config.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
                return res.status(409).json({
                    message: "Username already exists."
                });
            }
            config.users.push({
                username: username.trim(),
                password: hashPassword(password),
                roles
            });
            this.indexController._writeConfig(config);
            res.status(201).json({
                message: `User "${username.trim()}" created successfully.`
            });
        } catch (e) {
            next(e);
        }
    }

    deleteAppUser(req, res, next) {
        const {
            username: userToDelete
        } = req.params;
        if (!userToDelete) return res.status(400).json({
            message: "Username is required."
        });

        try {
            const config = this.indexController._readConfig();
            const initialCount = config.users.length;
            if (initialCount <= 1) {
                return res.status(400).json({
                    message: "Cannot delete the last user."
                });
            }
            const filteredUsers = config.users.filter(user => user.username.toLowerCase() !== userToDelete.toLowerCase());
            if (filteredUsers.length === initialCount) {
                return res.status(404).json({
                    message: `User "${userToDelete}" not found.`
                });
            }
            config.users = filteredUsers;
            this.indexController._writeConfig(config);
            res.status(200).json({
                message: `User "${userToDelete}" deleted.`
            });
        } catch (e) {
            next(e);
        }
    }

    updateUserRoles(req, res, next) {
        const {
            username
        } = req.params;
        const {
            roles
        } = req.body;
        if (!Array.isArray(roles)) return res.status(400).json({
            message: "'roles' array is required."
        });

        try {
            const config = this.indexController._readConfig();
            const userIndex = config.users.findIndex(u => u.username === username);
            if (userIndex === -1) return res.status(404).json({
                message: `User "${username}" not found.`
            });

            const targetUser = config.users[userIndex];
            const originalRoles = targetUser.roles || [];

            if (originalRoles.includes("Admin") && !roles.includes("Admin")) {
                if (config.users.filter(u => u.roles && u.roles.includes("Admin")).length <= 1) {
                    return res.status(400).json({
                        message: "Cannot remove Admin role from the last admin."
                    });
                }
            }

            for (const roleName of roles) {
                if (!config.roles[roleName]) {
                    return res.status(400).json({
                        message: `Role '${roleName}' does not exist.`
                    });
                }
            }

            config.users[userIndex].roles = roles;
            this.indexController._writeConfig(config);
            res.status(200).json({
                message: `Roles for "${username}" updated.`
            });
        } catch (e) {
            next(e);
        }
    }

    updateUserPassword(req, res, next) {
        const {
            username
        } = req.params;
        const {
            currentPassword,
            newPassword
        } = req.body;
        if (!currentPassword || !newPassword || newPassword.length < 6) {
            return res.status(400).json({
                message: "Current and new password (min 6 chars) are required."
            });
        }

        try {
            const config = this.indexController._readConfig();
            const userIndex = config.users.findIndex(u => u.username === username);
            if (userIndex === -1) return res.status(404).json({
                message: `User "${username}" not found.`
            });

            const targetUser = config.users[userIndex];
            if (!verifyPassword(currentPassword, targetUser.password)) {
                return res.status(401).json({
                    message: "Incorrect current password."
                });
            }

            config.users[userIndex].password = hashPassword(newPassword);
            this.indexController._writeConfig(config);
            res.status(200).json({
                message: "Password updated."
            });
        } catch (e) {
            next(e);
        }
    }
}

module.exports = AuthController;
