# YouTube OAuth Integration Report for Insight-Viewer Project

## PROJECT OVERVIEW

**Frontend:** Vanilla HTML, CSS, JavaScript

**Backend:** Vercel Serverless Functions

**Database:** Firebase (Firestore)

**Hosting:** Vercel

**Repository:** GitHub (project is deployed from GitHub)

### PROJECT STRUCTURE
```
/insight-viewer/
  ├── index.html
  ├── style.css
  ├── script.js
  ├── /api/
  │   └── oauthCallback.js
  └── README.md
```

### PROJECT PURPOSE

This project displays videos on a homepage. Videos come from:

- Videos manually uploaded and stored in Firebase
- Videos fetched automatically from a YouTube channel

**Behavior:**

- Homepage fetches all videos, regardless of category
- Category pages (Entertainment, Bible Study, Sermon, Live) show only videos with categories
- Videos without categories appear only on the homepage, not in category pages

---

## EXISTING FIREBASE DATA

- **60+ videos already stored in Firebase**
- These videos must not be duplicated
- YouTube videos should only be added if they do not already exist

---

## YOUTUBE INTEGRATION GOAL

1. Connect one YouTube channel to the backend
2. Fetch videos automatically via YouTube Data API
3. Store fetched videos in Firebase
4. **Visitors should not log in**
5. **OAuth happens once (admin-only)**
6. After OAuth approval, all users see videos automatically

---

## PROGRESS SO FAR (ACCOMPLISHED)

- ✅ Google OAuth flow was correctly implemented
- ✅ OAuth consent screen appears and generates the code
- ✅ oauthCallback.js receives the code and exchanges it successfully for tokens
- ✅ Serverless functions in Vercel are deployed and reachable
- ✅ Environment variables are configured correctly
- ✅ The frontend "Connect to YouTube" button triggers OAuth only once
- ✅ API folder and all project files are now correctly deployed via GitHub

---

## CURRENT ISSUE

- YouTube videos are not yet fetched automatically into Firebase
- Homepage displays videos already uploaded manually
- Videos added from YouTube are not appearing in the homepage
- The fetching logic may need:
  - Differentiation between videos already in Firebase vs new YouTube videos
  - Proper placement in categories based on the description field
  - Ensuring no duplication

---

## WHAT I NEED HELP WITH

### Requirements:
1. Ensure YouTube fetching logic works correctly after OAuth is done
2. Ensure videos are stored in Firebase without duplication
3. Ensure category detection works:
   - Homepage: all videos
   - Categories: only videos with category in the description
4. Explain exactly what to add or change in:
   - Backend (oauthCallback.js or other serverless functions)
   - Frontend (if necessary)
5. Provide step-by-step instructions for implementation
6. Ensure solution works in Vercel serverless environment

### Constraints (DO NOT ASSUME):
- ❌ Any framework (React, Next.js, etc.)
- ❌ Any additional backend beyond Vercel serverless functions
- ❌ Any user login/authentication beyond admin OAuth

---

## BACKEND IMPLEMENTATION NEEDED

### 1. oauthCallback.js Updates
The OAuth callback handler needs to:
1. Exchange authorization code for tokens
2. Store tokens securely in Firebase
3. Trigger video fetching after successful token storage

### 2. fetchYouTubeVideos.js (New or Updated)
A serverless function to:
1. Retrieve stored OAuth tokens from Firebase
2. Use YouTube Data API to fetch videos from the channel
3. Check for existing videos to prevent duplicates
4. Parse video descriptions for category tags (e.g., #Category:Bible Study)
5. Store new videos in Firebase Firestore

### 3. Category Detection Logic
- Parse description field for category patterns like `#Category:Name`
- Categories: Entertainment, Bible Study, Sermon, Live
- Videos without categories appear on homepage only

---

## FRONTEND IMPLEMENTATION NEEDED

### Minimal or No Changes Expected
- Homepage already fetches from Firebase
- Category pages already filter by category
- Main work is backend logic for YouTube fetching and storage

---

## DEPLOYMENT CHECKLIST

- [ ] Verify all environment variables in Vercel
- [ ] Deploy updated serverless functions
- [ ] Test OAuth flow (admin-only, one-time)
- [ ] Verify videos appear on homepage
- [ ] Verify category filtering works correctly

---

## NEXT STEPS

1. Review and implement backend logic for YouTube video fetching
2. Add deduplication logic using video IDs
3. Implement category parsing from descriptions
4. Deploy and test the complete flow
