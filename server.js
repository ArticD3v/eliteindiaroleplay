/**
 * Elite India Roleplay - Website + Quiz Verification Bot
 * 
 * Main entry point that starts BOTH:
 * 1. Express website (Discord OAuth quiz)
 * 2. Discord bot (role assignment)
 * 
 * Run with: node server.js
 */

require('dotenv').config();

const { startWebsite } = require('./website/website');
const { startBot } = require('./bot/bot');

console.log(`
╔═══════════════════════════════════════════════════════════╗
║         Elite India Roleplay - Combined Server            ║
║             Website + Discord Bot (v1.0.0)                ║
╚═══════════════════════════════════════════════════════════╝
`);

// Validate required environment variables for website
const requiredEnvVars = [
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'SESSION_SECRET'
];

const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(v => console.error(`   - ${v}`));
    console.error('\nPlease check your .env file.');
    process.exit(1);
}

// Start both services
async function main() {
    try {
        // Start the Express website
        const PORT = process.env.PORT || 3000;
        await startWebsite(PORT);
        console.log(`✅ Website started on http://localhost:${PORT}`);

        // Check if bot token is configured properly
        const botToken = process.env.DISCORD_BOT_TOKEN;
        const isPlaceholder = !botToken || botToken === 'your_bot_token_here' || botToken.startsWith('placeholder');

        if (isPlaceholder) {
            console.log('⚠️  Discord bot not started (DISCORD_BOT_TOKEN not configured)');
            console.log('   To enable the bot, add a valid bot token to .env');
            console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    Website Online                         ║
╠═══════════════════════════════════════════════════════════╣
║  Website: http://localhost:${PORT}                          ║
║  Bot: Not configured (optional)                           ║
╚═══════════════════════════════════════════════════════════╝
            `);
        } else {
            // Start the Discord bot
            try {
                await startBot();
                console.log('✅ Discord bot started and ready');
                console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    All Systems Online                     ║
╠═══════════════════════════════════════════════════════════╣
║  Website: http://localhost:${PORT}                          ║
║  Bot: Connected to Discord                                ║
╚═══════════════════════════════════════════════════════════╝
                `);
            } catch (botError) {
                console.error('⚠️  Discord bot failed to start:', botError.message);
                console.log('   Website will continue running without the bot.');
            }
        }

    } catch (error) {
        console.error('❌ Failed to start services:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down gracefully...');
    process.exit(0);
});

// Start everything
main();
