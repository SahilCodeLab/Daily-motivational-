import express from "express";
import fetch from "node-fetch";
import cron from "node-cron";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// ----------------- ENV Variables -----------------
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ----------------- AI Message Generator -----------------
async function generateAIMessage(category) {
  const prompts = {
    WAKE_UP: `Generate a strong wake-up motivation in Romanized Hindi. Mention waking up at 5 AM for success, avoiding laziness, taking first step towards goals. Make it powerful and motivational. Max 20 words.`,
    
    STUDY: `Create study motivation in Romanized Hindi. Mention importance of education for future success, avoiding distractions, focusing on career goals. Make it inspiring. Max 18 words.`,
    
    FOCUS: `Generate focus reminder in Romanized Hindi. Mention avoiding girls/distractions, concentrating on career and studies, long-term success. Make it direct and motivational. Max 15 words.`,
    
    HEALTH: `Create health reminder in Romanized Hindi. Mention drinking water, exercise, healthy food for mental and physical strength. Make it energetic. Max 15 words.`,
    
    PRODUCTIVITY: `Generate productivity push in Romanized Hindi. Mention time management, avoiding social media, working hard for success. Make it motivational. Max 18 words.`,
    
    SLEEP: `Create sleep discipline message in Romanized Hindi. Mention early sleep for next day productivity, importance of rest. Make it calming yet motivational. Max 15 words.`
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompts[category] }] }],
        }),
      }
    );

    const data = await response.json();
    let message = data?.candidates?.[0]?.content?.parts?.[0]?.text || getFallbackMessage(category);
    message = message.trim().split('\n')[0];
    
    return message;
  } catch (error) {
    console.error("Gemini Error:", error.message);
    return getFallbackMessage(category);
  }
}

function getFallbackMessage(category) {
  const fallbacks = {
    WAKE_UP: "🌅 5 baje utho! Success ki pehli step! 💪",
    STUDY: "📚 Padhai karo, future bright banao! 🎓",
    FOCUS: "🎯 Career par focus, distractions avoid! 🚀",
    HEALTH: "💧 Pani piyo, healthy raho! 🏃‍♂️",
    PRODUCTIVITY: "⏰ Time manage karo, success pakki! 📈",
    SLEEP: "😴 10 baje sone jao, fresh utho! 🌙"
  };
  return fallbacks[category] || "💪 Keep going, success is coming! 🚀";
}

// ----------------- Fetch Users -----------------
async function fetchSubscribedUsers() {
  try {
    const response = await fetch(`https://onesignal.com/api/v1/players?app_id=${ONESIGNAL_APP_ID}&limit=300`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${ONESIGNAL_API_KEY}`,
      },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`OneSignal API Error: ${JSON.stringify(data)}`);
    
    return data.players
      .filter(player => player.is_active !== false)
      .map(player => ({
        player_id: player.id,
        name: player.tags?.name || "Buddy",
        streak: player.tags?.streak ? parseInt(player.tags.streak) : 0,
      }));
  } catch (error) {
    console.error("❌ Error fetching users:", error.message);
    return [];
  }
}

// ----------------- Update Streak -----------------
async function updateUserStreak(player_id, streak) {
  try {
    await fetch(`https://onesignal.com/api/v1/players/${player_id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        tags: { streak: streak.toString() },
      }),
    });
  } catch (error) {
    console.error(`❌ Error updating streak:`, error.message);
  }
}

// ----------------- Send Notification -----------------
async function sendLifeNotification(category, customMessage = null) {
  const users = await fetchSubscribedUsers();
  
  if (users.length === 0) {
    console.warn("⚠️ No active users found");
    return { success: false, message: "No users found" };
  }

  // 🔥 HAR BAAR GEMINI AI SE NAYA MESSAGE GENERATE KAREGA
  const message = customMessage || (await generateAIMessage(category));

  for (const user of users) {
    const streakText = user.streak > 0 ? ` | Streak: ${user.streak} days 🔥` : "";

    try {
      const response = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${ONESIGNAL_API_KEY}`,
        },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          include_player_ids: [user.player_id],
          headings: { en: `🚀 ${category.replace('_', ' ')}` },
          contents: { en: `${message}${streakText}` },
          ios_sound: "notification.caf",
          android_sound: "notification",
          priority: 8,
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.id) {
        await updateUserStreak(user.player_id, user.streak + 1);
        console.log(`✅ ${category} sent: ${message}`);
      }
    } catch (error) {
      console.error(`❌ Notification failed:`, error.message);
    }
  }

  return { success: true, message: `${category} notification sent!` };
}

// ----------------- MANUAL TEST URLs (SAB CATEGORIES) -----------------
app.get("/", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  res.json({
    message: "🚀 AI Life Improvement Server - Manual Test URLs",
    test_urls: {
      wake_up: `${baseUrl}/test/wake-up`,
      study: `${baseUrl}/test/study`, 
      focus: `${baseUrl}/test/focus`,
      health: `${baseUrl}/test/health`,
      productivity: `${baseUrl}/test/productivity`,
      sleep: `${baseUrl}/test/sleep`,
      all_categories: `${baseUrl}/test/all`
    },
    info: "Visit any URL to test that notification instantly!",
    schedule: "16+ daily notifications with AI-generated messages"
  });
});

// 🔥 MANUAL TEST ENDPOINTS - SAB CATEGORIES KE LIYE
app.get("/test/wake-up", async (req, res) => {
  const result = await sendLifeNotification("WAKE_UP");
  res.json({ 
    category: "WAKE_UP", 
    status: "✅ Notification Sent!",
    result 
  });
});

app.get("/test/study", async (req, res) => {
  const result = await sendLifeNotification("STUDY");
  res.json({ 
    category: "STUDY", 
    status: "✅ Notification Sent!",
    result 
  });
});

app.get("/test/focus", async (req, res) => {
  const result = await sendLifeNotification("FOCUS");
  res.json({ 
    category: "FOCUS", 
    status: "✅ Notification Sent!",
    result 
  });
});

app.get("/test/health", async (req, res) => {
  const result = await sendLifeNotification("HEALTH");
  res.json({ 
    category: "HEALTH", 
    status: "✅ Notification Sent!",
    result 
  });
});

app.get("/test/productivity", async (req, res) => {
  const result = await sendLifeNotification("PRODUCTIVITY");
  res.json({ 
    category: "PRODUCTIVITY", 
    status: "✅ Notification Sent!",
    result 
  });
});

app.get("/test/sleep", async (req, res) => {
  const result = await sendLifeNotification("SLEEP");
  res.json({ 
    category: "SLEEP", 
    status: "✅ Notification Sent!",
    result 
  });
});

app.get("/test/all", async (req, res) => {
  const categories = ["WAKE_UP", "STUDY", "FOCUS", "HEALTH", "PRODUCTIVITY", "SLEEP"];
  const results = [];
  
  for (const category of categories) {
    const result = await sendLifeNotification(category);
    results.push({ category, result });
    // Thoda delay har notification ke beech mein
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  res.json({
    message: "🎉 All 6 category notifications sent!",
    results
  });
});

// ----------------- SCHEDULE - 16+ DAILY NOTIFICATIONS -----------------
const SCHEDULE = [
  // 🌅 MORNING (5:00 AM - 8:00 AM)
  { time: "0 23 * * *", category: "WAKE_UP" },                    // 5:00 AM
  { time: "15 23 * * *", category: "MORNING_MOTIVATION" },        // 5:15 AM
  { time: "30 23 * * *", category: "STUDY" },                     // 5:30 AM
  { time: "45 23 * * *", category: "FOCUS" },                     // 5:45 AM
  
  // 📚 DAY (8:00 AM - 5:00 PM)  
  { time: "0 2 * * *", category: "STUDY" },                       // 8:00 AM
  { time: "30 2 * * *", category: "HEALTH" },                     // 8:30 AM
  { time: "0 4 * * *", category: "FOCUS" },                       // 10:00 AM
  { time: "30 4 * * *", category: "PRODUCTIVITY" },               // 10:30 AM
  { time: "0 6 * * *", category: "STUDY" },                       // 12:00 PM
  { time: "30 6 * * *", category: "HEALTH" },                     // 12:30 PM
  { time: "0 9 * * *", category: "PRODUCTIVITY" },                // 3:00 PM
  { time: "30 9 * * *", category: "FOCUS" },                      // 3:30 PM
  
  // 🌇 EVENING (5:00 PM - 10:00 PM)
  { time: "0 11 * * *", category: "STUDY" },                      // 5:00 PM
  { time: "30 11 * * *", category: "PRODUCTIVITY" },              // 5:30 PM
  { time: "0 13 * * *", category: "HEALTH" },                     // 7:00 PM
  { time: "30 13 * * *", category: "SLEEP" },                     // 7:30 PM
  { time: "0 16 * * *", category: "SLEEP" }                       // 10:00 PM
];

// Schedule setup
SCHEDULE.forEach(item => {
  cron.schedule(item.time, async () => {
    console.log(`⏰ ${item.category} Notification Triggered`);
    await sendLifeNotification(item.category);
  });
});

// ----------------- SERVER START -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 AI LIFE IMPROVEMENT SERVER STARTED!");
  console.log("📅 16+ Daily Notifications Activated");
  console.log("🔗 Manual Test URLs Available:");
  console.log("   /test/wake-up    /test/study     /test/focus");
  console.log("   /test/health     /test/productivity  /test/sleep");
  console.log("   /test/all - All categories at once");
});
