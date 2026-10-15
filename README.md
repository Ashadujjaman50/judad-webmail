# ✉️ Judad KSA Webmail System

**Modern Node.js & Express Webmail Application powered by Resend API**

This application provides a comprehensive Webmail client (Inbox & Sent Box) integrating 3 official email accounts under the **judadksa.com** domain with **Resend.com**:

- `info@judadksa.com` (General Inquiries & Information)
- `admin@judadksa.com` (Administration & System Alerts)
- `support@judadksa.com` (Customer Support & Helpdesk)

---

## 🌟 Key Features

1. **Multi-Account Integration**:
   - Seamlessly switch between `info@`, `admin@`, `support@`, or view **All Inboxes (Unified View)**.
   - Live unread badges and folder counters.

2. **Full Inbox & Inbound Receiving**:
   - Integrates with Resend Inbound Receiving API.
   - Automatically downloads and parses incoming message bodies (HTML & Plain Text).
   - Real-time search across subject, sender, and email content.

3. **Sent Box & Delivery Tracking**:
   - Send emails directly through verified Resend domain `judadksa.com`.
   - Real-time delivery status (`sent`, `delivered`, `bounced`).
   - Sync sent history directly from the Resend Cloud API.

4. **Strict Domain Isolation**:
   - Exclusively filters and isolates `judadksa.com`. Any other domains connected to the same Resend API key are strictly filtered out.

5. **Instant Inbound Simulator**:
   - Test incoming email delivery directly within the interface without waiting for DNS propagation.

6. **Webhooks Integration (`/api/webhook`)**:
   - Real-time webhook listener for incoming emails (`email.received`) and delivery events.

7. **Modern Dark-Mode UI**:
   - Clean glassmorphism styling, responsive layout, quick templates, reply, forward, and deletion actions.

---

## 🚀 Getting Started Locally

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration (.env)
Create a `.env` file in the root directory:
```env
PORT=3000
RESEND_API_KEY=your_resend_api_key_here
DOMAIN=judadksa.com
ACCOUNTS=info@judadksa.com,admin@judadksa.com,support@judadksa.com
```

### 3. Run Server
```bash
npm start
```
Or in watch/dev mode:
```bash
npm run dev
```

### 4. Open in Browser
Visit:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/accounts` | Get status and counts for the 3 connected accounts |
| `GET` | `/api/domain-status` | Check live domain verification status on Resend |
| `GET` | `/api/emails` | List emails (`?folder=inbox&account=info@judadksa.com`) |
| `GET` | `/api/emails/:id` | Get full email details with rendered content |
| `POST` | `/api/emails/send` | Send email via Resend API |
| `POST` | `/api/webhook` | Webhook endpoint for inbound and delivery events |
| `POST` | `/api/emails/simulate-inbound` | Simulate an incoming test email |
| `POST` | `/api/emails/sync-resend` | Sync inbox & sent emails from Resend |
| `PATCH` | `/api/emails/:id/read` | Mark email as read or unread |
| `DELETE` | `/api/emails/:id` | Move email to trash or delete permanently |

---

## 🌐 Netlify Deployment

The project includes `netlify.toml` and Netlify Serverless Functions in `netlify/functions/api.js`.

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Update Judad Webmail"
git push origin main
```

### Step 2: Connect to Netlify
1. Log in to **[Netlify.com](https://netlify.com)**.
2. Click **"Add new site"** > **"Import an existing project"** > **GitHub**.
3. Select your repository (`judad-webmail`).
4. Build settings are automatically detected via `netlify.toml`.

### Step 3: Add Environment Variables
In your Netlify Site Dashboard under **Site configuration** > **Environment variables**:
- `RESEND_API_KEY`: Your Resend API Key
- `DOMAIN`: `judadksa.com`
- `ACCOUNTS`: `info@judadksa.com,admin@judadksa.com,support@judadksa.com`

### Step 4: Webhook Configuration
Add your Netlify live webhook URL to [Resend Webhooks](https://resend.com/webhooks):
```
https://judadmail.netlify.app/api/webhook
```
Selected events: `email.received`, `email.delivered`, `email.bounced`, `email.sent`.
