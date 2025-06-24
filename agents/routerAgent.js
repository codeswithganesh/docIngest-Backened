require('dotenv').config();
const { EmailClient } = require("@azure/communication-email");

const connectionString = process.env.AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING;
const senderAddress = process.env.AZURE_SENDER_EMAIL_ADDRESS;

async function sendEmail(type, confidence, blobUrl, fileName) {
    try {
        const client = new EmailClient(connectionString);
        let plainText,html;
        if(confidence ===undefined)
        {

            plainText = `This document is routed via  manual review.\nFile: ${fileName}\nDownload: ${blobUrl}`;
            html = `
                <p><strong>This Document is Routed Via Manual Review</strong></p>
                <p><strong>File:</strong> ${fileName}</p>
                <p><strong>Document Type</strong> ${type}</p>
                <p><a href="${blobUrl}" download>Download Document</a></p>
            `;
        }
        else
        {
            plainText = `Document Type: ${type}\nConfidence: ${confidence}%\nFile: ${fileName}\nDownload: ${blobUrl}`;
        html = `
            <p><strong>Document Type:</strong> ${type}</p>
            <p><strong>Confidence:</strong> ${confidence}%</p>
            <p><strong>File:</strong> ${fileName}</p>
            <p><a href="${blobUrl}" download>Download Document</a></p>
        `;

        }
        

        const emailMessage = {
            senderAddress: senderAddress,
            content: {
                subject: `Document Processed: ${fileName}`,
                plainText: plainText,
                html: html
            },
            recipients: {
                to: [
                    { address: "sunilganeshreddy@gmail.com", displayName: "Test Receiver" }
                ]
            }
        };

        const poller = await client.beginSend(emailMessage);
        const result = await poller.pollUntilDone();
        return result.status;
    } catch (err) {
        console.error("❌ Error sending email:", err);
        return "failed";
    }
}

module.exports = {
    sendEmail
};
