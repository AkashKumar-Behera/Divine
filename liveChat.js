import fs from "fs";
import { google } from "googleapis";

const TOKEN_PATH = "./token.json";
const CREDENTIALS_PATH = "./youtube-oauth.json";

let youtube = null;
let liveChatId = null;
let nextPageToken = null;
let pollTimer = null;

function extractVideoId(input) {
  if (!input) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  const match = input.match(/v=([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];

  return null;
}

export async function connectLiveChat(streamUrl) {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_id, client_secret, redirect_uris } = credentials.web;

  const auth = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  auth.setCredentials(token);

  youtube = google.youtube({ version: "v3", auth });

  const videoId = extractVideoId(streamUrl);
  if (!videoId) throw new Error("Invalid Video URL");

  const res = await youtube.videos.list({
    part: "liveStreamingDetails",
    id: videoId
  });

  if (!res.data.items.length) {
    throw new Error("Video not found");
  }

  liveChatId = res.data.items[0].liveStreamingDetails?.activeLiveChatId;

  if (!liveChatId) {
    throw new Error("Live chat not active");
  }

  startPolling();

  return "Live chat connected successfully!";
}

async function startPolling() {
  if (pollTimer) clearInterval(pollTimer);

  pollTimer = setInterval(async () => {
    try {
      const response = await youtube.liveChatMessages.list({
        liveChatId,
        part: "snippet,authorDetails",
        pageToken: nextPageToken
      });

      nextPageToken = response.data.nextPageToken;

      response.data.items.forEach(msg => {
        console.log(
          `${msg.authorDetails.displayName}: ${msg.snippet.displayMessage}`
        );
      });

    } catch (err) {
      console.error("Polling error:", err.message);
    }
  }, 10000); // 10 sec locked
}