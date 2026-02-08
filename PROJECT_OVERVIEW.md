# PROJECT OVERVIEW: Elite India Roleplay (EIRP) 🚀

This document provides a complete breakdown of the project state, architecture, and the migration work completed to date.

---

## 1. System Architecture
The project is a dual-component system consisting of a **Discord Bot** and a **Web Dashboard**, both sharing a unified **Supabase** backend.

### Components
*   **Discord Bot (`/bot`)**: Provides in-server commands, automated logging, and role management.
*   **Web Dashboard (`/website`)**: An Express-based portal where users take "Examination" quizzes and submit Staff/Gang applications.
*   **Backend (`/src`)**: Shared logic for database access (Storage), API routes, and Middleware.
*   **Frontend (`/public`)**: Cyberpunk-themed static pages (HTML/CSS/JS) that interact with the Express API.

---

## 2. Tools & Services Used

| Service | Purpose |
| :--- | :--- |
| **Supabase** | Primary Database (PostgreSQL) and Authentication provider. |
| **Discord OAuth** | Allows users to log in using their Discord accounts. |
| **Express.js** | Backend web server handling API requests and page routing. |
| **Render** | Used for hosting the Node.js server (Website + Bot). |
| **GitHub** | Version control and deployment source. |

---

## 3. Environment Variables (.env) 🔑

These keys are essential for the project to communicate with external services.

| Variable | Description |
| :--- | :--- |
| `SUPABASE_URL` | Your Supabase project URL (found in Settings -> API). |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key for Supabase (bypass RLS for server-side actions). |
| `DISCORD_TOKEN` | The secret token for your Discord Bot. |
| `DISCORD_CLIENT_ID` | Your Discord Application ID. |
| `DISCORD_GUILD_ID` | The ID of your Discord Server. |
| `ADMIN_ROLE_ID` | The ID of the Staff/Admin role in your Discord. |
| `SESSION_SECRET` | A random string used to secure browser cookies. |
| `BASE_URL` | The public URL of your site (e.g., `https://yourapp.onrender.com`). |

---

## 4. Work Completed (Summary) 🛠️

### A. The "Great Migration" (Local to Cloud)
*   **Problem**: The project was originally using local `.json` files. This caused data loss on Render because it doesn't save files permanently.
*   **Solution**: Migrated all data to **Supabase**. Rewrote `src/utils/storage.js` to handle all DB calls.

### B. Auth Refactor (Passport to Supabase)
*   **Problem**: Discord was rate-limiting Render's IP addresses, breaking the login.
*   **Solution**: Moved the login handshake to **Supabase Auth**. This bypassed the IP blocks and made the login 100% reliable.

### C. UI & Bug Fixes
*   **Gang Applications**: Fixed the 404 error when applying for a gang.
*   **Quiz Visibility**: Fixed the invisible buttons at the bottom of the quiz.
*   **Data Integrity**: Fixed Staff and Gang application submissions so they save correctly to Supabase.
*   **Admin Tools**: Fully updated the Admin Panel to show live Supabase data.

---

## 5. Directory Structure
- `/bot/`: Discord Bot files.
- `/website/`: Express server setup.
- `/src/routes/`: The project "brains" (Login, Rules, API).
- `/src/utils/storage.js`: The connector to Supabase.
- `/public/`: The design and pages.

---

## 6. Current Status
✅ **Ready for Deployment.** The project is now stable and using professional-grade tools.
