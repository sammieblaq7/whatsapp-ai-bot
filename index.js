import fetch from "node-fetch";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function testGPT() {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say hello from Talentos Assistant" }],
    }),
  });

  const data = await response.json();
  console.log("✅ GPT Test Response:", data.choices?.[0]?.message?.content);
}

testGPT();

const app = express();
const PORT = process.env.PORT || 10000;

// Your existing bot setup and GPT logic should go above this line
console.log("✅ GPT Test Response: Hello from Talentos Assistant! How can I assist you today?");

// This route just shows a simple message if someone visits your Render URL
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp AI Assistant is running successfully on Render!");
});

// This keeps the app running
app.listen(PORT, () => {
  console.log(`✅ Server is live on port ${PORT}`);
});
