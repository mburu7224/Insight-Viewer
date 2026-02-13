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
    // Get stored tokens
    const tokenDoc = await db.collection("youtubeTokens").doc("main").get();
    if (!tokenDoc.exists) {
      return res.status(400).json({ error: "No stored YouTube tokens found" });
    }
    const tokens = tokenDoc.data();

    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI
    );
    oauth2Client.setCredentials(tokens);

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    // Step 1: Get uploads playlist from your channel
    const response = await youtube.channels.list({
      part: "contentDetails",
      mine: true,
    });

    const uploadsPlaylistId =
      response.data.items[0].contentDetails.relatedPlaylists.uploads;

    let videos = [];
    let nextPageToken = null;

    // Step 2: Fetch all videos in uploads playlist
    do {
      const playlistResponse = await youtube.playlistItems.list({
        part: "snippet",
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken: nextPageToken,
      });

      playlistResponse.data.items.forEach((item) => {
        const description = item.snippet.description;

        // Extract category from description using a tag like: #Category:Bible Study
        let categoryMatch = description.match(/#Category:(.*)/i);
        let category = categoryMatch ? categoryMatch[1].trim() : null;

        // Extract recorded date from description using a tag like: #Date:2026-02-08
        let dateMatch = description.match(/#Date:(.*)/i);
        let recordedDate = dateMatch ? dateMatch[1].trim() : item.snippet.publishedAt;

        videos.push({
          videoId: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          description: description,
          category: category,         // null if not provided
          recordedDate: recordedDate, // fallback to publishedAt
          publishedAt: item.snippet.publishedAt,
        });
      });

      nextPageToken = playlistResponse.data.nextPageToken;
    } while (nextPageToken);

    // Step 3: Save videos to Firebase
    const batch = db.batch();
    videos.forEach((video) => {
      const docRef = db.collection("videos").doc(video.videoId);
      batch.set(docRef, video, { merge: true });
    });
    await batch.commit();

    res.status(200).json({
      message: "Videos synced successfully",
      count: videos.length,
    });
  } catch (error) {
    console.error("Fetch YouTube Videos Error:", error);
    res.status(500).json({ error: error.message });
  }
};
