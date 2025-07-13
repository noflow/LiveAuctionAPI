const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);

const SHEET_ID = '1QeLyKIgTSYFkLUqPcUrKyJBqTIo8WZoL-BI6tmqWcHk';

async function getUserTeamRole(discordId) {
  const doc = new GoogleSpreadsheet(SHEET_ID);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();

  const sheet = doc.sheetsByTitle['Team Settings'];
  const rows = await sheet.getRows();

  for (let row of rows) {
    if (row['Owner Discord ID'] === discordId) {
      return { team: row['Team Name'], role: 'Owner' };
    }
    if (row['GM Discord ID'] === discordId) {
      return { team: row['Team Name'], role: 'GM' };
    }
  }

  return { team: null, role: 'Viewer' };
}

module.exports = { getUserTeamRole };
