require("dotenv").config();
const axios = require("axios");
const sql = require("mssql");

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION;
const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

async function askAgent(question, role, userId) {
  try {
   
    if (isGeneralChat(question)) {
      return generateGeneralChatResponse(question);
    }

   
    let userFilterClause = "";
    if (role === "user" && userId) {
      userFilterClause = ` AND UserId = '${userId}'`;
    }

    const prompt = `
You are an AI agent for querying a "Documents" table with this schema:
DocumentId (uniqueidentifier), UserId (uniqueidentifier), FileName (nvarchar), BlobUrl (nvarchar),
UploadDate (datetime), Source (nvarchar), Status (nvarchar), Type (nvarchar), Confidence (float),
IngestedAt (datetime), ExtractedAt (datetime), ClassifiedAt (datetime), RoutedAt (datetime),
AgentTime (float), OcrTimeSeconds (float), ErrorMessage (nvarchar), LastUpdated (datetime).

User role: ${role}.
${role === "user" ? "You must **add this filter** to every SELECT query: WHERE UserId = '${userId}'" : "You are an admin. You can access all records in the Documents table. Do NOT add UserId filters."}

Generate a safe T-SQL SELECT query (no INSERT/UPDATE/DELETE) to answer:
"""${question}"""

Append this condition to WHERE clause if needed to restrict to user:
${userFilterClause}

Return ONLY the SQL query.`;
    const sqlQuery = await generateSQLFromPrompt(prompt);
    let rawQuery = sqlQuery.trim();
    rawQuery = rawQuery.replace(/```sql/gi, '')  .replace(/```/g, '').trim();            

    console.log("Final SQL to execute:\n", rawQuery);
    console.log(sqlQuery);
//     if (!/^\s*SELECT/i.test(sqlQuery)) {
//   return "Sorry, I can only process read-only SELECT queries.";
// }



    

    await sql.connect(dbConfig);
    const result = await sql.query(rawQuery);

    
    const summary = await generateSummaryFromResults(question, sqlQuery, result.recordset);

    return summary;
  } catch (err) {
    console.error("Error in askAgent:", err);
    return "Sorry, I encountered an error processing your request.";
  } finally {
    await sql.close();
  }
}


async function generateSQLFromPrompt(prompt) {
  const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;
  const response = await axios.post(
    url,
    {
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 300,
      top_p: 1,
      frequency_penalty: 0,
    },
    {
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
    }
  );
  return response.data.choices[0].message.content.trim();
}


function isGeneralChat(text) {
  const greetings = ["hello", "hi", "how are you", "good morning", "good afternoon", "thanks", "thank you"];
  const low = text.toLowerCase();
  return greetings.some((g) => low.includes(g));
}


function generateGeneralChatResponse(question) {
  const low = question.toLowerCase();
  if (low.includes("hello") || low.includes("hi")) {
    return "Hello! I’m your document AI assistant. You can ask me questions about your document records.";
  }
  if (low.includes("how are you")) {
    return "I'm doing great, thanks for asking! How can I help you with your documents today?";
  }
  if (low.includes("thanks") || low.includes("thank you")) {
    return "You're welcome! Feel free to ask anything about your documents.";
  }
  return "I'm here to help with your document system. Ask me anything!";
}

async function generateSummaryFromResults(question, sqlQuery, rows) {
  const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;

  const rowsSample = rows.slice(0, 5); // sample for prompt brevity

  const prompt = `
You are an AI assistant that answers user questions based on SQL query results.

User question: """${question}"""

SQL query executed: """${sqlQuery}"""

SQL result sample (max 5 rows): """${JSON.stringify(rowsSample)}"""

Provide a concise, human-readable answer summarizing the results.
If no rows were returned, say so clearly.
Do not return the raw JSON data.
If the question is unrelated, unclear, a greeting, or a typo (like 'thanjs', 'tq', 'thx', etc), respond only with:
"I'm an AI assistant for querying the Documents table. Please ask a relevant question."
`;

  const response = await axios.post(
    url,
    {
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 250,
      top_p: 1,
      frequency_penalty: 0,
    },
    {
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
    }
  );

  return response.data.choices[0].message.content.trim();
}

module.exports = { askAgent };
