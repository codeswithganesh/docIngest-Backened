
require('dotenv').config();
const axios = require('axios');
const { QueueServiceClient } = require("@azure/storage-queue");
const { chat_with_gpt } = require('../agents/classifyAgent');


const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const classifyQueueName = 'classify-queue';
const backendBaseUrl = process.env.BACKEND_BASE_URL;

const queueServiceClient = QueueServiceClient.fromConnectionString(connectionString);
const classifyQueueClient = queueServiceClient.getQueueClient(classifyQueueName);
const routerQueueClient= queueServiceClient.getQueueClient('router-queue');

async function listenToClassifyQueue() {
  await classifyQueueClient.createIfNotExists();
  while (true) {
    const { receivedMessageItems } = await classifyQueueClient.receiveMessages({ numberOfMessages: 1, visibilityTimeout: 60 });

    if (receivedMessageItems.length === 0) {
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    for (const message of receivedMessageItems) {
      const decoded = JSON.parse(Buffer.from(message.messageText, 'base64').toString());
      const { documentId, extractedText } = decoded;
      try {
        const resultString = await chat_with_gpt(extractedText);
        const parts = resultString.trim().split("|");
        if (parts.length !== 3) {
          throw new Error("Invalid response format");}
        const [type, confidenceStr, agentTimeStr] = parts;
        const confidence = parseInt(confidenceStr);
        const agentTime = parseFloat(agentTimeStr);

        //update the data to the database
        await axios.put(`${backendBaseUrl}/api/documents/${documentId}/classified`,{type, confidence, agentTime});

        //call the get call to get the name 
        const response = await axios.get(`${backendBaseUrl}/api/documents/${documentId}/bloburl`);
        const { blobUrl, fileName } = response.data;

        if (confidence < 85) {
          await axios.put(`${backendBaseUrl}/api/documents/${documentId}/error`, {
            errorMessage: "Confidence is less than 85%. Requires manual review.",
          });
          console.warn(`Document ${documentId} requires manual review.`);
          await classifyQueueClient.deleteMessage(message.messageId, message.popReceipt);
          continue; 
        }


        //post message to the Router queue
        await routerQueueClient.createIfNotExists();
        const message1 = Buffer.from(JSON.stringify({ type,confidence,blobUrl,fileName,documentId})).toString('base64');
        await routerQueueClient.sendMessage(message1);


        await classifyQueueClient.deleteMessage(message.messageId, message.popReceipt);
      } catch (err) {
        console.error(`Error on document ${documentId}:`, err.message);
        await axios.put(`${backendBaseUrl}/api/documents/${documentId}/error`, {
                    errorMessage: err.message || 'Unknown error'});
        await classifyQueueClient.deleteMessage(message.messageId, message.popReceipt);
      }
    }
  }
}

listenToClassifyQueue().catch(console.error);
