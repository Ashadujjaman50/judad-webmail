require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { Resend } = require('resend');

const app = express();
const router = express.Router();

const PORT = process.env.PORT || 3000;
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const DOMAIN = process.env.DOMAIN || 'judadksa.com';
const CONNECTED_ACCOUNTS = (process.env.ACCOUNTS || 'info@judadksa.com,admin@judadksa.com,support@judadksa.com')
  .split(',')
  .map(e => e.trim());

const resend = new Resend(RESEND_API_KEY);

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Detect Serverless (Netlify / AWS Lambda) environment
const isServerless = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
const DB_FILE = isServerless
  ? path.join('/tmp', 'emails.json')
  : path.join(__dirname, 'data', 'emails.json');

// Ensure DB exists and is sanitized
function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initialData = { emails: [] };
      writeDb(initialData);
      return initialData;
    }
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(content);

    // Strictly enforce judadksa.com domain isolation
    if (Array.isArray(data.emails)) {
      const filtered = data.emails.filter(e => {
        const accLower = (e.account || '').toLowerCase();
        const fromLower = (e.from || '').toLowerCase();
        const toLower = Array.isArray(e.to) ? e.to.join(' ').toLowerCase() : (e.to || '').toLowerCase();

        return accLower.includes(`@${DOMAIN.toLowerCase()}`) ||
               fromLower.includes(`@${DOMAIN.toLowerCase()}`) ||
               toLower.includes(`@${DOMAIN.toLowerCase()}`);
      });

      if (filtered.length !== data.emails.length) {
        data.emails = filtered;
        writeDb(data);
      }
    }

    return data;
  } catch (err) {
    console.error('Error reading DB:', err);
    return { emails: [] };
  }
}

function writeDb(data) {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing DB:', err);
    return false;
  }
}

// Helper: Normalize and match account from email address (STRICT for judadksa.com)
function matchAccount(addressString) {
  if (!addressString) return null;
  const str = addressString.toLowerCase();

  // 1. Check exact match with configured accounts
  for (const acc of CONNECTED_ACCOUNTS) {
    if (str.includes(acc.toLowerCase())) {
      return acc;
    }
  }

  // 2. Belongs to judadksa.com
  if (str.includes(`@${DOMAIN.toLowerCase()}`)) {
    return CONNECTED_ACCOUNTS[0];
  }

  // 3. Other domains are strictly rejected
  return null;
}

// 1. Get Accounts and Stats
router.get('/accounts', (req, res) => {
  const db = readDb();
  const accountsData = CONNECTED_ACCOUNTS.map(email => {
    const unreadInbox = db.emails.filter(
      e => e.folder === 'inbox' && e.account === email && !e.read
    ).length;
    const totalInbox = db.emails.filter(
      e => e.folder === 'inbox' && e.account === email
    ).length;
    const totalSent = db.emails.filter(
      e => e.folder === 'sent' && e.account === email
    ).length;

    let role = 'General Info';
    if (email.startsWith('admin')) role = 'Administrator';
    if (email.startsWith('support')) role = 'Customer Support';

    return {
      email,
      role,
      unreadInbox,
      totalInbox,
      totalSent
    };
  });

  const allUnread = db.emails.filter(e => e.folder === 'inbox' && !e.read).length;
  const allInbox = db.emails.filter(e => e.folder === 'inbox').length;
  const allSent = db.emails.filter(e => e.folder === 'sent').length;
  const allTrash = db.emails.filter(e => e.folder === 'trash').length;

  res.json({
    accounts: accountsData,
    domain: DOMAIN,
    totals: {
      unreadInbox: allUnread,
      inbox: allInbox,
      sent: allSent,
      trash: allTrash
    }
  });
});

// 2. Get Live Domain Status from Resend
router.get('/domain-status', async (req, res) => {
  try {
    const domainsResponse = await resend.domains.list();
    const domains = domainsResponse?.data?.data || [];
    const matched = domains.find(d => d.name.toLowerCase() === DOMAIN.toLowerCase());

    if (!matched) {
      return res.json({
        found: false,
        domain: DOMAIN,
        status: 'not_found',
        message: `Domain ${DOMAIN} not found in this Resend account.`
      });
    }

    const details = await resend.domains.get(matched.id);

    res.json({
      found: true,
      domain: DOMAIN,
      id: matched.id,
      status: matched.status,
      capabilities: matched.capabilities || {},
      region: matched.region,
      records: details?.data?.records || []
    });
  } catch (error) {
    console.error('Error fetching domain status:', error);
    res.status(500).json({
      found: false,
      error: error.message || 'Failed to fetch domain status'
    });
  }
});

// 3. Get Emails (Inbox, Sent, Trash) with filters
router.get('/emails', async (req, res) => {
  const { folder = 'inbox', account = 'all', search = '' } = req.query;
  const db = readDb();

  // If in serverless or sent folder is empty, auto-sync from Resend cloud
  if (folder === 'sent' && db.emails.filter(e => e.folder === 'sent').length === 0) {
    try {
      const listRes = await resend.emails.list();
      const liveEmails = listRes?.data?.data || [];
      for (const item of liveEmails) {
        const fromLower = (item.from || '').toLowerCase();
        const toLower = Array.isArray(item.to) ? item.to.join(' ').toLowerCase() : (item.to || '').toLowerCase();
        if (fromLower.includes(`@${DOMAIN.toLowerCase()}`) || toLower.includes(`@${DOMAIN.toLowerCase()}`)) {
          const matchedAcc = matchAccount(item.from) || matchAccount(toLower) || CONNECTED_ACCOUNTS[0];
          db.emails.push({
            id: item.id,
            resend_id: item.id,
            folder: 'sent',
            account: matchedAcc,
            from: item.from,
            to: item.to,
            subject: item.subject || '(No Subject)',
            html: null,
            text: null,
            status: item.last_event || 'sent',
            read: true,
            created_at: item.created_at || new Date().toISOString()
          });
        }
      }
      writeDb(db);
    } catch (e) {
      // ignore
    }
  }

  let list = db.emails.filter(e => e.folder === folder);

  if (account && account !== 'all') {
    list = list.filter(e => e.account.toLowerCase() === account.toLowerCase());
  }

  if (search && search.trim() !== '') {
    const q = search.trim().toLowerCase();
    list = list.filter(e => {
      const subj = (e.subject || '').toLowerCase();
      const from = (e.from || '').toLowerCase();
      const to = Array.isArray(e.to) ? e.to.join(' ').toLowerCase() : (e.to || '').toLowerCase();
      const text = (e.text || '').toLowerCase();
      return subj.includes(q) || from.includes(q) || to.includes(q) || text.includes(q);
    });
  }

  // Sort newest first
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.json({
    folder,
    account,
    count: list.length,
    emails: list
  });
});

// 4. Get Single Email
router.get('/emails/:id', async (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const email = db.emails.find(e => e.id === id);

  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  if (!email.read) {
    email.read = true;
    writeDb(db);
  }

  // If it's a sent email with a resend ID, try to get live update if needed
  if (email.resend_id && !email.html) {
    try {
      const live = await resend.emails.get(email.resend_id);
      if (live?.data) {
        email.html = live.data.html || email.html;
        email.text = live.data.text || email.text;
        email.status = live.data.last_event || email.status;
        writeDb(db);
      }
    } catch (err) {
      // ignore
    }
  }

  res.json({ email });
});

// 5. Send Email via Resend
router.post('/emails/send', async (req, res) => {
  try {
    const { from, to, subject, html, text, replyTo } = req.body;

    if (!from || !to || !subject) {
      return res.status(400).json({ error: 'Missing required fields: from, to, subject' });
    }

    const senderEmail = matchAccount(from);
    if (!senderEmail || !CONNECTED_ACCOUNTS.includes(senderEmail)) {
      return res.status(400).json({
        error: `Sender address must be one of: ${CONNECTED_ACCOUNTS.join(', ')}`
      });
    }

    let formattedFrom = from;
    if (!from.includes('<')) {
      let displayName = 'Judad KSA';
      if (senderEmail.startsWith('admin')) displayName = 'Judad Admin';
      else if (senderEmail.startsWith('support')) displayName = 'Judad Support';
      else displayName = 'Judad Info';
      formattedFrom = `"${displayName}" <${senderEmail}>`;
    }

    const payload = {
      from: formattedFrom,
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || `<p>${(text || '').replace(/\n/g, '<br/>')}</p>`,
      text: text || ''
    };

    if (replyTo) {
      payload.reply_to = replyTo;
    }

    const result = await resend.emails.send(payload);

    if (result.error) {
      console.error('Resend error:', result.error);
      return res.status(400).json({ error: result.error.message || 'Resend API error' });
    }

    const resendId = result.data?.id;

    const db = readDb();
    const newSentEmail = {
      id: resendId || `sent-${Date.now()}`,
      resend_id: resendId,
      folder: 'sent',
      account: senderEmail,
      from: formattedFrom,
      to: payload.to,
      subject,
      html: payload.html,
      text: payload.text,
      status: 'sent',
      read: true,
      created_at: new Date().toISOString()
    };

    db.emails.unshift(newSentEmail);
    writeDb(db);

    res.json({
      success: true,
      message: 'ইমেইল সফলভাবে পাঠানো হয়েছে!',
      email: newSentEmail,
      resendResponse: result.data
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: error.message || 'Internal server error while sending email' });
  }
});

// 6. Webhook Endpoint for Resend (Inbound and Event delivery updates)
router.post('/webhook', (req, res) => {
  try {
    const payload = req.body;
    const db = readDb();

    // Event 1: Inbound Email
    if (payload?.type === 'email.inbound' || payload?.type === 'email.received' || payload?.email) {
      const emailData = payload.data || payload;
      const recipient = Array.isArray(emailData.to) ? emailData.to[0] : (emailData.to || '');
      const matchedAcc = matchAccount(recipient);

      if (!matchedAcc) {
        return res.json({ ignored: true, reason: `Recipient not belonging to ${DOMAIN}` });
      }

      const inboundEmail = {
        id: emailData.id || `inbound-${Date.now()}`,
        folder: 'inbox',
        account: matchedAcc,
        from: emailData.from || 'Unknown Sender',
        to: Array.isArray(emailData.to) ? emailData.to : [emailData.to],
        subject: emailData.subject || '(No Subject)',
        html: emailData.html || `<p>${emailData.text || ''}</p>`,
        text: emailData.text || '',
        status: 'delivered',
        read: false,
        created_at: emailData.created_at || new Date().toISOString()
      };

      db.emails.unshift(inboundEmail);
      writeDb(db);
      return res.json({ success: true, action: 'inbound_saved', id: inboundEmail.id });
    }

    // Event 2: Status update for sent email
    if (payload?.type && payload.data?.email_id) {
      const emailId = payload.data.email_id;
      const found = db.emails.find(e => e.resend_id === emailId || e.id === emailId);
      if (found) {
        found.status = payload.type.replace('email.', '');
        writeDb(db);
        return res.json({ success: true, action: 'status_updated', status: found.status });
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// 7. Simulate Inbound Email
router.post('/emails/simulate-inbound', (req, res) => {
  const { account, from, subject, message } = req.body;
  const targetAccount = CONNECTED_ACCOUNTS.includes(account) ? account : CONNECTED_ACCOUNTS[0];

  const db = readDb();
  const simulated = {
    id: `sim-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    folder: 'inbox',
    account: targetAccount,
    from: from || 'Client Partner <partner@company.com>',
    to: [targetAccount],
    subject: subject || 'New Inquiry regarding Judad Services',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; padding: 16px; background: #ffffff;">
        <h3 style="color: #0f172a; margin-top: 0;">Hello ${targetAccount},</h3>
        <p>${(message || 'This is a test inbound email received by the system.').replace(/\n/g, '<br/>')}</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #64748b;">
          Sent to: <strong>${targetAccount}</strong> • Judad Mail System
        </p>
      </div>
    `,
    text: message || 'This is a test inbound email received by the system.',
    status: 'delivered',
    read: false,
    created_at: new Date().toISOString()
  };

  db.emails.unshift(simulated);
  writeDb(db);

  res.json({
    success: true,
    message: `টেস্ট ইমেইলটি সফলভাবে ${targetAccount} ইনবক্সে গ্রহণ করা হয়েছে!`,
    email: simulated
  });
});

// 8. Sync sent emails from Resend (STRICTLY for judadksa.com ONLY)
router.post('/emails/sync-resend', async (req, res) => {
  try {
    const listRes = await resend.emails.list();
    const liveEmails = listRes?.data?.data || [];
    const db = readDb();
    let importedCount = 0;
    let skippedOtherDomainsCount = 0;

    for (const item of liveEmails) {
      const fromLower = (item.from || '').toLowerCase();
      const toLower = Array.isArray(item.to) ? item.to.join(' ').toLowerCase() : (item.to || '').toLowerCase();

      const belongsToDomain = fromLower.includes(`@${DOMAIN.toLowerCase()}`) ||
                              toLower.includes(`@${DOMAIN.toLowerCase()}`);

      if (!belongsToDomain) {
        skippedOtherDomainsCount++;
        continue;
      }

      const exists = db.emails.find(e => e.resend_id === item.id || e.id === item.id);
      const matchedAcc = matchAccount(item.from) || matchAccount(toLower) || CONNECTED_ACCOUNTS[0];

      if (!exists) {
        db.emails.push({
          id: item.id,
          resend_id: item.id,
          folder: 'sent',
          account: matchedAcc,
          from: item.from,
          to: item.to,
          subject: item.subject || '(No Subject)',
          html: null,
          text: null,
          status: item.last_event || 'sent',
          read: true,
          created_at: item.created_at || new Date().toISOString()
        });
        importedCount++;
      } else {
        if (item.last_event && exists.status !== item.last_event) {
          exists.status = item.last_event;
        }
      }
    }

    writeDb(db);
    res.json({
      success: true,
      message: `Resend থেকে শুধুমাত্র ${DOMAIN} এর ${importedCount} টি ইমেইল সিঙ্ক হয়েছে (${skippedOtherDomainsCount} টি অন্য ডোমেইনের ইমেইল বাদ দেওয়া হয়েছে)`,
      domain: DOMAIN,
      importedCount,
      skippedOtherDomainsCount,
      totalResendEmails: liveEmails.length
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync with Resend' });
  }
});

// 9. Mark read / unread
router.patch('/emails/:id/read', (req, res) => {
  const { id } = req.params;
  const { read } = req.body;
  const db = readDb();
  const email = db.emails.find(e => e.id === id);

  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  email.read = typeof read === 'boolean' ? read : true;
  writeDb(db);

  res.json({ success: true, email });
});

// 10. Delete / Move to Trash
router.delete('/emails/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const index = db.emails.findIndex(e => e.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Email not found' });
  }

  const email = db.emails[index];
  if (email.folder === 'trash') {
    db.emails.splice(index, 1);
    writeDb(db);
    return res.json({ success: true, action: 'permanently_deleted' });
  } else {
    email.folder = 'trash';
    writeDb(db);
    return res.json({ success: true, action: 'moved_to_trash', email });
  }
});

// Mount router under multiple paths for local and Netlify Functions compatibility
app.use('/api', router);
app.use('/.netlify/functions/api', router);
app.use('/.netlify/functions/api/api', router);

// SPA fallback for frontend routes
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/.netlify')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// Start Server locally if executed directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 Judad KSA Mail Server running at: http://localhost:${PORT}`);
    console.log(`📧 Connected Accounts:`);
    CONNECTED_ACCOUNTS.forEach(acc => console.log(`   - ${acc}`));
    console.log(`🌐 Domain: ${DOMAIN}`);
    console.log(`🔗 Webhook URL: http://localhost:${PORT}/api/webhook`);
    console.log(`===============================================`);
  });
}

module.exports = app;
