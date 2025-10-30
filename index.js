import express from 'express';
import dotenv from 'dotenv';
import pkg from 'pg';

const { Pool } = pkg;
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Create messages table if not exists
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_phone VARCHAR(20) NOT NULL,
        message_text TEXT NOT NULL,
        bot_reply TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Database table ready');
  } catch (error) {
    console.error('❌ Database init error:', error);
  }
}

app.use(express.json());

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
  console.log("📨 Incoming webhook received");
  
  try {
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

    // Validate environment variables
    const requiredEnvVars = ['WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'OPENAI_API_KEY', 'OPENAI_ASSISTANT_ID'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('❌ Missing environment variables:', missingVars);
      return;
    }

    // Save incoming message to database
    await pool.query(
      'INSERT INTO messages (user_phone, message_text) VALUES ($1, $2)',
      [from, text]
    );

    try {
      let reply = "Sorry, I couldn't process your message.";

      // Check if we're using Assistant API or fallback to basic GPT
      if (process.env.OPENAI_ASSISTANT_ID) {
        console.log("🧠 Using OpenAI Assistant API...");
        
        // Create a thread for this user
        const threadResponse = await fetch("https://api.openai.com/v1/threads", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
            "OpenAI-Beta": "assistants=v2"
          }
        });

        if (!threadResponse.ok) {
          throw new Error(`Thread creation failed: ${threadResponse.status}`);
        }

        const threadData = await threadResponse.json();
        const threadId = threadData.id;

        // Add user message to thread
        await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
            "OpenAI-Beta": "assistants=v2"
          },
          body: JSON.stringify({
            role: "user",
            content: text
          })
        });

        // Run the assistant
        const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
            "OpenAI-Beta": "assistants=v2"
          },
          body: JSON.stringify({
            assistant_id: process.env.OPENAI_ASSISTANT_ID
          })
        });

        if (!runResponse.ok) {
          throw new Error(`Run creation failed: ${runResponse.status}`);
        }

        const runData = await runResponse.json();
        const runId = runData.id;

        // Wait for completion with timeout
        let completed = false;
        let attempts = 0;
        const maxAttempts = 30; // 30 second timeout

        while (!completed && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
          
          const runStatus = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
              "OpenAI-Beta": "assistants=v2"
            }
          });
          
          const statusData = await runStatus.json();
          
          if (statusData.status === 'completed') {
            // Get the assistant's response
            const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
              headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "OpenAI-Beta": "assistants=v2"
              }
            });
            
            const messagesData = await messagesResponse.json();
            if (messagesData.data && messagesData.data.length > 0) {
              reply = messagesData.data[0].content[0].text.value;
            }
            completed = true;
          } else if (statusData.status === 'failed') {
            console.error("Assistant run failed:", statusData);
            reply = "Sorry, I encountered an error. Please try again.";
            completed = true;
          } else if (statusData.status === 'expired') {
            console.error("Assistant run expired");
            reply = "Sorry, the request took too long. Please try again.";
            completed = true;
          }
          // Continue waiting for other statuses (queued, in_progress, etc.)
        }

        if (attempts >= maxAttempts) {
          console.error("Assistant timeout after 30 seconds");
          reply = "Sorry, the request timed out. Please try again.";
        }

      } else {
        // Fallback to basic GPT
        console.log("🤖 Using basic GPT fallback...");
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
        reply = gptData.choices?.[0]?.message?.content || "Sorry, I couldn't understand that.";
      }

      console.log("🤖 Assistant says:", reply);

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
        }),
      });

      if (waResponse.ok) {
        console.log("✅ Reply sent to user!");
        // Save bot reply to database
        await pool.query(
          'UPDATE messages SET bot_reply = $1 WHERE user_phone = $2 AND message_text = $3 AND bot_reply IS NULL',
          [reply, from, text]
        );
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

// Initialize database and start server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("🔍 Checking environment variables...");
    console.log("OPENAI_ASSISTANT_ID exists:", !!process.env.OPENAI_ASSISTANT_ID);
    console.log("OPENAI_API_KEY exists:", !!process.env.OPENAI_API_KEY);
    console.log("WHATSAPP_TOKEN exists:", !!process.env.WHATSAPP_TOKEN);
  });
});