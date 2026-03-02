const fs = require("fs");
const { google } = require("googleapis");
const readline = require("readline");

const oauthData = require("./youtube-oauth.json");
const { client_id, client_secret, redirect_uris } = oauthData.web;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

// Ye scope tu change kar sakta hai
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly"
];

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
});

console.log("Authorize this app by visiting this URL:\n", authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("\nEnter the code from that page here: ", async (code) => {
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    fs.writeFileSync("token.json", JSON.stringify(tokens, null, 2));
    console.log("✅ Token stored to token.json");
    rl.close();
  } catch (err) {
    console.error("❌ Error retrieving access token", err);
  }
});