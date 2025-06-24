require("dotenv").config();
const axios = require("axios");
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION;
const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

const chat_with_gpt = async (extractedText) => {
  try {
    const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;
    const prompt = `
      You are an AI document classification assistant.
      Classify the following extracted text into one of the following types:
      ["Invoice", "Resume", "Contract", "Application Form", "PaySlip","Medical Report", "GovernmentID", "Other"]
      Also give a confidence score between **50% and 100%**.
      also give me the time to classify this text in seconds.
      Return ONLY in the following pipe-delimited format:
      type|confidence|agentTime
      Example:
      Invoice|95|1.2
      Do not return anything else.
      Extracted Text
      """
      ${extractedText}
      """`;

    const response = await axios.post(
      url,
      {
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 256,
        top_p: 0.6,
        frequency_penalty: 0.7
      },
      {
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (err) {
    return `Error: ${err.response?.data?.error?.message || err.message}`;
  }
};


module.exports ={
  chat_with_gpt
}