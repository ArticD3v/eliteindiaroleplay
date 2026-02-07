# Elite India Roleplay - Website + Discord Bot

A combined Discord-authenticated allowlist quiz website with automatic role assignment bot for FiveM roleplay servers.

## Features

### Website
- **Discord OAuth2 Authentication** - Login with Discord
- **10-Question MCQ Quiz** - Test roleplay knowledge
- **Server-Side Evaluation** - Secure answer validation
- **24-Hour Cooldown** - Enforced retry period on failure
- **Admin Panel** - View all quiz attempts

### Discord Bot
- **Automatic Role Assignment** - Assign allowlist role to passed users
- **!verify Command** - Check quiz status and get role
- **!sync Command** - (Admin) Bulk sync all passed users
- **!help Command** - View available commands

## Quick Start

### 1. Clone/Setup

```bash
cd d:\EIRP\Elite
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application (or use existing)

**For OAuth2 (Website Login):**
- Go to OAuth2 → General
- Add redirect URL: `http://localhost:3000/auth/discord/callback`
- Copy **Client ID** and **Client Secret**

**For Bot:**
- Go to Bot section
- Click "Reset Token" and copy the **Bot Token**
- Enable these Privileged Gateway Intents:
  - ✅ SERVER MEMBERS INTENT
  - ✅ MESSAGE CONTENT INTENT

**Invite Bot to Server:**
- Go to OAuth2 → URL Generator
- Select scopes: `bot`
- Select permissions: `Manage Roles`, `Send Messages`, `Read Message History`
- Copy and open the generated URL to invite bot

### 4. Create Environment File

Edit `.env` with your values:

```env
# OAuth (Website)
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_CALLBACK_URL=http://localhost:3000/auth/discord/callback

# Bot
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_GUILD_ID=your_server_id
ALLOWLIST_ROLE_ID=role_to_assign_when_passed
ADMIN_ROLE_ID=role_for_sync_command

# Other
SESSION_SECRET=random_secure_string
ADMIN_DISCORD_IDS=your_discord_id
```

**How to get IDs:**
- Enable Developer Mode in Discord (User Settings → Advanced)
- Right-click server → Copy Server ID
- Right-click role → Copy Role ID

### 5. Run the Application

```bash
npm start
```

This single command starts BOTH the website and bot!

## Project Structure

```
Elite/
├── server.js              # Main entry point (starts both)
├── website/
│   └── website.js         # Express app module
├── bot/
│   └── bot.js             # Discord bot module
├── src/
│   ├── config/passport.js # OAuth configuration
│   ├── middleware/auth.js # Auth middleware
│   ├── routes/            # API routes
│   └── utils/storage.js   # JSON file handling
├── data/
│   ├── questions.json     # Quiz questions
│   ├── users.json         # User data
│   └── attempts.json      # Quiz attempts
└── public/                # Frontend files
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `!verify` | Check your quiz status and receive allowlist role if passed |
| `!sync` | (Admin only) Bulk assign roles to all passed users |
| `!help` | Show available commands |

## How It Works

1. User visits website and logs in with Discord
2. User takes the 10-question quiz
3. If score ≥ 7/10, user is marked as "passed" in JSON
4. User runs `!verify` in Discord server
5. Bot checks JSON and assigns allowlist role
6. Admins can run `!sync` to bulk-assign roles

## Security Notes

- Bot token is kept in `.env` (never committed)
- Quiz answers validated server-side only
- Bot only reads JSON, never modifies it
- Admin commands require specific role/permissions

## Troubleshooting

**Bot not responding:**
- Check if bot token is correct
- Verify MESSAGE CONTENT INTENT is enabled
- Ensure bot has permissions in the channel

**Role not assigning:**
- Bot role must be ABOVE the allowlist role in server settings
- Check ALLOWLIST_ROLE_ID is correct
- Verify bot has "Manage Roles" permission

**OAuth error:**
- Verify callback URL matches exactly in Discord app
- Check Client ID and Secret are correct

## License

ISC - Built for Elite India Roleplay FiveM Server
