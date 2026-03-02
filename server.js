// ===============================
// 🔥 AKASH FULL REDEEM SYSTEM
// ===============================

const express = require("express");
const { chromium } = require("playwright");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = 4004;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ===============================
// 📁 FILE HELPERS
// ===============================

function ensureFile(file, defaultData = "[]") {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, defaultData);
  }
}

function readJSON(file) {
  ensureFile(file);
  return JSON.parse(fs.readFileSync(file));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ===============================
// 🌐 PLAYWRIGHT SECTION
// ===============================

let context;
let page;

async function startBrowser() {
  context = await chromium.launchPersistentContext("./user-data", {
    headless: true,
    viewport: null
  });

  page = context.pages().length
    ? context.pages()[0]
    : await context.newPage();

  console.log("🚀 Browser Ready");
}

// ===============================
// 📺 YOUTUBE SECTION
// ===============================

let youtube = null;
let liveChatId = null;
let nextPageToken = null;
let pollTimer = null;

function extractVideoId(input) {
  if (!input) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  let match = input.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];

  match = input.match(/\/live\/([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];

  match = input.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];

  return null;
}

async function connectYouTubeChat(streamUrl) {
  const credentials = JSON.parse(
    fs.readFileSync("./youtube-oauth.json")
  );

  const { client_id, client_secret, redirect_uris } =
    credentials.web;

  const auth = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  const token = JSON.parse(fs.readFileSync("./token.json"));
  auth.setCredentials(token);

  youtube = google.youtube({ version: "v3", auth });

  const videoId = extractVideoId(streamUrl);
  if (!videoId) throw new Error("Invalid Video URL");

  const res = await youtube.videos.list({
    part: "liveStreamingDetails",
    id: videoId
  });

  if (!res.data.items.length)
    throw new Error("Video not found");

  liveChatId =
    res.data.items[0].liveStreamingDetails?.activeLiveChatId;

  if (!liveChatId)
    throw new Error("Live chat not active");

  startPolling();

  return "Live chat connected successfully!";
}

function disconnectYouTubeChat() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  youtube = null;
  liveChatId = null;
  nextPageToken = null;

  console.log("❌ Live chat disconnected");

  return "Live chat disconnected successfully!";
}

// ===============================
// 🤖 NIGHTBOT SECTION
// ===============================

const nightbotToken = JSON.parse(
  fs.readFileSync("./nightbot_token.json")
);

async function sendNightbotMessage(message) {
  try {
    await axios.post(
      "https://api.nightbot.tv/1/channel/send",
      { message },
      {
        headers: {
          Authorization: `Bearer ${nightbotToken.access_token}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log("📢 Nightbot Sent:", message);
  } catch (err) {
    console.error("Nightbot Error:", err.response?.data || err.message);
  }
}

// ===============================
// 🎁 REDEEM SYSTEM
// ===============================

let redeemSessions = {};
let isProcessingRedeem = false;

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const user in redeemSessions) {
    if (now - redeemSessions[user].timestamp > 5 * 60 * 1000) {
      console.log("⏰ Session expired:", user);
      delete redeemSessions[user];
    }
  }
}

async function handleChatMessage(author, message) {
  const lower = message.toLowerCase();

  // 🔵 Streamlabs Redeem Detection
  if (
    author.toLowerCase().includes("streamlabs") &&
    lower.includes("redeemed")
  ) {
    let rawUser = message.split(" ")[0];

    // Remove extra @ and commas
    const username = rawUser.replace(/^@+/, "@").replace(/[,]/g, "");

    redeemSessions[username] = {
      stage: "WAITING_FOR_ID",
      timestamp: Date.now()
    };

    await sendNightbotMessage(
      `@${username} Please send your GameID and ZoneID like: !uid 123456789 (1234)`
    );

    console.log("🎁 Redeem Session Created:", username);
    return;
  }

  // 🟢 Waiting for ID
  if (
    redeemSessions[author] &&
    redeemSessions[author].stage === "WAITING_FOR_ID"
  ) {
    const cleaned = message.trim();

    // Accept: !id 123456789 (1234)
    const match = cleaned.match(/^!uid\s+(\d+)\s+\(?(\d+)\)?$/i);

    if (!match) return;

    redeemSessions[author].gameId = match[1];
    redeemSessions[author].zoneId = match[2];
    redeemSessions[author].stage = "VERIFYING";

    console.log("🔎 Verifying ID:", author);

    try {
      const response = await axios.get(
        `http://localhost:${PORT}/fill`,
        {
          params: {
            uid: match[1],
            zone: match[2]
          }
        }
      );

      if (!response.data.success) {
        await sendNightbotMessage(
          `@${author} ❌ Invalid ID. Try again using: !id 123456789 (1234)`
        );
        redeemSessions[author].stage = "WAITING_FOR_ID";
        return;
      }

      redeemSessions[author].username =
        response.data.username;
      redeemSessions[author].stage = "WAITING_CONFIRM";

      await sendNightbotMessage(
        `@${author} Is this your account: ${response.data.username} ? Type YES to confirm.`
      );

    } catch (err) {
      console.error("Fill Error:", err.message);
    }

    return;
  }

  // 🟣 Waiting Confirm
  if (
    redeemSessions[author] &&
    redeemSessions[author].stage === "WAITING_CONFIRM" &&
    lower === "yes"
  ) {
    if (isProcessingRedeem) return;
  
    isProcessingRedeem = true;
  
    // ❌ BUY REMOVE KIYA
    await sendNightbotMessage(
      `@${author} 🎉 Diamonds successfully delivered!`
    );
  
    console.log("✅ Mock Delivery Sent (No Purchase)");
  
    delete redeemSessions[author];
  
    isProcessingRedeem = false;
  }

  // 🔴 If user says NO
  if (
    redeemSessions[author] &&
    redeemSessions[author].stage === "WAITING_CONFIRM" &&
    lower === "no"
  ) {
    await sendNightbotMessage(
      `@${author} ❌ Verification cancelled. Please send your GameID and ZoneID again like: 123456789 (1234)`
    );

    // Reset stage back to ID input
    redeemSessions[author].stage = "WAITING_FOR_ID";
    redeemSessions[author].timestamp = Date.now();

    return;
  }
}

// ===============================
// 🔄 POLLING
// ===============================

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);

  pollTimer = setInterval(async () => {
    cleanupExpiredSessions();

    try {
      const response = await youtube.liveChatMessages.list({
        liveChatId,
        part: "snippet,authorDetails,id",
        pageToken: nextPageToken
      });

      nextPageToken = response.data.nextPageToken;

      response.data.items.forEach(async msg => {
        const author =
          msg.authorDetails.displayName;
        const message =
          msg.snippet.displayMessage;

        console.log(`💬 ${author}: ${message}`);

        await handleChatMessage(author, message);
      });

    } catch (err) {
      console.error("Polling Error:", err.message);
    }
  }, 10000); // 10 sec locked
}

// ===============================
// 🛒 PRODUCT ROUTES (UNCHANGED)
// ===============================

app.get("/fill", async (req, res) => {
  try {
    const { uid, zone } = req.query;

    await page.goto(
      "https://deeragames.in/product/MOBILE%20LEGENDS%20SMALL%20PACKS",
      { waitUntil: "domcontentloaded" }
    );

    await page.waitForSelector("input.player-tag");

    const inputs = page.locator("input.player-tag");

    await inputs.nth(0).fill(uid);
    await inputs.nth(1).fill(zone);

    await page.click("text=Verify Username");

    await page.waitForSelector(".playername p.mb-0");

    const rawText = await page.textContent(
      ".playername p.mb-0"
    );

    const username = rawText
      .replace(/Username:\s*/i, "")
      .trim();

    res.json({
      success: true,
      username
    });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/buy", async (req, res) => {
  try {
    await page.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight)
    );

    const buyBtn = page.getByRole("button", {
      name: "BUY NOW"
    });

    await buyBtn.click();

    const confirmBtn = page.getByRole("button", {
      name: "Confirm Payment"
    });

    await confirmBtn.waitFor();
    await confirmBtn.click();

    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ===============================
// 🌐 CONNECT CHAT ROUTE
// ===============================

app.post("/connect-chat", async (req, res) => {
  try {
    const { url } = req.body;
    const message =
      await connectYouTubeChat(url);

    res.json({ success: true, message });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/disconnect-chat", (req, res) => {
  try {
    const message = disconnectYouTubeChat();
    res.json({ success: true, message });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ===============================
// 🚀 START SERVER
// ===============================

app.listen(PORT, async () => {
  console.log(
    `🔥 Server running at http://localhost:${PORT}`
  );
  await startBrowser();
});