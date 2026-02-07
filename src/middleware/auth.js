/**
 * Authentication Middleware
 * Protects routes and handles admin access
 * 
 * Admin access is granted if user:
 * - Has Discord ID in ADMIN_DISCORD_IDS, OR
 * - Has the ADMIN_ROLE_ID role in Discord server
 */

// Get admin Discord IDs from environment
const getAdminIds = () => {
    const adminIds = process.env.ADMIN_DISCORD_IDS || '';
    return adminIds.split(',').map(id => id.trim()).filter(id => id);
};

// Get bot client for role checking
let getClient = null;
try {
    const bot = require('../../bot/bot');
    getClient = bot.getClient;
} catch (err) {
    // Bot module not available
}

/**
 * Check if a user has admin role in Discord
 * @param {string} discordId 
 * @returns {Promise<boolean>}
 */
async function hasAdminRole(discordId) {
    if (!getClient) return false;

    const client = getClient();
    if (!client || !client.isReady()) return false;

    const guildId = process.env.DISCORD_GUILD_ID;
    const adminRoleId = process.env.ADMIN_ROLE_ID;

    if (!guildId || !adminRoleId) return false;

    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) return false;

        const member = await guild.members.fetch(discordId).catch(() => null);
        if (!member) return false;

        return member.roles.cache.has(adminRoleId);
    } catch (err) {
        console.error('[Auth] Error checking admin role:', err.message);
        return false;
    }
}

/**
 * Check if user is admin (by ID or role)
 * @param {string} discordId
 * @returns {Promise<boolean>}
 */
async function checkIsAdmin(discordId) {
    // First check if in admin IDs list
    const adminIds = getAdminIds();
    if (adminIds.includes(discordId)) {
        return true;
    }

    // Then check Discord role
    return await hasAdminRole(discordId);
}

/**
 * Middleware to ensure user is authenticated
 */
const ensureAuth = (req, res, next) => {
    // Check if user is authenticated via session
    if (req.session && req.session.user) {
        // Polyfill req.user for backward compatibility with routes
        req.user = req.session.user;
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
};

/**
 * Middleware to ensure user is authenticated (for pages)
 */
const ensureAuthPage = (req, res, next) => {
    if (req.session && req.session.user) {
        req.user = req.session.user; // Polyfill
        return next();
    }
    res.redirect('/');
};

/**
 * Middleware to ensure user is an admin (API - async)
 */
const ensureAdmin = async (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = req.session.user; // Polyfill

    const isAdmin = await checkIsAdmin(req.user.discordId);
    if (isAdmin) {
        return next();
    }

    res.status(403).json({ error: 'Forbidden: Admin access required' });
};

/**
 * Middleware to ensure user is an admin (for pages - async)
 */
const ensureAdminPage = async (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/');
    }

    req.user = req.session.user; // Polyfill

    // Check if admin
    const isAdmin = await checkIsAdmin(req.user.discordId);
    if (isAdmin) {
        return next();
    }

    res.redirect('/dashboard.html');
};

/**
 * Check if a user ID is an admin (sync version - only checks ID list)
 */
const checkIsAdminSync = (discordId) => {
    const adminIds = getAdminIds();
    return adminIds.includes(discordId);
};

module.exports = {
    ensureAuth,
    ensureAuthPage,
    ensureAdmin,
    ensureAdminPage,
    isAdmin: checkIsAdminSync,
    checkIsAdmin
};
