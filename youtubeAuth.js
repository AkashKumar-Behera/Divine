import express from "express";
import fs from "fs";
import { google } from "googleapis";
import open from "open";

const PORT = 4004;
const TOKEN_PATH = "./token.json";
const CREDENTIALS_PATH = "./youtube-oauth.json";

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const { client_id, client_secret, redirect_uris } = credentials.web;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

const app = express();

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly"
];

app.get("/", (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent"
  });

  res.send(`
    <h2>YouTube Auth</h2>
    <a href="${authUrl}">Login with Google</a>
  `);
});

app.get("/youtube/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.send("No code received.");
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

    res.send("✅ Token saved successfully! You can close this tab.");
    console.log("✅ token.json saved successfully");
    process.exit(0);

  } catch (err) {
    console.error(err);
    res.send("Error generating token.");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Auth server running at http://localhost:${PORT}`);
  open(`http://localhost:${PORT}`);
});