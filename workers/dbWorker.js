// dbagentworker.js
const express = require("express");
const router = express.Router();

const { askAgent } = require("../agents/dbAgent"); 

router.post("/ask", async (req, res) => {
  const { question, role, userId } = req.body;

  if (!question) {
    return res.status(400).json({ error: "Question is required" });
  }

  try {
    const answer = await askAgent(question, role, userId);
    res.json({ answer });
  } catch (error) {
    console.error("Error in /ask route:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

module.exports = router;
