from discord import app_commands
import discord
import time
from bot.settings import get_setting
from bot.core.auction_state import auction
from bot.core.sheets import get_team_limits
@app_commands.command(name="matchbid", description="Match the current highest bid (nominator only)")
async def matchbid(interaction: discord.Interaction):
    bid_amount = auction.highest_bid or 0
    user_limits = get_team_limits(interaction.user.id)
    if not user_limits:
        await interaction.response.send_message("❌ You are not listed as an Owner or GM.", ephemeral=True)
        return
    if user_limits['roster_count'] >= get_setting("max_roster_size"):
        await interaction.response.send_message("🚫 You’ve reached the max roster size.", ephemeral=True)
        return
    if user_limits['remaining'] < get_setting("minimum_bid_amount"):
        await interaction.response.send_message("💰 You don’t have enough cap space to place this bid.", ephemeral=True)
        return

    if not get_setting("match_bid_enabled"):
        await interaction.response.send_message("⚠️ Match Bid is currently disabled by the commissioner.", ephemeral=True)
        return

    if not auction.active_player:
        await interaction.response.send_message("❌ No player is currently up for bidding.", ephemeral=True)
        return

    if interaction.user != auction.nominator:
        await interaction.response.send_message("❌ Only the nominating team can use Match Bid.", ephemeral=True)
        return

    if interaction.user == auction.highest_bidder:
        await interaction.response.send_message("❌ You already have the highest bid.", ephemeral=True)
        return

    auction.highest_bidder = interaction.user

    if time.time() > auction.ends_at - 10:
        auction.reset_timer()
        await auction.channel.send("🔁 Match bid placed with <10s left — timer reset to 10 seconds!")

    await auction.channel.send(
        f"🎯 {interaction.user.mention} has matched the current bid of **${auction.highest_bid}** on **{auction.active_player}**!"
    )
    await interaction.response.send_message("✅ Match bid placed.", ephemeral=True)


@app_commands.command(name="startdraft", description="Start the live draft session")
async def startdraft(interaction: discord.Interaction):
    # === Commissioner-only Access (Uncomment this block on launch) ===
    # commissioner_role_name = "Commissioner"
    # if commissioner_role_name not in [role.name for role in interaction.user.roles]:
    auction.draft_started = True
    print("🔥 Draft started flag set to True")
    #     await interaction.response.send_message("🚫 Only the Commissioner can start the draft.", ephemeral=True)
    #     return

    # Reset auction state
    if auction.timer_task:
        auction.timer_task.cancel()
    auction.active_player = None
    auction.highest_bid = 0
    auction.highest_bidder = None
    auction.ends_at = None
    auction.timer_task = None
    auction.channel = interaction.channel
    auction.nominator = None
    auction.auto_bidders.clear()

    await interaction.response.send_message(
        "🚨 The draft has officially started! Use `/nominate` to begin bidding.",
        ephemeral=False
    )
@app_commands.command(name="setmatchbid", description="Enable or disable Match Bid (Commissioner only)")
@app_commands.describe(state="Enable ('on') or disable ('off') Match Bid")
async def setmatchbid(interaction: discord.Interaction, state: str):

    # === Commissioner-only check ===
    commissioner_role_name = "Commissioner"
    # if commissioner_role_name not in [role.name for role in interaction.user.roles]:
    #     await interaction.response.send_message("🚫 Only the Commissioner can change this setting.", ephemeral=True)
    #     return

    if state.lower() not in ["on", "off"]:
        await interaction.response.send_message("❌ Please enter 'on' or 'off'.", ephemeral=True)
        return

    update_setting("match_bid_enabled", state.lower() == "on")
    status = "enabled ✅" if get_setting("match_bid_enabled") else "disabled ❌"
    await interaction.response.send_message(f"🔧 Match Bid has been **{status}**.", ephemeral=False)

# async def startdraft(interaction: discord.Interaction):
#     global nomination_queue
#     if auction.timer_task:
#         auction.timer_task.cancel()
#     auction.active_player = None
#     auction.highest_bid = 0
#     auction.highest_bidder = None
#     auction.ends_at = None
#     auction.timer_task = None
#     auction.channel = interaction.channel
#     auction.nominator = None
#     auction.auto_bidders.clear()
# 
#     # === Build queue from Google Sheet ===
#     try:
#         scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
#         creds = ServiceAccountCredentials.from_json_keyfile_name("google_credentials.json", scope)
#         client = gspread.authorize(creds)
#         sheet = client.open_by_key("1QeLyKIgTSYFkLUqPcUrKyJBqTIo8WZoL-BI6tmqWcHk")
#         settings = sheet.worksheet("Settings")
#         rows = settings.get_all_records()
# 
#         nomination_queue.clear()
#         for row in rows:
#             if row.get("Owner Discord ID"):
#                 nomination_queue.append(int(row["Owner Discord ID"]))
#             if row.get("GM Discord ID"):
#                 nomination_queue.append(int(row["GM Discord ID"]))
#     except Exception as e:
#         await interaction.response.send_message(f"❌ Could not load nomination queue: {e}", ephemeral=True)
#         return
# 
#     await interaction.response.send_message(
#         "🚨 The draft has officially started! Use `/nominate` to begin bidding.",
#         ephemeral=False
#     )

# === Add to /nominate for queue rotation (Commented Out) ===
#     if not nomination_queue or interaction.user.id != nomination_queue[0]:
#         await interaction.response.send_message("⏳ It’s not your turn to nominate.", ephemeral=True)
#         return
# 
#     # Check if nominator is at max roster
#     limits = get_team_limits(interaction.user.id)
#         await interaction.response.send_message("🚫 Your team has a full roster. You cannot nominate.", ephemeral=True)
#         return
# 
#     nomination_queue.rotate(-1)
#     next_id = nomination_queue[0]
#     next_user = bot.get_user(next_id)
#     if next_user:
#         await auction.channel.send(f"📝 Up next to nominate: **{next_user.display_name}**")



# === Enhanced Nomination Queue with Auto-Skip (Commented Out for Testing) ===
# from collections import deque
# nomination_queue = deque()

# async def startdraft(interaction: discord.Interaction):
#     global nomination_queue
#     if auction.timer_task:
#         auction.timer_task.cancel()
#     auction.active_player = None
#     auction.highest_bid = 0
#     auction.highest_bidder = None
#     auction.ends_at = None
#     auction.timer_task = None
#     auction.channel = interaction.channel
#     auction.nominator = None
#     auction.auto_bidders.clear()
# 
#     # Load queue from Settings tab
#     try:
#         scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
#         creds = ServiceAccountCredentials.from_json_keyfile_name("google_credentials.json", scope)
#         client = gspread.authorize(creds)
#         sheet = client.open_by_key("1QeLyKIgTSYFkLUqPcUrKyJBqTIo8WZoL-BI6tmqWcHk")
#         settings = sheet.worksheet("Settings")
#         rows = settings.get_all_records()
# 
#         nomination_queue.clear()
#         for row in rows:
#             if row.get("Owner Discord ID"):
#                 nomination_queue.append(int(row["Owner Discord ID"]))
#             if row.get("GM Discord ID"):
#                 nomination_queue.append(int(row["GM Discord ID"]))
#     except Exception as e:
#         await interaction.response.send_message(f"❌ Error loading queue: {e}", ephemeral=True)
#         return
# 
#     await interaction.response.send_message(
#         "🚨 The draft has officially started! Use `/nominate` to begin bidding.",
#         ephemeral=False
#     )

# === In /nominate (Add this block before accepting nomination) ===
#     skip_attempts = 0
#     while nomination_queue:
#         next_id = nomination_queue[0]
#         limits = get_team_limits(next_id)
#         if limits and limits['roster_count'] < get_setting("max_roster_size"):
#             break  # Found a team that can nominate
#         skipped_user = bot.get_user(next_id)
#         if skipped_user:
#             await auction.channel.send(f"⏩ Skipping **{skipped_user.display_name}** (roster full)")
#         nomination_queue.rotate(-1)
#         skip_attempts += 1
#         if skip_attempts > len(nomination_queue):
#             await auction.channel.send("⚠️ No eligible teams available to nominate.")
#             return

#     if interaction.user.id != nomination_queue[0]:
#         await interaction.response.send_message("⏳ It’s not your turn to nominate.", ephemeral=True)
#         return

#     nomination_queue.rotate(-1)
#     next_user = bot.get_user(nomination_queue[0])
#     if next_user:
#         await auction.channel.send(f"📝 Up next to nominate: **{next_user.display_name}**")
@app_commands.command(name="autobidstatus", description="View your current auto-bid max for this player")
async def autobidstatus(interaction: discord.Interaction):
    user_id = interaction.user.id
    if user_id in auction.auto_bidders:
        max_bid = auction.auto_bidders[user_id]
        await interaction.response.send_message(
            f"🧠 Your auto-bid for **{auction.active_player}** is set to **${max_bid}**.",
            ephemeral=True
        )
    else:
        await interaction.response.send_message(
            "ℹ️ You do not have an auto-bid set for the current player.",
            ephemeral=True
        )

@app_commands.command(name="cancelautobid", description="Cancel your auto-bid for the current player")
async def cancelautobid(interaction: discord.Interaction):
    user_id = interaction.user.id
    if user_id in auction.auto_bidders:
        del auction.auto_bidders[user_id]
        await interaction.response.send_message(
            "🚫 Your auto-bid has been cancelled for this player.",
            ephemeral=True
        )
    else:
        await interaction.response.send_message(
            "ℹ️ You don’t have an active auto-bid to cancel.",
            ephemeral=True
        )


# === Nomination Queue Logic (Commented Out for Testing) ===
# from collections import deque
# nomination_queue = deque()  # Will be populated on /startdraft


async def setup(bot):
    bot.tree.add_command(matchbid)
    bot.tree.add_command(startdraft)
    bot.tree.add_command(autobidstatus)
    bot.tree.add_command(cancelautobid)
