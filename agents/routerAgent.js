require('dotenv').config();
const { EmailClient } = require("@azure/communication-email");

const connectionString = process.env.AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING;
const senderAddress = process.env.AZURE_SENDER_EMAIL_ADDRESS;

async function sendEmail(type, confidence, blobUrl, fileName) {
    try {
        const client = new EmailClient(connectionString);

        const imageHeader = "https://cdn-icons-png.flaticon.com/512/337/337946.png"; // example doc icon, replace with your own
        const downloadButton = `<a href="${blobUrl}" style="background: linear-gradient(to right,rgb(120, 226, 240),rgb(238, 98, 144)); color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; margin-top: 20px;">📥 Download Document</a>`;

        let plainText, html;

        if (confidence === undefined) {
            plainText = `This document is routed via manual review.\nFile: ${fileName}\nDownload: ${blobUrl}`;
            html = `
            <div style="font-family: Arial, sans-serif; background: linear-gradient(to right,rgb(123, 211, 223),rgb(231, 127, 162)); padding: 30px;">
                <div style="max-width: 600px; margin: auto; background: white; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); padding: 30px; text-align: center;">
                    <img src="${imageHeader}" alt="Document Review" width="80" style="margin-bottom: 20px;" />
                    <h2 style="color: #e53935;">Manual Review Required</h2>
                    <p style="font-size: 16px; color: #333;"><strong>Document Type:</strong> ${type}</p>
                    <p style="font-size: 16px; color: #333;"><strong>File Name:</strong> ${fileName}</p>
                    ${downloadButton}
                    <p style="margin-top: 30px; font-size: 12px; color: #999;">This is an automated message. Please do not reply.</p>
                </div>
            </div>`;
        } else {
            plainText = `Document Type: ${type}\nConfidence: ${confidence}%\nFile: ${fileName}\nDownload: ${blobUrl}`;
            html = `
            <div style="font-family: Arial, sans-serif; background: linear-gradient(to right,rgb(123, 231, 245),rgb(250, 125, 167)); padding: 30px;">
                <div style="max-width: 600px; margin: auto; background: white; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); padding: 30px; text-align: center;">
                    <img src="${imageHeader}" alt="Document Icon" width="80" style="margin-bottom: 20px;" />
                    <h2 style="color: #2196F3;">Document Processed</h2>
                    <p style="font-size: 16px; color: #333;"><strong>Document Type:</strong> ${type}</p>
                    <p style="font-size: 16px; color: #333;"><strong>Confidence:</strong> ${confidence}%</p>
                    <p style="font-size: 16px; color: #333;"><strong>File Name:</strong> ${fileName}</p>
                    ${downloadButton}
                    <p style="margin-top: 30px; font-size: 12px; color: #999;">This is an automated message. Please do not reply.</p>
                </div>
            </div>`;
        }

        const emailMessage = {
            senderAddress: senderAddress,
            content: {
                subject: `📄 Document Processed: ${fileName}`,
                plainText: plainText,
                html: html
            },
            recipients: {
                to: [
                    { address: "gvarshithavarshi@gmail.com", displayName: "Test Receiver" }
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
