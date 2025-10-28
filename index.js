import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to log all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.get("/", (req, res) => {
  res.send("WhatsApp AI Bot is running!");
});

app.get("/webhook", (req, res) => {
  console.log("🔍 Webhook verification attempt");
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
  console.log("📨 Incoming webhook received");
  
  try {
    // Always respond to Meta first to prevent retries
    res.sendStatus(200);
    
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message || !message.text) {
      console.log("ℹ️ No text message found in webhook");
      return;
    }

    const from = message.from;
    const text = message.text.body;
    console.log("💬 Received message from user:", text);

    // Validate all required environment variables
    const requiredEnvVars = ['WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'OPENAI_API_KEY'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('❌ Missing environment variables:', missingVars);
      return;
    }

    console.log("🔑 Token length:", process.env.WHATSAPP_TOKEN.length);
    console.log("📱 Phone Number ID:", process.env.PHONE_NUMBER_ID);

    try {
      // Send to OpenAI
      console.log("🧠 Sending to GPT...");
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

      if (!gptResponse.ok) {
        throw new Error(`GPT API error: ${gptResponse.status}`);
      }

      const gptData = await gptResponse.json();
      const reply = gptData.choices?.[0]?.message?.content || "Sorry, I couldn't understand that.";
      console.log("🤖 GPT says:", reply);

      // Send reply via WhatsApp
      console.log("📤 Sending to WhatsApp...");
      const WA_URL = `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`;
      
      const waResponse = await fetch(WA_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
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

    } catch (error) {
      console.error("❌ Processing error:", error);
    }

  } catch (error) {
    console.error("❌ Webhook error:", error);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("🔍 Checking environment variables...");
  console.log("WHATSAPP_TOKEN exists:", !!process.env.WHATSAPP_TOKEN);
  console.log("PHONE_NUMBER_ID exists:", !!process.env.PHONE_NUMBER_ID);
  console.log("OPENAI_API_KEY exists:", !!process.env.OPENAI_API_KEY);
});