from discord import app_commands
import discord
import time
from bot.settings import get_setting
from bot.core.sheets import get_team_limits
from bot.core.auction_state import auction, auction_countdown
from bot.commands.bidding import check_auto_bidders
import asyncio

# 🔁 Shared nominate logic
async def handle_nomination(user, channel, player):
    if auction.active_player:
        return { "success": False, "message": "❌ A player is already up for bidding." }

    auction.active_player = player
    auction.highest_bidder = user
    auction.channel = channel
    auction.nominator = user

    opening_bid = get_setting("minimum_bid_amount")
    auction.highest_bid = opening_bid
    auction.reset_timer()

    # Start countdown timer
    if auction.timer_task:
        auction.timer_task.cancel()
    auction.timer_task = asyncio.create_task(auction_countdown())

    # Trigger auto-bid logic
    await check_auto_bidders()

    return {
        "success": True,
        "message": f"🎯 {user.display_name} has nominated **{player}**! Bidding starts at **${opening_bid}**.\n{user.mention} is the current high bidder."
    }

# 🛠 Slash command using shared logic
@app_commands.command(name="nominate", description="Nominate a player for auction")
@app_commands.describe(player="Name of the player to nominate")
async def nominate(interaction: discord.Interaction, player: str):
    result = await handle_nomination(interaction.user, interaction.channel, player)
    await interaction.response.send_message(result["message"], ephemeral=not result["success"])

# 🔧 Registration
async def setup(bot):
    bot.tree.add_command(nominate)
