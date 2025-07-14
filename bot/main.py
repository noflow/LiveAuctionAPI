import os
import time
import asyncio
import discord
from discord.ext import commands
from discord import app_commands
from dotenv import load_dotenv

from bot.settings import get_setting, update_setting
from bot.core.auction_state import auction, AuctionState
from bot.core.sheets import (
    update_team_after_win,
    append_player_to_team_tab,
    remove_player_from_draft,
    get_team_limits,
)
from bot.commands import bidding, control, nominate

# ✅ Load environment variables
load_dotenv()
TOKEN = os.getenv("TOKEN")
GUILD_ID = int(os.getenv("GUILD_ID"))

# ✅ Define bot intents
INTENTS = discord.Intents.default()
INTENTS.guilds = True
INTENTS.members = True
INTENTS.messages = True
INTENTS.message_content = True

# ✅ Define the bot class
class DraftBot(commands.Bot):
    def __init__(self):
        super().__init__(command_prefix="!", intents=INTENTS)

    async def setup_hook(self):
        guild = discord.Object(id=GUILD_ID)
        self.tree.copy_global_to(guild=guild)
        await bidding.setup(self)
        await control.setup(self)
        await nominate.setup(self)
        await self.tree.sync(guild=guild)
        print(f"✅ Slash commands synced to guild {GUILD_ID}")

# ✅ Create bot instance
bot = DraftBot()

# ✅ on_ready event
@bot.event
async def on_ready():
    print(f"🤖 Bot ready: {bot.user}")

@bot.event
async def on_interaction(interaction):
    print(f"👀 Interaction received: {interaction.data}")


# ✅ Run the bot
bot.run(TOKEN)