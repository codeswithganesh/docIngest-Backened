
const { DocumentAnalysisClient, AzureKeyCredential } = require("@azure/ai-form-recognizer");

const endpoint = process.env.FORM_RECOGNIZER_ENDPOINT;
const apiKey = process.env.FORM_RECOGNIZER_API_KEY;



async function extractTextFromBlob(blobUrl) {
    try{
    const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));
    const startTime = Date.now();

  const poller = await client.beginAnalyzeDocumentFromUrl("prebuilt-document", blobUrl);
  const result = await poller.pollUntilDone();

  const text = result.paragraphs
    ? result.paragraphs.map(p => p.content).join('\n')
    : result.pages.flatMap(p => p.lines.map(l => l.content)).join('\n');

  const duration = (Date.now() - startTime) / 1000;

  return {
    extractedText: text,
    ocrTimeSeconds: duration
  };

    }
    catch (error) {
        console.error("Error initializing DocumentAnalysisClient:", error);
    }
 
}

module.exports = {
  extractTextFromBlob
};
