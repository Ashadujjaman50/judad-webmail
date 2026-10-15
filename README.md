# ✉️ Judad KSA Webmail System

**Node.js & Express Webmail Application powered by Resend API**

এই প্রজেক্টটি **judadksa.com** ডোমেইনের ৩টি প্রাতিষ্ঠানিক ইমেইল অ্যাড্রেসকে **Resend.com** API-এর সাথে সংযুক্ত করে একটি স্বয়ংসম্পূর্ণ Webmail সিস্টেম (Inbox ও Sent Box সহ) প্রদান করে।

---

## 🌟 মূল বৈশিষ্ট্যসমূহ (Key Features)

1. **৩টি ইমেইল অ্যাকাউন্ট ইন্টিগ্রেশন**:
   - `info@judadksa.com` (সাধারণ তথ্য ও অনুসন্ধান)
   - `admin@judadksa.com` (প্রশাসনিক ও সিস্টেম মেইল)
   - `support@judadksa.com` (গ্রাহক সেবা ও হেল্পডেস্ক)

2. **ইনবক্স (Inbox)**:
   - প্রতিটি অ্যাকাউন্টের আলাদা ইনবক্স অথবা ইউনিফাইড (All Inboxes) ভিউ।
   - অপঠিত (Unread) মেইল কাউন্টার ও ব্যাজ।
   - রিয়েল-টাইম সার্চ এবং ফিল্টারিং।
   - ইনকামিং মেইল দেখার জন্য সমৃদ্ধ রিডার প্যানেল।

3. **সেন্ট বক্স (Sent Box)**:
   - Resend API ব্যবহার করে সরাসরি যেকোনো একাউন্ট থেকে মেইল পাঠানোর সুবিধা।
   - পাঠানো সমস্ত মেইলের লাইভ ডেলিভারি স্ট্যাটাস (`sent`, `delivered`, `bounced`)।
   - Resend ড্যাশবোর্ড থেকে তাৎক্ষণিক লাইভ হিস্টোরি সিঙ্ক বাটন।

4. **টেস্ট ইনবাউন্ড সিমুলেটর (Instant Test Inbound)**:
   - DNS MX রেকর্ড কনফিগার করার আগেই এক ক্লিকে যেকোনো ইনবক্সে টেস্ট মেইল রিসিভ করার সুবিধা।

5. **Webhook ইন্টিগ্রেশন (`/api/webhook`)**:
   - Resend এর Webhook এর মাধ্যমে লাইভ ইনকামিং মেইল ও ডেলিভারি স্ট্যাটাস ট্র্যাকিং।

6. **ডোমেইন আইসোলেশন ও ফিল্টারিং (Strict Domain Isolation)**:
   - আপনার Resend অ্যাকাউন্টে একাধিক ডোমেইন কানেক্ট থাকলেও এই প্রজেক্টে কঠোরভাবে শুধুমাত্র `judadksa.com` ডোমেইন ফিল্টার করা হবে।
   - অন্য কোনো ডোমেইনের ইমেইল কখনো ইনবক্সে আসবে না বা সেন্ট বক্সে সিঙ্ক হবে না।

7. **আধুনিক ও প্রিমিয়াম ডিজাইন (Ultra-modern UI)**:
   - ডার্ক মোড ডিজাইন, গ্লাস মরফিজম, অ্যানিমেশন এবং রেসপনসিভ লেআউট।
   - কুইক টেমপ্লেট (Welcome, Support Response, Official Proposal)।
   - Reply এবং Forward সুবিধা।

---

## 🚀 যেভাবে শুরু করবেন (How to Run)

### ১. ডিপেন্ডেন্সি ইনস্টল (যদি ইতিমধ্যে না হয়ে থাকে)
```bash
npm install
```

### ২. এনভায়রনমেন্ট কনফিগারেশন (.env)
প্রজেক্টের রুট ডিরেক্টরিতে `.env` ফাইলটিতে আপনার ক্রেডেনশিয়াল ইতিমধ্যেই যুক্ত আছে:
```env
PORT=3000
RESEND_API_KEY=your_resend_api_key_here
DOMAIN=judadksa.com
ACCOUNTS=info@judadksa.com,admin@judadksa.com,support@judadksa.com
```

### ৩. সার্ভার চালু করুন
```bash
npm start
```
অথবা ডেভেলপমেন্ট মোডে:
```bash
npm run dev
```

### ৪. ব্রাউজারে ওপেন করুন
ব্রাউজারে গিয়ে প্রবেশ করুন:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 📡 API এন্ডপয়েন্টস (API Endpoints)

| মেথড | এন্ডপয়েন্ট | বিবরণ |
|---|---|---|
| `GET` | `/api/accounts` | ৩টি অ্যাকাউন্টের স্ট্যাটাস ও কাউন্ট |
| `GET` | `/api/domain-status` | Resend ডোমেইন লাইভ স্ট্যাটাস (`judadksa.com`) |
| `GET` | `/api/emails` | ইমেইল তালিকা (`?folder=inbox&account=info@judadksa.com`) |
| `GET` | `/api/emails/:id` | নির্দিষ্ট ইমেইলের পূর্ণ বিবরণ |
| `POST` | `/api/emails/send` | Resend API দিয়ে মেইল পাঠানো |
| `POST` | `/api/webhook` | Resend ইনবাউন্ড ও ইভেন্ট রিসিভার |
| `POST` | `/api/emails/simulate-inbound` | টেস্ট ইনকামিং ইমেইল জেনারেটর |
| `POST` | `/api/emails/sync-resend` | Resend হিস্ট্রি সিঙ্ক |
| `PATCH` | `/api/emails/:id/read` | পঠিত/অপঠিত চিহ্নিত করা |
| `DELETE` | `/api/emails/:id` | ট্র্যাশে পাঠানো / ডিলিট করা |

---

## 🔧 ডোমেইন ও লাইভ ইনবাউন্ড রিসিভিং গাইড

- **সেন্ডিং স্ট্যাটাস**: `judadksa.com` ডোমেইনটি Resend-এ ইতিমধ্যে **Verified** এবং **Sending Enabled** অবস্থায় আছে। ফলে আপনি এই ৩টি ইমেইল দিয়ে যেকোনো ঠিকানায় বিশ্বস্ত মেইল পাঠাতে পারবেন।
- **বাইরের সাধারণ ইমেইল রিসিভ করতে**: আপনার ডোমেইন DNS প্রোভাইডারে গিয়ে Resend নির্দেশিত ইনবাউন্ড MX রেকর্ডটি যোগ করে Resend Webhook-এর সাথে আপনার সার্ভার URL (`https://your-domain.com/api/webhook`) যুক্ত করে দিলে বাইরের যেকোনো ব্যক্তি মেইল পাঠালেও তা সরাসরি আপনার এই অ্যাপের ইনবক্সে জমা হবে।

---

## 🌐 Netlify.com এ ডিপ্লয় করার নিয়মাবলী (Netlify Deployment)

প্রজেক্টে ইতিমধ্যেই Netlify Functions ও `netlify.toml` কনফিগার করা আছে।

### ধাপ ১: GitHub এ আপলোড করুন
```bash
git init
git add .
git commit -m "Deploy Judad Webmail"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### ধাপ ২: Netlify ড্যাশবোর্ডে ডিপ্লয়
1. **[Netlify.com](https://netlify.com)** এ লগইন করে **"Add new site"** -> **"Import an existing project"** -> **GitHub** নির্বাচন করুন।
2. আপনার রিপোজিটরি নির্বাচন করুন।
3. `netlify.toml` কনফিগার করা থাকায় সব সেটিংস স্বয়ংক্রিয়ভাবে সেট হয়ে যাবে।

### ধাপ ৩: Environment Variables যোগ করুন
Netlify ড্যাশবোর্ডে **Site configuration** > **Environment variables** এ গিয়ে নিচের ৩টি ভেরিয়েবল যোগ করুন:
- `RESEND_API_KEY`: আপনার Resend API Key
- `DOMAIN`: `judadksa.com`
- `ACCOUNTS`: `info@judadksa.com,admin@judadksa.com,support@judadksa.com`

### ধাপ ৪: লাইভ URL
ডিপ্লয় সম্পন্ন হলে Netlify আপনাকে একটি লাইভ লিঙ্ক দেবে (যেমন `https://judad-mail.netlify.app`)।
সেখান থেকে আপনার লাইভ Webhook URL হবে:
`https://judad-mail.netlify.app/api/webhook`
যাহা Resend ড্যাশবোর্ডের Webhooks সেকশনে যোগ করে দেবেন।
