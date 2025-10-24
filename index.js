import fetch from "node-fetch";
import dotenv from "dotenv";
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
