
require('dotenv').config();
const axios = require('axios');
const { QueueServiceClient } = require("@azure/storage-queue");
const { sendEmail } = require('../agents/routerAgent');


const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const routerQueueName = 'router-queue';
const backendBaseUrl = process.env.BACKEND_BASE_URL;

const queueServiceClient = QueueServiceClient.fromConnectionString(connectionString);
const routerQueueClient = queueServiceClient.getQueueClient(routerQueueName);

async function listenToRouterQueue() {
  await routerQueueClient.createIfNotExists();
  while (true) {
    const { receivedMessageItems } = await routerQueueClient.receiveMessages({ numberOfMessages: 1, visibilityTimeout: 60 });

    if (receivedMessageItems.length === 0) {
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    for (const message of receivedMessageItems) {
      const decoded = JSON.parse(Buffer.from(message.messageText, 'base64').toString());
      const { type, confidence,blobUrl,fileName,documentId } = decoded;
      try {
        const resultString = await sendEmail(type,confidence,blobUrl,fileName);
        if (resultString !== "Succeeded") {
          throw new Error("Email sending failed");
        }
        //update the data to the database
        await axios.put(`${backendBaseUrl}/api/documents/${documentId}/routed`);

        await routerQueueClient.deleteMessage(message.messageId, message.popReceipt);
      } 
      catch (err) {
        console.error(`Error on document ${documentId}:`, err.message);
        await axios.put(`${backendBaseUrl}/api/documents/${documentId}/error`, {
                    errorMessage: err.message || 'Unknown error'});
        await routerQueueClient.deleteMessage(message.messageId, message.popReceipt);
      }
    }
  }
}

listenToRouterQueue().catch(console.error);
