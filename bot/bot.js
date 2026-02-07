/**
 * Elite India Roleplay - Discord Bot Module
 * 
 * Handles role assignment for passed quiz users
 * 
 * Commands:
 * - !verify - Check your own verification status
 * - !sync - (Admin only) Bulk sync all passed users
 */

const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const storage = require('../src/utils/storage');

// Bot configuration from environment
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const ALLOWLIST_ROLE_ID = process.env.ALLOWLIST_ROLE_ID;
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
const BOT_PREFIX = process.env.BOT_PREFIX || '!';

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

/**
 * Check if a member has admin permissions
 */
function isAdmin(member) {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }
    if (ADMIN_ROLE_ID && member.roles.cache.has(ADMIN_ROLE_ID)) {
        return true;
    }
    return false;
}

/**
 * Assign allowlist role to a member
 */
async function assignRole(member) {
    if (!ALLOWLIST_ROLE_ID) {
        return { success: false, reason: 'Role ID not configured' };
    }

    try {
        const role = member.guild.roles.cache.get(ALLOWLIST_ROLE_ID);
        if (!role) {
            return { success: false, reason: 'Role not found in server' };
        }

        if (member.roles.cache.has(ALLOWLIST_ROLE_ID)) {
            return { success: true, reason: 'Already has role' };
        }

        await member.roles.add(role);
        return { success: true, reason: 'Role assigned' };
    } catch (error) {
        console.error(`[Bot] Failed to assign role to ${member.user.tag}:`, error.message);
        return { success: false, reason: error.message };
    }
}

/**
 * Handle !verify command
 */
async function handleVerify(message) {
    const discordId = message.author.id;
    const user = storage.getUser(discordId);

    const embed = new EmbedBuilder()
        .setColor(0x9b4dca)
        .setTitle('🎮 Elite India Roleplay - Verification')
        .setTimestamp();

    if (!user) {
        embed.setColor(0xff4757)
            .setDescription('❌ You have not registered on the quiz website yet.')
            .addFields({ name: 'Next Steps', value: 'Visit the website and login with Discord to take the quiz.' });
    } else if (user.status === 'passed') {
        embed.setColor(0x00ff88)
            .setDescription('✅ You have passed the allowlist quiz!')
            .addFields({ name: 'Status', value: 'Passed', inline: true });

        // Try to assign role
        const member = message.member;
        if (member && ALLOWLIST_ROLE_ID) {
            const result = await assignRole(member);
            if (result.success) {
                embed.addFields({ name: 'Role', value: result.reason === 'Already has role' ? '✅ Already assigned' : '✅ Assigned!', inline: true });
            } else {
                embed.addFields({ name: 'Role', value: `⚠️ ${result.reason}`, inline: true });
            }
        }
    } else if (user.status === 'failed') {
        const { inCooldown, remainingTime } = storage.isInCooldown(discordId);
        embed.setColor(0xff4757)
            .setDescription('❌ You have not passed the quiz yet.');

        if (inCooldown) {
            const hours = Math.floor(remainingTime / (1000 * 60 * 60));
            const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
            embed.addFields({ name: 'Cooldown', value: `You can retry in ${hours}h ${minutes}m`, inline: true });
        } else {
            embed.addFields({ name: 'Status', value: 'Cooldown ended. You can retry!', inline: true });
        }
    } else {
        embed.setColor(0xffa502)
            .setDescription('⏳ You have not attempted the quiz yet.')
            .addFields({ name: 'Next Steps', value: 'Visit the website to take the quiz.' });
    }

    await message.reply({ embeds: [embed] });
}

/**
 * Handle !sync command (Admin only)
 */
async function handleSync(message) {
    if (!isAdmin(message.member)) {
        const embed = new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('❌ Access Denied')
            .setDescription('You do not have permission to use this command.');
        await message.reply({ embeds: [embed] });
        return;
    }

    if (!ALLOWLIST_ROLE_ID) {
        const embed = new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('❌ Configuration Error')
            .setDescription('ALLOWLIST_ROLE_ID is not configured in .env');
        await message.reply({ embeds: [embed] });
        return;
    }

    const statusMsg = await message.reply('🔄 Syncing roles for all passed users...');

    try {
        const users = storage.getUsers();
        const passedUsers = Object.values(users).filter(u => u.status === 'passed');

        let assigned = 0;
        let alreadyHad = 0;
        let failed = 0;
        let notInServer = 0;

        for (const user of passedUsers) {
            try {
                const member = await message.guild.members.fetch(user.discordId).catch(() => null);

                if (!member) {
                    notInServer++;
                    continue;
                }

                const result = await assignRole(member);
                if (result.success) {
                    if (result.reason === 'Already has role') {
                        alreadyHad++;
                    } else {
                        assigned++;
                    }
                } else {
                    failed++;
                }
            } catch (err) {
                failed++;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x00ff88)
            .setTitle('✅ Sync Complete')
            .setDescription(`Processed ${passedUsers.length} passed users`)
            .addFields(
                { name: '✅ Newly Assigned', value: String(assigned), inline: true },
                { name: '✔️ Already Had Role', value: String(alreadyHad), inline: true },
                { name: '❌ Failed', value: String(failed), inline: true },
                { name: '👻 Not in Server', value: String(notInServer), inline: true }
            )
            .setTimestamp();

        await statusMsg.edit({ content: null, embeds: [embed] });

    } catch (error) {
        console.error('[Bot] Sync error:', error);
        await statusMsg.edit('❌ Sync failed: ' + error.message);
    }
}

/**
 * Bot event handlers
 */
client.once('ready', () => {
    console.log(`[Bot] Logged in as ${client.user.tag}`);

    // Set bot activity
    client.user.setActivity('Elite India Roleplay', { type: 3 }); // Watching
});

client.on('messageCreate', async (message) => {
    // Ignore DMs
    if (!message.guild) return;

    // Ignore bots
    if (message.author.bot) return;

    // Check for command prefix
    if (!message.content.startsWith(BOT_PREFIX)) return;

    const args = message.content.slice(BOT_PREFIX.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    try {
        switch (command) {
            case 'verify':
                await handleVerify(message);
                break;
            case 'sync':
                await handleSync(message);
                break;
            case 'help':
                const helpEmbed = new EmbedBuilder()
                    .setColor(0x9b4dca)
                    .setTitle('🎮 Elite India Roleplay Bot')
                    .setDescription('Commands for the allowlist verification system')
                    .addFields(
                        { name: `${BOT_PREFIX}verify`, value: 'Check your quiz status and get your role', inline: false },
                        { name: `${BOT_PREFIX}sync`, value: '(Admin) Bulk assign roles to all passed users', inline: false }
                    )
                    .setFooter({ text: 'Complete the quiz on the website to get allowlisted!' });
                await message.reply({ embeds: [helpEmbed] });
                break;
        }
    } catch (error) {
        console.error(`[Bot] Error handling command ${command}:`, error);
    }
});

client.on('error', (error) => {
    console.error('[Bot] Discord client error:', error);
});

/**
 * Start the Discord bot
 */
async function startBot() {
    if (!BOT_TOKEN) {
        throw new Error('DISCORD_BOT_TOKEN is not set in .env');
    }

    await client.login(BOT_TOKEN);

    // Wait for ready event
    return new Promise((resolve) => {
        if (client.isReady()) {
            resolve(client);
        } else {
            client.once('ready', () => resolve(client));
        }
    });
}

/**
 * Get the bot client instance
 */
function getClient() {
    return client;
}

/**
 * Assign role to a user by Discord ID (called from website when quiz passed)
 * @param {string} discordId - The Discord user ID
 * @returns {Promise<{success: boolean, reason: string}>}
 */
async function assignRoleToUser(discordId) {
    if (!client.isReady()) {
        console.log('[Bot] Cannot assign role - bot not ready');
        return { success: false, reason: 'Bot not ready' };
    }

    if (!GUILD_ID) {
        console.log('[Bot] Cannot assign role - DISCORD_GUILD_ID not configured');
        return { success: false, reason: 'Guild ID not configured' };
    }

    if (!ALLOWLIST_ROLE_ID) {
        console.log('[Bot] Cannot assign role - ALLOWLIST_ROLE_ID not configured');
        return { success: false, reason: 'Role ID not configured' };
    }

    try {
        // Get the guild
        const guild = await client.guilds.fetch(GUILD_ID);
        if (!guild) {
            return { success: false, reason: 'Guild not found' };
        }

        // Get the member
        const member = await guild.members.fetch(discordId).catch(() => null);
        if (!member) {
            return { success: false, reason: 'User not in server' };
        }

        // Get the role
        const role = guild.roles.cache.get(ALLOWLIST_ROLE_ID);
        if (!role) {
            return { success: false, reason: 'Role not found' };
        }

        // Check if already has role
        if (member.roles.cache.has(ALLOWLIST_ROLE_ID)) {
            console.log(`[Bot] User ${member.user.tag} already has allowlist role`);
            return { success: true, reason: 'Already has role' };
        }

        // Assign the role
        await member.roles.add(role);
        console.log(`[Bot] ✅ Assigned allowlist role to ${member.user.tag}`);

        // Optional: Send DM to user
        try {
            await member.send({
                embeds: [{
                    color: 0x00ff88,
                    title: '🎉 Congratulations!',
                    description: 'You have passed the Elite India Roleplay allowlist quiz!',
                    fields: [
                        { name: 'Status', value: '✅ Allowlisted', inline: true },
                        { name: 'Role', value: '✅ Assigned', inline: true }
                    ],
                    footer: { text: 'Welcome to Elite India Roleplay!' },
                    timestamp: new Date().toISOString()
                }]
            });
        } catch (dmError) {
            // User has DMs disabled, that's okay
            console.log(`[Bot] Could not DM user ${member.user.tag} (DMs disabled)`);
        }

        return { success: true, reason: 'Role assigned' };

    } catch (error) {
        console.error(`[Bot] Error assigning role to ${discordId}:`, error.message);
        return { success: false, reason: error.message };
    }
}

/**
 * Remove allowlist role from a user by Discord ID (called when admin fails user)
 * @param {string} discordId - The Discord user ID
 * @returns {Promise<{success: boolean, reason: string}>}
 */
async function removeRoleFromUser(discordId) {
    if (!client.isReady()) {
        console.log('[Bot] Cannot remove role - bot not ready');
        return { success: false, reason: 'Bot not ready' };
    }

    if (!GUILD_ID) {
        console.log('[Bot] Cannot remove role - DISCORD_GUILD_ID not configured');
        return { success: false, reason: 'Guild ID not configured' };
    }

    if (!ALLOWLIST_ROLE_ID) {
        console.log('[Bot] Cannot remove role - ALLOWLIST_ROLE_ID not configured');
        return { success: false, reason: 'Role ID not configured' };
    }

    try {
        // Get the guild
        const guild = await client.guilds.fetch(GUILD_ID);
        if (!guild) {
            return { success: false, reason: 'Guild not found' };
        }

        // Get the member
        const member = await guild.members.fetch(discordId).catch(() => null);
        if (!member) {
            return { success: false, reason: 'User not in server' };
        }

        // Get the role
        const role = guild.roles.cache.get(ALLOWLIST_ROLE_ID);
        if (!role) {
            return { success: false, reason: 'Role not found' };
        }

        // Check if user has the role
        if (!member.roles.cache.has(ALLOWLIST_ROLE_ID)) {
            console.log(`[Bot] User ${member.user.tag} doesn't have allowlist role`);
            return { success: true, reason: 'Role not present' };
        }

        // Remove the role
        await member.roles.remove(role);
        console.log(`[Bot] ❌ Removed allowlist role from ${member.user.tag}`);

        // Optional: Send DM to user
        try {
            await member.send({
                embeds: [{
                    color: 0xff4757,
                    title: '⚠️ Allowlist Status Changed',
                    description: 'Your allowlist status has been revoked by an administrator.',
                    fields: [
                        { name: 'Status', value: '❌ Revoked', inline: true },
                        { name: 'Action Required', value: 'Please retake the quiz', inline: true }
                    ],
                    footer: { text: 'Elite India Roleplay' },
                    timestamp: new Date().toISOString()
                }]
            });
        } catch (dmError) {
            console.log(`[Bot] Could not DM user ${member.user.tag} (DMs disabled)`);
        }

        return { success: true, reason: 'Role removed' };

    } catch (error) {
        console.error(`[Bot] Error removing role from ${discordId}:`, error.message);
        return { success: false, reason: error.message };
    }
}

/**
 * Notify user of staff application result
 */
async function notifyStaffAppResult(discordId, status, reason) {
    if (!client.isReady()) return { success: false, reason: 'Bot not ready' };

    try {
        const user = await client.users.fetch(discordId).catch(() => null);
        if (!user) return { success: false, reason: 'User not found' };

        const isAccepted = status === 'accepted';
        const embed = new EmbedBuilder()
            .setColor(isAccepted ? 0x00ff88 : 0xff4757)
            .setTitle(isAccepted ? '👔 Staff Application Accepted!' : '👔 Staff Application Rejected')
            .setDescription(`Your staff application for Elite India Roleplay has been ${status}.`)
            .addFields({ name: 'Reason/Message', value: reason || 'No specific reason provided.' })
            .setTimestamp();

        if (isAccepted) {
            embed.addFields({ name: 'Next Steps', value: 'Please contact a Senior Admin for your onboarding.' });
        }

        await user.send({ embeds: [embed] });
        return { success: true };
    } catch (error) {
        console.error(`[Bot] Failed to DM user ${discordId}:`, error.message);
        return { success: false, reason: error.message };
    }
}

/**
 * Notify user of gang application result
 */
async function notifyGangAppResult(discordId, status, gangName, reason) {
    if (!client.isReady()) return { success: false, reason: 'Bot not ready' };

    try {
        const user = await client.users.fetch(discordId).catch(() => null);
        if (!user) return { success: false, reason: 'User not found' };

        const isAccepted = status === 'accepted';
        const embed = new EmbedBuilder()
            .setColor(isAccepted ? 0x00ff88 : 0xff4757)
            .setTitle(isAccepted ? '🔫 Gang Application Accepted!' : '🔫 Gang Application Rejected')
            .setDescription(`Your application for gang **${gangName}** has been ${status}.`)
            .addFields({ name: 'Reason/Message', value: reason || 'No specific reason provided.' })
            .setTimestamp();

        if (isAccepted) {
            embed.addFields({ name: 'Next Steps', value: 'Your gang registration is now official. Please check gang rules for more info.' });
        }

        await user.send({ embeds: [embed] });
        return { success: true };
    } catch (error) {
        console.error(`[Bot] Failed to DM user ${discordId}:`, error.message);
        return { success: false, reason: error.message };
    }
}

module.exports = { startBot, getClient, assignRoleToUser, removeRoleFromUser, notifyStaffAppResult, notifyGangAppResult };
