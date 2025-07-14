import time
import asyncio
from bot.core.sheets import (
    update_team_after_win,
    append_player_to_team_tab,
    remove_player_from_draft
)

class AuctionState:
    def __init__(self):
        self.active_player = None
        self.highest_bid = 0
        self.highest_bidder = None
        self.ends_at = None
        self.timer_task = None
        self.channel = None
        self.nominator = None
        self.auto_bidders = {}
        self.draft_started = False

    def reset_timer(self):
        self.ends_at = time.time() + 10

auction = AuctionState()

async def auction_countdown():
    while True:
        remaining = int(auction.ends_at - time.time())
        if remaining <= 0:
            break
        await asyncio.sleep(1)

    if auction.highest_bidder:
        await auction.channel.send(
            f"⏱️ Time's up! **{auction.active_player}** is won by **{auction.highest_bidder.mention}** for **${auction.highest_bid}**!"
        )
    else:
        await auction.channel.send(
            f"⏱️ Time's up! No bids were placed for **{auction.active_player}**."
        )

        # === WINNER FINALIZATION ===
        team_name = update_team_after_win(auction.highest_bidder.id, auction.highest_bid)
        if team_name:
            append_player_to_team_tab(team_name, auction.active_player, auction.highest_bid)
            remove_player_from_draft(auction.active_player)
            await auction.channel.send(f"📥 **{auction.active_player}** added to **{team_name}** roster.")

    auction.active_player = None
    auction.highest_bid = 0
    auction.highest_bidder = None
    auction.ends_at = None
    auction.timer_task = None
    auction.channel = None
    auction.nominator = None
    auction.auto_bidders.clear()
