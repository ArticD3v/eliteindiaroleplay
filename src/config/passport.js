const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const storage = require('../utils/storage');

// Scopes required for Discord OAuth
const scopes = ['identify'];

passport.serializeUser((user, done) => {
    done(null, user.discordId);
});

passport.deserializeUser(async (id, done) => {
    try {
        // Was: storage.getUsers()[id]; Now: storage.getUser(id)
        const user = await storage.getUser(id);
        if (user) {
            done(null, user);
        } else {
            done(null, null);
        }
    } catch (err) {
        done(err, null);
    }
});

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: scopes
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Get user from DB
        let user = await storage.getUser(profile.id);

        const avatarHash = profile.avatar;
        const defaultAvatarIndex = profile.discriminator && profile.discriminator !== '0'
            ? parseInt(profile.discriminator) % 5
            : Number((BigInt(profile.id) >> 22n) % 6n);
        const avatarUrl = avatarHash
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${avatarHash}.png?size=128`
            : `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;

        if (!user) {
            // New user
            user = {
                discordId: profile.id,
                username: profile.username,
                avatar: avatarUrl,
                status: 'new',
                lastAttempt: null
            };
            await storage.saveUser(user); // Insert
        } else {
            // Existing user - update profile info
            await storage.updateUser(profile.id, {
                username: profile.username,
                avatar: avatarUrl
            });
            // Update local object to return
            user.username = profile.username;
            user.avatar = avatarUrl;
        }

        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));

module.exports = passport;
