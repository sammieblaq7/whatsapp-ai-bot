import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("WhatsApp AI Bot is running!");
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    console.log("❌ Webhook verification failed");
    res.sendStatus(403);
  }
});

app.post("/webhook", express.json(), async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (message && message.text) {
      const from = message.from;
      const text = message.text.body;
      console.log("💬 Received message from user:", text);

      // DEBUG: Check token format
      const token = process.env.WHATSAPP_TOKEN;
      console.log("🔑 Token length:", token.length);
      console.log("🔑 Token first 20 chars:", token.substring(0, 20));
      console.log("🔑 Token last 20 chars:", token.substring(token.length - 20));
      
      // Test if token has invisible characters
      const cleanToken = token.replace(/[^\x20-\x7E]/g, '');
      if (cleanToken.length !== token.length) {
        console.log("🚨 Token has invisible characters! Cleaned length:", cleanToken.length);
      }

      // Send to OpenAI
      const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are Talentos AI Assistant, a friendly helpful bot." },
            { role: "user", content: text }
          ],
        }),
      });

      const gptData = await gptResponse.json();
      const reply = gptData.choices?.[0]?.message?.content || "Sorry, I couldn't understand that.";
      console.log("🤖 GPT says:", reply);

      // Send reply via WhatsApp - try both original and cleaned token
      const WA_URL = `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`;
      
      const waResponse = await fetch(WA_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: reply },
        }),
      });

      if (waResponse.ok) {
        console.log("✅ Reply sent to user!");
      } else {
        const errorData = await waResponse.text();
        console.error("❌ WhatsApp API error:", errorData);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error in webhook:", error);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});