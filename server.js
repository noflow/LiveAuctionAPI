const express = require("express");
const axios = require("axios");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors({ origin: "https://wcahockey.com", credentials: true }));
app.use(cookieParser());
app.use(express.json());

const SETTINGS_PATH = path.join(__dirname, "data", "settings.json");

// 🔐 Role-protection middleware
function requireRole(allowedRoles) {
  return async (req, res, next) => {
    const userCookie = req.cookies.user;
    if (!userCookie) return res.status(401).send("Not logged in");

    const user = JSON.parse(userCookie);

    try {
      const response = await axios.get(
        `https://discord.com/api/guilds/${process.env.DISCORD_SERVER_ID}/members/${user.id}`,
        {
          headers: {
            Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
          },
        }
      );

      const userRoles = response.data.roles;
      const hasPermission = allowedRoles.some(role => userRoles.includes(role));

      if (!hasPermission) {
        return res.status(403).send("Forbidden: Insufficient role");
      }

      next();
    } catch (err) {
      console.error("Role check failed:", err.response?.data || err.message);
      res.status(500).send("Error verifying role");
    }
  };
}

// 🏠 Test route
app.get("/", (req, res) => res.send("Live Auction API running!"));

// 🔗 Discord login redirect
app.get("/auth/discord", (req, res) => {
  const redirect_uri = encodeURIComponent(process.env.DISCORD_REDIRECT_URI);
  const client_id = process.env.DISCORD_CLIENT_ID;
  const scope = encodeURIComponent("identify guilds guilds.members.read");
  const url = `https://discord.com/api/oauth2/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code&scope=${scope}`;
  res.redirect(url);
});

// 🔐 OAuth2 callback
app.get("/auth/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Missing code");

  try {
    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, token_type } = tokenResponse.data;

    const userResponse = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `${token_type} ${access_token}` },
    });

    const user = userResponse.data;

    res.cookie("user", JSON.stringify(user), {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: 86400000,
    });

    console.log("Logged in:", user.username);

    res.redirect("https://wcahockey.com/draft/participate");
  } catch (err) {
    console.error("OAuth callback error:", err.response?.data || err.message);
    res.status(500).send("OAuth failed");
  }
});

// 👤 Return user info
app.get("/api/me", (req, res) => {
  const user = req.cookies.user;
  if (!user) return res.status(401).send("Not logged in");
  res.json(JSON.parse(user));
});

// 🔍 Return user roles
app.get("/api/roles", async (req, res) => {
  console.log("🔍 Incoming cookies:", req.cookies);
  const userCookie = req.cookies.user;
  if (!userCookie) return res.status(401).send("Not logged in");

  const user = JSON.parse(userCookie);

  try {
    const response = await axios.get(
      `https://discord.com/api/guilds/${process.env.DISCORD_SERVER_ID}/members/${user.id}`,
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        },
      }
    );

    const userRoles = response.data.roles;

    const roles = {
      isOwner: userRoles.includes(process.env.ROLE_OWNER),
      isGM: userRoles.includes(process.env.ROLE_GM),
      isAdmin: userRoles.includes(process.env.ROLE_ADMIN),
      isCommissioner: userRoles.includes(process.env.ROLE_COMMISSIONER),
    };

    res.json(roles);
  } catch (err) {
    console.error("❌ Role fetch error:");
    console.error(err.response?.data || err.message);
    res.status(500).send("Failed to fetch user roles");
  }
});

// 🟢 Nominate (calls bot via internal HTTP)
app.post("/api/nominate", requireRole([
  process.env.ROLE_OWNER,
  process.env.ROLE_GM,
  process.env.ROLE_ADMIN,
]), async (req, res) => {
  const user = JSON.parse(req.cookies.user);
  const { player } = req.body;

  try {
    const result = await axios.post("http://localhost:5050/nominate", {
      userId: user.id,
      username: user.username,
      player
    });

    res.json(result.data);
  } catch (err) {
    console.error("❌ Error forwarding to bot:", err.response?.data || err.message);
    res.status(500).send("Failed to forward nomination to bot");
  }
});

// 🟢 Bid (still placeholder)
app.post("/api/bid", requireRole([
  process.env.ROLE_OWNER,
  process.env.ROLE_GM,
  process.env.ROLE_ADMIN,
]), (req, res) => {
  res.send("✅ Bid accepted");
});

// 🔐 Admin Settings - GET
app.get("/api/admin/settings", requireRole([
  process.env.ROLE_ADMIN,
  process.env.ROLE_COMMISSIONER,
]), (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    res.json(settings);
  } catch (err) {
    console.error("Failed to read settings.json:", err.message);
    res.status(500).send("Failed to load settings");
  }
});

// 🔐 Admin Settings - POST
app.post("/api/admin/settings", requireRole([
  process.env.ROLE_ADMIN,
  process.env.ROLE_COMMISSIONER,
]), (req, res) => {
  try {
    const updates = req.body;
    const allowedKeys = [
      "timerDuration",
      "nominationCost",
      "matchBidEnabled",
      "minRosterSize",
      "maxRosterSize"
    ];

    const current = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    for (let key of Object.keys(updates)) {
      if (allowedKeys.includes(key)) {
        current[key] = updates[key];
      }
    }

    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(current, null, 2));
    res.json(current);
  } catch (err) {
    console.error("Failed to update settings.json:", err.message);
    res.status(500).send("Failed to update settings");
  }
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
