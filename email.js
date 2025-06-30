const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const { BlobServiceClient } = require('@azure/storage-blob');

const router = express.Router();

// =======================
// 🔐 Google OAuth Config
// =======================
const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const redirect_uris = [process.env.REDIRECT_URI];

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// =======================
// ☁️ Azure Blob Config
// =======================
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
if (!AZURE_STORAGE_CONNECTION_STRING) {
  throw new Error('Azure Storage Connection string not found in environment variables');
}

const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerName = 'tokens'; // Your container name
const containerClient = blobServiceClient.getContainerClient(containerName);

// =======================
// 🔧 Helper Functions
// =======================

// Upload token JSON to Blob Storage
async function writeTokenToBlob(userId, tokenData) {
  const blobName = `token-${userId}.json`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  const data = JSON.stringify(tokenData, null, 2);
  await blockBlobClient.upload(data, Buffer.byteLength(data), {
    blobHTTPHeaders: { blobContentType: "application/json" },
    overwrite: true,
  });
}

// Read token JSON from Blob Storage
async function readTokenFromBlob(userId) {
  const blobName = `token-${userId}.json`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  try {
    const downloadBlockBlobResponse = await blockBlobClient.download(0);
    const downloaded = await streamToString(downloadBlockBlobResponse.readableStreamBody);
    return JSON.parse(downloaded);
  } catch (error) {
    if (error.statusCode === 404) {
      return null; // Not found
    }
    throw error;
  }
}

// Check if token exists in Blob
async function tokenExists(userId) {
  const blobName = `token-${userId}.json`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  return await blockBlobClient.exists();
}

// Convert ReadableStream to string
async function streamToString(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (data) => {
      chunks.push(data.toString());
    });
    readableStream.on('end', () => {
      resolve(chunks.join(''));
    });
    readableStream.on('error', reject);
  });
}

// ===============================
// 🚀 Route: Fetch Gmail Attachments
// ===============================
router.get('/fetch', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: JSON.stringify({ userId }),
  });

  const tokenData = await readTokenFromBlob(userId);

  if (!tokenData || !tokenData.refresh_token) {
    return res.json({ needsAuth: true, authUrl });
  }

  try {
    oAuth2Client.setCredentials(tokenData);

    // Automatically save new tokens (refresh/access)
    oAuth2Client.on('tokens', async (tokens) => {
      if (tokens.refresh_token) tokenData.refresh_token = tokens.refresh_token;
      if (tokens.access_token) tokenData.access_token = tokens.access_token;
      if (tokens.expiry_date) tokenData.expiry_date = tokens.expiry_date;
      await writeTokenToBlob(userId, tokenData);
    });

    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox has:attachment newer_than:1d',
      maxResults: 10,
    });

    const messages = listResponse.data.messages || [];
    if (messages.length === 0) {
      return res.json({ needsAuth: false, attachments: [], message: 'No new attachments found' });
    }

    const attachments = [];

    for (const message of messages) {
      const msg = await gmail.users.messages.get({ userId: 'me', id: message.id });
      const parts = msg.data.payload.parts || [];

      for (const part of parts) {
        if (part.filename && part.body && part.body.attachmentId) {
          const attachment = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: message.id,
            id: part.body.attachmentId,
          });

          const buffer = Buffer.from(attachment.data.data, 'base64');

          attachments.push({
            fileName: part.filename,
            mimeType: part.mimeType || 'application/octet-stream',
            bufferBase64: buffer.toString('base64'),
          });
        }
      }
    }

    return res.json({ needsAuth: false, attachments });
  } catch (err) {
    console.error('Gmail fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch Gmail attachments' });
  }
});

// ==========================
// 🚀 Route: OAuth2 Callback
// ==========================
router.get('/authorized', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;

  if (!code || !state) return res.status(400).send('Missing code or state');

  let userId;
  try {
    userId = JSON.parse(state).userId;
  } catch (e) {
    return res.status(400).send('Invalid state parameter');
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    await writeTokenToBlob(userId, tokens);

    return res.send('<h3>Authorization successful!</h3><p>You can return to the app now.</p>');
  } catch (err) {
    console.error('Token error:', err.message);
    return res.status(500).send('Error getting access token');
  }
});

module.exports = router;
