
import gspread
import os
import json
from oauth2client.service_account import ServiceAccountCredentials

scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
json_creds = os.environ.get("GOOGLE_CREDENTIALS")
if not json_creds:
    raise RuntimeError("❌ GOOGLE_CREDENTIALS env variable is missing.")
parsed = json.loads(json.loads(json_creds))
print("[✅ Credentials loaded from GOOGLE_CREDENTIALS]")
credentials = ServiceAccountCredentials.from_json_keyfile_dict(parsed, scope)
client = gspread.authorize(credentials)

SHEET_ID = "1QeLyKIgTSYFkLUqPcUrKyJBqTIo8WZoL-BI6tmqWcHk"

def get_sheet():
    return client.open_by_key(SHEET_ID)

def load_draft_list():
    sheet = get_sheet().worksheet("Draft List")
    data = sheet.get_all_records()
    result = []
    for row in data:
        result.append({
            "id": row.get("PSN / XBL ID", "").strip(),
            "position": row.get("Main Position", "").strip() + ("/" + row["Other Positions"].strip() if row.get("Other Positions") else ""),
            "hand": row.get("Hand", "").strip()
        })
    return result

def load_team_list():
    sheet = get_sheet().worksheet("Team List")
    return sheet.get_all_records()

def update_team_after_win(team_name, amount, increment_roster=True):
    sheet = get_sheet().worksheet("Team Settings")
    data = sheet.get_all_records()
    for idx, row in enumerate(data):
        if row.get("Team Name", "").strip().lower() == team_name.strip().lower():
            salary_used = float(row.get("Salary Used", 0)) + amount
            salary_remaining = float(row.get("Salary", 0)) - salary_used
            roster_count = int(row.get("Roster Count", 0)) + (1 if increment_roster else 0)
            sheet.update(f"G{idx+2}", salary_used)
            sheet.update(f"H{idx+2}", salary_remaining)
            sheet.update(f"I{idx+2}", roster_count)
            return

def append_player_to_team_tab(team_name, player_name, amount):
    sheet = get_sheet().worksheet("Team")
    sheet.append_row([team_name, player_name, amount])

def remove_player_from_draft(player_name):
    sheet = get_sheet().worksheet("Draft List")
    data = sheet.get_all_records()
    for idx, row in enumerate(data):
        if row.get("PSN / XBL ID", "").strip().lower() == player_name.strip().lower():
            sheet.delete_rows(idx + 2)
            return

def get_team_limits(team_name):
    sheet = get_sheet().worksheet("Team Settings")
    data = sheet.get_all_records()
    for row in data:
        if row.get("Team Name", "").strip().lower() == team_name.strip().lower():
            return {
                "min_roster": int(row.get("Min Roster", 0)),
                "max_roster": int(row.get("Max Roster", 0)),
                "salary": float(row.get("Salary", 0)),
                "salary_used": float(row.get("Salary Used", 0)),
                "roster_count": int(row.get("Roster Count", 0)),
            }
    return {}
