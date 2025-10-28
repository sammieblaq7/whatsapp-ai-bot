import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Root route for health checks
app.get("/", (req, res) => {
  res.send("WhatsApp AI Bot is running!");
});

// Webhook verification
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

// Handle incoming messages
app.post("/webhook", express.json(), async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (message && message.text) {
      const from = message.from;
      const text = message.text.body;
      console.log("💬 Received message from user:", text);

      // TEMPORARY: Static reply for testing
      const reply = "Test reply - bot is working!";
      console.log("🤖 Static reply:", reply);

      // Send reply via WhatsApp
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
          context: {
            message_id: message.id
          }
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