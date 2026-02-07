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
        const users = storage.getUsers();
        const user = users[id];
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
}, (accessToken, refreshToken, profile, done) => {
    try {
        // Get or create user
        let users = storage.getUsers();

        const avatarHash = profile.avatar;
        const defaultAvatarIndex = profile.discriminator && profile.discriminator !== '0'
            ? parseInt(profile.discriminator) % 5
            : Number((BigInt(profile.id) >> 22n) % 6n);
        const avatarUrl = avatarHash
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${avatarHash}.png?size=128`
            : `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;

        if (!users[profile.id]) {
            // New user
            users[profile.id] = {
                discordId: profile.id,
                username: profile.username,
                avatar: avatarUrl,
                status: 'new',
                lastAttempt: null
            };
        } else {
            // Existing user - update profile info
            users[profile.id].username = profile.username;
            users[profile.id].avatar = avatarUrl;
        }

        storage.saveUsers(users);

        return done(null, users[profile.id]);
    } catch (err) {
        return done(err, null);
    }
}));

module.exports = passport;
