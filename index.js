app.post("/webhook", express.json(), async (req, res) => {
  try {
    // ✅ Step 1: Confirm it's a real message
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (message && message.text) {
      const from = message.from; // WhatsApp user number
      const text = message.text.body; // Message text
      console.log("💬 Received message from user:", text);

      // ✅ Step 2: Send user message to GPT
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

      // ✅ Step 3: Send GPT reply back via WhatsApp API
      const WA_URL = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

      const waResponse = await fetch(WA_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: reply },
          context: {
            message_id: message.id // Add context to reply to the same message
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