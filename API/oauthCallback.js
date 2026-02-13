const { google } = require("googleapis");
const admin = require("firebase-admin");

// Initialize Firebase (only once)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.firestore();

module.exports = async function handler(req, res) {
  try {
    const code = req.query.code;

    if (!code) {
      return res.status(400).json({ error: "Missing OAuth code" });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI // e.g., https://your-domain.vercel.app/api/oauthCallback
    );

    const { tokens } = await oauth2Client.getToken(code);

    // Save tokens in Firebase
    await db.collection("youtubeTokens").doc("main").set(tokens);

    res.status(200).send("YouTube OAuth successful! You can close this window.");
  } catch (error) {
    console.error("OAuth Callback Error:", error);
    res.status(500).json({ error: error.message });
  }
};
