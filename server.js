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

  for (const acc of CONNECTED_ACCOUNTS) {
    if (str.includes(acc.toLowerCase())) {
      return acc;
    }
  }

  if (str.includes(`@${DOMAIN.toLowerCase()}`)) {
    return CONNECTED_ACCOUNTS[0];
  }

  return null;
}

// Helper: Sync Inbound Emails from Resend Receiving API
let lastInboundSync = 0;
async function syncInboundFromResend(db, force = false) {
  const now = Date.now();
  if (!force && now - lastInboundSync < 6000) {
    return 0;
  }
  lastInboundSync = now;

  try {
    const listRes = await resend.emails.receiving.list();
    const liveEmails = listRes?.data?.data || [];
    let imported = 0;

    for (const item of liveEmails) {
      const fromLower = (item.from || '').toLowerCase();
      const toLower = Array.isArray(item.to) ? item.to.join(' ').toLowerCase() : (item.to || '').toLowerCase();

      // STRICT DOMAIN FILTER: Only judadksa.com
      const belongs = fromLower.includes(`@${DOMAIN.toLowerCase()}`) || toLower.includes(`@${DOMAIN.toLowerCase()}`);
      if (!belongs) continue;

      let existing = db.emails.find(e => e.id === item.id || e.resend_id === item.id);

      // If new OR if content is missing, fetch full content
      if (!existing || !existing.html || !existing.text) {
        let emailHtml = '';
        let emailText = '';
        try {
          const full = await resend.emails.receiving.get(item.id);
          if (full?.data) {
            emailHtml = full.data.html || '';
            emailText = full.data.text || '';
          }
        } catch (e) {
          console.error('Error fetching receiving email content:', e);
        }

        const matchedAcc = matchAccount(toLower) || matchAccount(fromLower) || CONNECTED_ACCOUNTS[0];

        if (!existing) {
          existing = {
            id: item.id,
            resend_id: item.id,
            folder: 'inbox',
            account: matchedAcc,
            from: item.from,
            to: Array.isArray(item.to) ? item.to : [item.to],
            subject: item.subject || '(No Subject)',
            html: emailHtml || `<p>${emailText || ''}</p>`,
            text: emailText || '',
            status: 'delivered',
            read: false,
            created_at: item.created_at || new Date().toISOString()
          };
          db.emails.unshift(existing);
          imported++;
        } else {
          existing.html = emailHtml || existing.html;
          existing.text = emailText || existing.text;
        }
      }
    }

    writeDb(db);
    return imported;
  } catch (err) {
    console.error('Inbound sync error:', err);
    return 0;
  }
}

// Helper: Sync Outbound Emails from Resend Emails API
let lastOutboundSync = 0;
async function syncOutboundFromResend(db, force = false) {
  const now = Date.now();
  if (!force && now - lastOutboundSync < 6000) {
    return 0;
  }
  lastOutboundSync = now;

  try {
    const listRes = await resend.emails.list();
    const liveEmails = listRes?.data?.data || [];
    let imported = 0;

    for (const item of liveEmails) {
      const fromLower = (item.from || '').toLowerCase();
      const toLower = Array.isArray(item.to) ? item.to.join(' ').toLowerCase() : (item.to || '').toLowerCase();

      const belongs = fromLower.includes(`@${DOMAIN.toLowerCase()}`) || toLower.includes(`@${DOMAIN.toLowerCase()}`);
      if (!belongs) continue;

      let existing = db.emails.find(e => e.id === item.id || e.resend_id === item.id);
      const matchedAcc = matchAccount(item.from) || matchAccount(toLower) || CONNECTED_ACCOUNTS[0];

      if (!existing) {
        existing = {
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
        };
        db.emails.unshift(existing);
        imported++;
      } else {
        if (item.last_event && existing.status !== item.last_event) {
          existing.status = item.last_event;
        }
      }
    }

    writeDb(db);
    return imported;
  } catch (err) {
    console.error('Outbound sync error:', err);
    return 0;
  }
}

// 1. Get Accounts and Stats
router.get('/accounts', async (req, res) => {
  const db = readDb();

  // Keep counts updated from Resend
  await syncInboundFromResend(db);

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

  if (folder === 'inbox') {
    await syncInboundFromResend(db);
  } else if (folder === 'sent') {
    await syncOutboundFromResend(db);
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

// 4. Get Single Email with full content fetching
router.get('/emails/:id', async (req, res) => {
  const { id } = req.params;
  const db = readDb();
  let email = db.emails.find(e => e.id === id || e.resend_id === id);

  // If not found in local db, try to fetch directly from Resend Receiving
  if (!email) {
    try {
      const rec = await resend.emails.receiving.get(id);
      if (rec?.data) {
        const toLower = Array.isArray(rec.data.to) ? rec.data.to.join(' ').toLowerCase() : (rec.data.to || '').toLowerCase();
        email = {
          id: rec.data.id,
          resend_id: rec.data.id,
          folder: 'inbox',
          account: matchAccount(toLower) || CONNECTED_ACCOUNTS[0],
          from: rec.data.from,
          to: rec.data.to,
          subject: rec.data.subject || '(No Subject)',
          html: rec.data.html || `<p>${rec.data.text || ''}</p>`,
          text: rec.data.text || '',
          status: 'delivered',
          read: true,
          created_at: rec.data.created_at || new Date().toISOString()
        };
        db.emails.unshift(email);
        writeDb(db);
      }
    } catch (e) {
      // Check Sent API
      try {
        const sent = await resend.emails.get(id);
        if (sent?.data) {
          email = {
            id: sent.data.id,
            resend_id: sent.data.id,
            folder: 'sent',
            account: matchAccount(sent.data.from) || CONNECTED_ACCOUNTS[0],
            from: sent.data.from,
            to: sent.data.to,
            subject: sent.data.subject || '(No Subject)',
            html: sent.data.html,
            text: sent.data.text,
            status: sent.data.last_event || 'sent',
            read: true,
            created_at: sent.data.created_at || new Date().toISOString()
          };
          db.emails.unshift(email);
          writeDb(db);
        }
      } catch (err) {}
    }
  }

  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  // Ensure content is populated if missing
  const resendId = email.resend_id || (email.id.startsWith('inbound-') || email.id.startsWith('sim-') ? null : email.id);
  if (resendId && (!email.html || !email.text || email.text.trim() === '')) {
    if (email.folder === 'inbox') {
      try {
        const liveRec = await resend.emails.receiving.get(resendId);
        if (liveRec?.data) {
          email.html = liveRec.data.html || email.html;
          email.text = liveRec.data.text || email.text;
          writeDb(db);
        }
      } catch (e) {}
    } else if (email.folder === 'sent') {
      try {
        const liveSent = await resend.emails.get(resendId);
        if (liveSent?.data) {
          email.html = liveSent.data.html || email.html;
          email.text = liveSent.data.text || email.text;
          email.status = liveSent.data.last_event || email.status;
          writeDb(db);
        }
      } catch (e) {}
    }
  }

  if (!email.read) {
    email.read = true;
    writeDb(db);
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
      message: 'Email sent successfully!',
      email: newSentEmail,
      resendResponse: result.data
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: error.message || 'Internal server error while sending email' });
  }
});

// 6. Webhook Endpoint for Resend (Inbound and Event delivery updates)
router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    const db = readDb();

    // Event 1: Inbound Email (email.received or email.inbound)
    if (payload?.type === 'email.inbound' || payload?.type === 'email.received' || payload?.email) {
      const emailData = payload.data || payload;
      const emailId = emailData.email_id || emailData.id;
      const recipient = Array.isArray(emailData.to) ? emailData.to[0] : (emailData.to || '');
      const matchedAcc = matchAccount(recipient);

      if (!matchedAcc) {
        return res.json({ ignored: true, reason: `Recipient not belonging to ${DOMAIN}` });
      }

      let emailHtml = emailData.html || '';
      let emailText = emailData.text || '';

      // Fetch actual message body from Resend Receiving API
      if (emailId) {
        try {
          const fullEmail = await resend.emails.receiving.get(emailId);
          if (fullEmail?.data) {
            emailHtml = fullEmail.data.html || emailHtml;
            emailText = fullEmail.data.text || emailText;
          }
        } catch (err) {
          console.error('Error fetching inbound email content in webhook:', err);
        }
      }

      // Check if already in db
      const existing = db.emails.find(e => (emailId && (e.id === emailId || e.resend_id === emailId)));
      if (existing) {
        existing.html = emailHtml || existing.html;
        existing.text = emailText || existing.text;
        writeDb(db);
        return res.json({ success: true, action: 'inbound_updated', id: existing.id });
      }

      const inboundEmail = {
        id: emailId || `inbound-${Date.now()}`,
        resend_id: emailId,
        folder: 'inbox',
        account: matchedAcc,
        from: emailData.from || 'Unknown Sender',
        to: Array.isArray(emailData.to) ? emailData.to : [emailData.to],
        subject: emailData.subject || '(No Subject)',
        html: emailHtml || `<p>${emailText || ''}</p>`,
        text: emailText || '',
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
    message: `Test email successfully received into ${targetAccount} inbox!`,
    email: simulated
  });
});

// 8. Sync sent AND received emails from Resend (STRICTLY for judadksa.com ONLY)
router.post('/emails/sync-resend', async (req, res) => {
  try {
    const db = readDb();
    const inboundCount = await syncInboundFromResend(db, true);
    const outboundCount = await syncOutboundFromResend(db, true);

    res.json({
      success: true,
      message: `Successfully synced ${inboundCount} inbox and ${outboundCount} sent emails with content from Resend`,
      domain: DOMAIN,
      inboundCount,
      outboundCount
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
