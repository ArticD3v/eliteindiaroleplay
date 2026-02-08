import os
import asyncio
import discord
from discord.ext import commands
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
GUILD_ID = int(os.getenv('DISCORD_GUILD_ID', 0))
ALLOWLIST_ROLE_ID = int(os.getenv('ALLOWLIST_ROLE_ID', 0))
ADMIN_ROLE_ID = int(os.getenv('ADMIN_ROLE_ID', 0))
PREFIX = os.getenv('BOT_PREFIX', '!')

# Initialize Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Initialize Bot
intents = discord.Intents.default()
intents.members = True
intents.message_content = True
bot = commands.Bot(command_prefix=PREFIX, intents=intents)

async def assign_role_to_member(member: discord.Member):
    """Assigns the allowlist role to a member."""
    if not ALLOWLIST_ROLE_ID:
        return False, "Role ID not configured"
    
    role = member.guild.get_role(ALLOWLIST_ROLE_ID)
    if not role:
        return False, "Role not found in server"
    
    if role in member.roles:
        return True, "Already has role"
    
    try:
        await member.add_roles(role)
        return True, "Role assigned"
    except Exception as e:
        print(f"[Bot] Error assigning role to {member}: {e}")
        return False, str(e)

@bot.event
async def on_ready():
    print(f'[Bot] Logged in as {bot.user.name} ({bot.user.id})')
    await bot.change_presence(activity=discord.Activity(type=discord.ActivityType.watching, name="Elite India Roleplay"))
    
    # Start Realtime Listener in background
    bot.loop.create_task(listen_for_passed_quiz())

async def listen_for_passed_quiz():
    """Listens for new 'passed' attempts in Supabase Realtime."""
    print("[Bot] Starting Realtime listener for 'attempts' table...")
    
    def on_handle(payload):
        # This is the callback for realtime events
        new_record = payload.get('record')
        if not new_record:
            return
            
        is_passed = new_record.get('passed')
        discord_id = new_record.get('discord_id')
        
        if is_passed and discord_id:
            print(f"[Bot] Realtime: User {discord_id} passed!")
            # We need to run the role assignment in the bot's event loop
            asyncio.run_coroutine_threadsafe(auto_assign_role(discord_id), bot.loop)

    try:
        # Note: supabase-py Realtime support can be tricky depending on version
        # Recommended: Use the storage utility patterns if realtime is not enabled or stable
        # For now, we subscribe to 'attempts' INSERTs
        supabase.table('attempts').on_insert(on_handle).subscribe()
    except Exception as e:
        print(f"[Bot] Realtime Error: {e}")

async def auto_assign_role(discord_id):
    """Automatically assigns role to a user given their Discord ID."""
    guild = bot.get_guild(GUILD_ID)
    if not guild:
        print(f"[Bot] Guild {GUILD_ID} not found")
        return

    member = guild.get_member(int(discord_id))
    if not member:
        # Try to fetch if not in cache
        try:
            member = await guild.fetch_member(int(discord_id))
        except:
            print(f"[Bot] User {discord_id} not in server")
            return

    success, reason = await assign_role_to_member(member)
    if success:
        print(f"[Bot] Auto-role: Assigned to {member.name} ({reason})")
        # Notify user in DM
        try:
            embed = discord.Embed(
                title="🎉 Congratulations!",
                description="You have passed the Elite India Roleplay allowlist quiz!",
                color=0x00ff88
            )
            embed.add_field(name="Status", value="✅ Allowlisted")
            embed.set_footer(text="Welcome to Elite India Roleplay!")
            await member.send(embed=embed)
        except:
            pass

@bot.command()
async def verify(ctx):
    """Check your own verification status."""
    discord_id = str(ctx.author.id)
    
    # Query Supabase for user status
    res = supabase.table('users').select('*').eq('discord_id', discord_id).execute()
    user_data = res.data[0] if res.data else None
    
    embed = discord.Embed(title="🎮 Elite India Roleplay - Verification", color=0x9b4dca)
    
    if not user_data:
        embed.description = "❌ You have not registered on the quiz website yet."
        embed.color = 0xff4757
        embed.add_field(name="Next Steps", value="Visit the website and login with Discord to take the quiz.")
    elif user_data.get('status') == 'passed':
        embed.description = "✅ You have passed the allowlist quiz!"
        embed.color = 0x00ff88
        
        success, reason = await assign_role_to_member(ctx.author)
        role_status = "✅ Assigned!" if reason == "Role assigned" else "✅ Already assigned" if success else f"⚠️ {reason}"
        embed.add_field(name="Role Status", value=role_status)
    else:
        embed.description = "⏳ You have not passed the quiz yet."
        embed.add_field(name="Next Steps", value="Visit the website to take/retry the quiz.")

    await ctx.reply(embed=embed)

@bot.command()
@commands.has_permissions(administrator=True)
async def sync(ctx):
    """(Admin only) Bulk sync all passed users."""
    status_msg = await ctx.send("🔄 Syncing roles for all passed users...")
    
    # Fetch all passed users from Supabase
    res = supabase.table('users').select('discord_id').eq('status', 'passed').execute()
    passed_users = res.data
    
    assigned = 0
    already_had = 0
    failed = 0
    not_in_server = 0
    
    for user in passed_users:
        d_id = int(user['discord_id'])
        member = ctx.guild.get_member(d_id)
        if not member:
            try:
                member = await ctx.guild.fetch_member(d_id)
            except:
                not_in_server += 1
                continue
        
        success, reason = await assign_role_to_member(member)
        if success:
            if reason == "Already has role":
                already_had += 1
            else:
                assigned += 1
        else:
            failed += 1
            
    embed = discord.Embed(title="✅ Sync Complete", color=0x00ff88)
    embed.add_field(name="✅ Newly Assigned", value=str(assigned))
    embed.add_field(name="✔️ Already Had Role", value=str(already_had))
    embed.add_field(name="❌ Failed", value=str(failed))
    embed.add_field(name="👻 Not in Server", value=str(not_in_server))
    
    await status_msg.edit(content=None, embed=embed)

if __name__ == '__main__':
    if not BOT_TOKEN:
        print("❌ Error: DISCORD_BOT_TOKEN not found in environment")
    else:
        bot.run(BOT_TOKEN)
