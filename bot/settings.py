# settings.py

# In-memory settings store (can be enhanced with persistence later)
settings_data = {
    # 💵 Auction Behavior
    "minimum_bid_amount": 1,
    "bid_timer_seconds": 10,
    "match_bid_enabled": False,
    "auto_bid_enabled": True,

    # 🧾 Roster/Cap Management
    "max_roster_size": 17,
    "min_roster_size": 12,
    "salary_cap": 500,
    "nomination_cost": 1,

    # 🔊 Notifications/Behavior
    "announce_wins": True,
    "mention_on_nomination": True,
    "reaction_mode": False,

    # 🛠️ Advanced Admin Features
    "allow_manual_override": True,
    "debug_mode": False,
    "auto_skip_enabled": True
}

def get_setting(key):
    return settings_data.get(key)

def update_setting(key, value):
    if key in settings_data:
        settings_data[key] = value
        return True
    return False
