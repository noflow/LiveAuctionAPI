// NOTE: run `npm install http-proxy-middleware` if not already installed
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware"); // ✅ Moved here
require("dotenv").config();

const app = express();
app.use(cors({ origin: "https://wcahockey.com", credentials: true }));
app.use(cookieParser());
app.use(express.json());

const SETTINGS_PATH = path.join(__dirname, "data", "settings.json");

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

app.get("/", (req, res) => res.send("Live Auction API running!"));

app.get("/auth/discord", (req, res) => {
  const redirect_uri = encodeURIComponent(process.env.DISCORD_REDIRECT_URI);
  const client_id = process.env.DISCORD_CLIENT_ID;
  const scope = encodeURIComponent("identify guilds guilds.members.read");
  const url = `https://discord.com/api/oauth2/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code&scope=${scope}`;
  res.redirect(url);
});

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

app.get("/api/me", (req, res) => {
  const user = req.cookies.user;
  if (!user) return res.status(401).send("Not logged in");
  res.json(JSON.parse(user));
});

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

app.post("/api/nominate", requireRole([
  process.env.ROLE_OWNER,
  process.env.ROLE_GM,
  process.env.ROLE_ADMIN,
]), async (req, res) => {
  const user = JSON.parse(req.cookies.user);
  const { player } = req.body;

  try {
    const result = await axios.post("https://bot.wcahockey.com/nominate", {
      userId: user.id,
      username: user.username,
      player
    });

    const io = req.app.get("io");
    io.emit("player:nominated", { player, team: user.username, amount: 1 });
    res.json(result.data);
  } catch (err) {
    console.error("❌ Error forwarding to bot:", err.response?.data || err.message);
    res.status(500).send("Failed to forward nomination to bot");
  }
});

app.post("/api/bid", requireRole([
  process.env.ROLE_OWNER,
  process.env.ROLE_GM,
  process.env.ROLE_ADMIN,
]), (req, res) => {
  res.send("✅ Bid accepted");
});

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

app.post("/api/admin/settings", requireRole([
  process.env.ROLE_ADMIN,
  process.env.ROLE_COMMISSIONER,
]), (req, res) => {
  try {
    const updates = req.body;
    const allowedKeys = {
      timerDuration: { type: "number", min: 5, max: 120 },
      resetClock: { type: "number", min: 5, max: 60 },
      nominationCost: { type: "number", min: 1 },
      matchBidEnabled: { type: "boolean" },
      minRosterSize: { type: "number", min: 1 },
      maxRosterSize: { type: "number", min: 1 },
      minimumBidIncrement: { type: "number", min: 1 }
    };

    const current = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));

    for (const [key, val] of Object.entries(updates)) {
      const rules = allowedKeys[key];
      if (!rules) continue;

      const validType = (rules.type === typeof val);
      const validRange = typeof val === "number"
        ? (val >= (rules.min || 0) && (!rules.max || val <= rules.max))
        : true;

      if (validType && validRange) {
        console.log(`✅ [settings] ${key} updated to: ${val}`);
        current[key] = val;
      } else {
        console.warn(`⚠️ Invalid setting ignored: ${key}=${val}`);
      }
    }

    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(current, null, 2));
    res.json(current);
  } catch (err) {
    console.error("Failed to update settings.json:", err.message);
    res.status(500).send("Failed to update settings");
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://wcahockey.com",
    credentials: true,
  }
});
app.set("io", io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server + WebSocket running on port ${PORT}`);
});

app.post("/api/admin/force-nominate", requireRole([process.env.ROLE_ADMIN]), async (req, res) => {
  const { player } = req.body;
  const user = JSON.parse(req.cookies.user);
  try {
    const result = await axios.post("https://bot.wcahockey.com/force-nominate", {
      userId: user.id,
      username: user.username,
      player
    });
    const io = req.app.get("io");
    io.emit("player:nominated", { player, team: user.username, amount: 1 });
    res.json(result.data);
  } catch (err) {
    console.error("Force nominate error:", err.response?.data || err.message);
    res.status(500).send("Failed to force nominate");
  }
});

app.post("/api/admin/skip-nominator", requireRole([process.env.ROLE_ADMIN]), async (req, res) => {
  try {
    const result = await axios.post("https://bot.wcahockey.com/skip-nominator");
    const io = req.app.get("io");
    const user = JSON.parse(req.cookies.user);
    io.emit("player:nominated", { player, team: user.username, amount: 1 });
    res.json(result.data);
  } catch (err) {
    console.error("Skip nominator error:", err.response?.data || err.message);
    res.status(500).send("Failed to skip nominator");
  }
});

app.post("/api/admin/toggle-pause", requireRole([process.env.ROLE_ADMIN]), async (req, res) => {
  try {
    const result = await axios.post("https://bot.wcahockey.com/toggle-pause");
    const io = req.app.get("io");
    const user = JSON.parse(req.cookies.user);
    io.emit("player:nominated", { player, team: user.username, amount: 1 });
    res.json(result.data);
  } catch (err) {
    console.error("Pause toggle error:", err.response?.data || err.message);
    res.status(500).send("Failed to toggle pause");
  }
});

// 🔁 Proxy Discord auth requests to Flask bot
app.use("/auth", createProxyMiddleware({
  target: "https://bot.wcahockey.com",
  changeOrigin: true
}));

// 🔁 Proxy to Flask bot for all /api/* routes (fallback)
app.use("/api", createProxyMiddleware({
  target: "https://bot.wcahockey.com",
  changeOrigin: true,
  pathRewrite: { "^/api": "" }
}));

// in server.js
app.use("/api", createProxyMiddleware({
  target: "http://localhost:5050",  // use port 5050!
  changeOrigin: true,
  pathRewrite: { "^/api": "" }
}));
