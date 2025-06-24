
require('dotenv').config();
const axios = require('axios');
const { QueueServiceClient } = require("@azure/storage-queue");
const { extractTextFromBlob } = require('../agents/OcrAgent');


const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const ocrQueueName = 'ocr-queue';
const backendBaseUrl = process.env.BACKEND_BASE_URL;

const queueServiceClient = QueueServiceClient.fromConnectionString(connectionString);
const ocrQueueClient = queueServiceClient.getQueueClient(ocrQueueName);
const classifyQueueClient= queueServiceClient.getQueueClient('classify-queue');

async function listenToOcrQueue() {
  await ocrQueueClient.createIfNotExists();
  while (true) {
    const { receivedMessageItems } = await ocrQueueClient.receiveMessages({ numberOfMessages: 1, visibilityTimeout: 60 });

    if (receivedMessageItems.length === 0) {
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    for (const message of receivedMessageItems) {
      const decoded = JSON.parse(Buffer.from(message.messageText, 'base64').toString());
      const { documentId, blobUrl } = decoded;
      try {
        const { extractedText, ocrTimeSeconds } = await extractTextFromBlob(blobUrl);

        //updating the database with the status
        await axios.put(`${backendBaseUrl}/api/documents/${documentId}/extracted`,{ocrTimeSeconds, extractedText});

        //send to classify queue
        await classifyQueueClient.createIfNotExists();
        const message1 = Buffer.from(JSON.stringify({ documentId,extractedText})).toString('base64');
        await classifyQueueClient.sendMessage(message1);


        await ocrQueueClient.deleteMessage(message.messageId, message.popReceipt);
      } catch (err) {
        console.log("in the queue client");
        console.error(`Error on document ${documentId}:`, err.message);
        await axios.put(`${backendBaseUrl}/api/documents/${documentId}/error`, {
            errorMessage: err.message || 'Unknown error'});
       
        await ocrQueueClient.deleteMessage(message.messageId, message.popReceipt);
      }
    }
  }
}

listenToOcrQueue().catch(console.error);
