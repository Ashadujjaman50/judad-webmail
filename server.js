require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { Resend } = require('resend');
const db = require('./db');

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

// Helper: Sync Inbound Emails from Resend Receiving API (Excludes Demo Emails)
let lastInboundSync = 0;
async function syncInboundFromResend(force = false) {
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
      // Exclude demo/test emails
      if (db.isDemoEmail(item.id, item.subject)) continue;

      const fromLower = (item.from || '').toLowerCase();
      const toLower = Array.isArray(item.to) ? item.to.join(' ').toLowerCase() : (item.to || '').toLowerCase();

      // STRICT DOMAIN FILTER: Only judadksa.com
      const belongs = fromLower.includes(`@${DOMAIN.toLowerCase()}`) || toLower.includes(`@${DOMAIN.toLowerCase()}`);
      if (!belongs) continue;

      let existing = db.getEmailById(item.id);

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
          const wasRead = db.getReadStatus(item.id);
          const emailToSave = {
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
            read: wasRead === true ? true : false,
            created_at: item.created_at || new Date().toISOString()
          };
          db.upsertEmail(emailToSave);
          imported++;
        } else {
          existing.html = emailHtml || existing.html;
          existing.text = emailText || existing.text;
          db.upsertEmail(existing);
        }
      }
    }

    return imported;
  } catch (err) {
    console.error('Inbound sync error:', err);
    return 0;
  }
}

// Helper: Sync Outbound Emails from Resend Emails API
let lastOutboundSync = 0;
async function syncOutboundFromResend(force = false) {
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
      if (db.isDemoEmail(item.id, item.subject)) continue;

      const fromLower = (item.from || '').toLowerCase();
      const toLower = Array.isArray(item.to) ? item.to.join(' ').toLowerCase() : (item.to || '').toLowerCase();

      const belongs = fromLower.includes(`@${DOMAIN.toLowerCase()}`) || toLower.includes(`@${DOMAIN.toLowerCase()}`);
      if (!belongs) continue;

      let existing = db.getEmailById(item.id);
      const matchedAcc = matchAccount(item.from) || matchAccount(toLower) || CONNECTED_ACCOUNTS[0];

      const status = item.last_event || 'sent';
      const isOutboxStatus = status === 'bounced' || status === 'failed' || status === 'delivery_delayed';

      if (!existing) {
        const wasRead = db.getReadStatus(item.id);
        const emailToSave = {
          id: item.id,
          resend_id: item.id,
          folder: isOutboxStatus ? 'outbox' : 'sent',
          account: matchedAcc,
          from: item.from,
          to: item.to,
          subject: item.subject || '(No Subject)',
          html: null,
          text: null,
          status: status,
          read: wasRead !== null ? wasRead : true,
          created_at: item.created_at || new Date().toISOString()
        };
        db.upsertEmail(emailToSave);
        imported++;
      } else {
        if (item.last_event && existing.status !== item.last_event) {
          existing.status = item.last_event;
          if (isOutboxStatus && existing.folder !== 'trash') {
            existing.folder = 'outbox';
          }
          db.upsertEmail(existing);
        }
      }
    }

    return imported;
  } catch (err) {
    console.error('Outbound sync error:', err);
    return 0;
  }
}

// 1. Get Accounts and Stats (Including Outbox with Bounced/Failed)
router.get('/accounts', async (req, res) => {
  // Keep counts updated from Resend
  await syncInboundFromResend();

  const allEmails = db.getAllEmails();

  const accountsData = CONNECTED_ACCOUNTS.map(email => {
    const unreadInbox = allEmails.filter(
      e => e.folder === 'inbox' && (e.account || '').toLowerCase() === email.toLowerCase() && !e.read
    ).length;
    const totalInbox = allEmails.filter(
      e => e.folder === 'inbox' && (e.account || '').toLowerCase() === email.toLowerCase()
    ).length;

    const totalSent = allEmails.filter(
      e => e.folder === 'sent' && (e.account || '').toLowerCase() === email.toLowerCase() && e.status !== 'bounced' && e.status !== 'failed'
    ).length;
    const unreadSent = allEmails.filter(
      e => e.folder === 'sent' && (e.account || '').toLowerCase() === email.toLowerCase() && !e.read && e.status !== 'bounced' && e.status !== 'failed'
    ).length;

    const totalOutbox = allEmails.filter(
      e => (e.account || '').toLowerCase() === email.toLowerCase() && e.folder !== 'trash' &&
           (e.folder === 'outbox' || e.status === 'bounced' || e.status === 'failed' || e.status === 'delivery_delayed')
    ).length;
    const unreadOutbox = allEmails.filter(
      e => (e.account || '').toLowerCase() === email.toLowerCase() && !e.read && e.folder !== 'trash' &&
           (e.folder === 'outbox' || e.status === 'bounced' || e.status === 'failed' || e.status === 'delivery_delayed')
    ).length;

    let role = 'General Info';
    if (email.startsWith('admin')) role = 'Administrator';
    if (email.startsWith('support')) role = 'Customer Support';

    return {
      email,
      role,
      unreadInbox,
      totalInbox,
      totalSent,
      unreadSent,
      totalOutbox,
      unreadOutbox
    };
  });

  const allUnreadInbox = allEmails.filter(e => e.folder === 'inbox' && !e.read).length;
  const allInbox = allEmails.filter(e => e.folder === 'inbox').length;

  const allSent = allEmails.filter(e => e.folder === 'sent' && e.status !== 'bounced' && e.status !== 'failed').length;
  const allUnreadSent = allEmails.filter(e => e.folder === 'sent' && !e.read && e.status !== 'bounced' && e.status !== 'failed').length;

  const allOutbox = allEmails.filter(e =>
    e.folder !== 'trash' && (e.folder === 'outbox' || e.status === 'bounced' || e.status === 'failed' || e.status === 'delivery_delayed')
  ).length;
  const allUnreadOutbox = allEmails.filter(e =>
    !e.read && e.folder !== 'trash' && (e.folder === 'outbox' || e.status === 'bounced' || e.status === 'failed' || e.status === 'delivery_delayed')
  ).length;

  const allTrash = allEmails.filter(e => e.folder === 'trash').length;
  const allUnreadTrash = allEmails.filter(e => e.folder === 'trash' && !e.read).length;

  res.json({
    accounts: accountsData,
    domain: DOMAIN,
    totals: {
      unreadInbox: allUnreadInbox,
      inbox: allInbox,
      totalInbox: allInbox,
      unreadSent: allUnreadSent,
      sent: allSent,
      totalSent: allSent,
      unreadOutbox: allUnreadOutbox,
      outbox: allOutbox,
      totalOutbox: allOutbox,
      unreadTrash: allUnreadTrash,
      trash: allTrash,
      totalTrash: allTrash
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

// 3. Get Emails (Inbox, Sent, Outbox, Trash) with filters
router.get('/emails', async (req, res) => {
  const { folder = 'inbox', account = 'all', search = '' } = req.query;

  if (folder === 'inbox') {
    await syncInboundFromResend();
  } else if (folder === 'sent' || folder === 'outbox') {
    await syncOutboundFromResend();
  }

  let all = db.getAllEmails();
  let list = [];

  if (folder === 'outbox') {
    // Outbox: Bounced, Failed, or Queued emails
    list = all.filter(e =>
      e.folder !== 'trash' && (e.folder === 'outbox' || e.status === 'bounced' || e.status === 'failed' || e.status === 'delivery_delayed')
    );
  } else if (folder === 'sent') {
    // Sent: Clean sent/delivered emails (excluding bounced/failed)
    list = all.filter(e =>
      e.folder === 'sent' && e.status !== 'bounced' && e.status !== 'failed'
    );
  } else if (folder === 'trash') {
    list = all.filter(e => e.folder === 'trash');
  } else {
    // inbox
    list = all.filter(e => e.folder === 'inbox');
  }

  if (account && account !== 'all') {
    list = list.filter(e => (e.account || '').toLowerCase() === account.toLowerCase());
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

  const unreadCount = list.filter(e => !e.read).length;

  res.json({
    folder,
    account,
    count: list.length,
    unreadCount,
    emails: list
  });
});

// 4. Get Single Email with full content fetching
router.get('/emails/:id', async (req, res) => {
  const { id } = req.params;
  let email = db.getEmailById(id);

  // If not found in local db, try to fetch directly from Resend Receiving
  if (!email) {
    try {
      const rec = await resend.emails.receiving.get(id);
      if (rec?.data && !db.isDemoEmail(rec.data.id, rec.data.subject)) {
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
        db.upsertEmail(email);
        db.setReadStatus(email.id, true);
      }
    } catch (e) {
      // Check Sent API
      try {
        const sent = await resend.emails.get(id);
        if (sent?.data && !db.isDemoEmail(sent.data.id, sent.data.subject)) {
          const status = sent.data.last_event || 'sent';
          const isOutbox = status === 'bounced' || status === 'failed';
          email = {
            id: sent.data.id,
            resend_id: sent.data.id,
            folder: isOutbox ? 'outbox' : 'sent',
            account: matchAccount(sent.data.from) || CONNECTED_ACCOUNTS[0],
            from: sent.data.from,
            to: sent.data.to,
            subject: sent.data.subject || '(No Subject)',
            html: sent.data.html,
            text: sent.data.text,
            status: status,
            read: true,
            created_at: sent.data.created_at || new Date().toISOString()
          };
          db.upsertEmail(email);
          db.setReadStatus(email.id, true);
        }
      } catch (err) {}
    }
  }

  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  // Ensure content is populated if missing
  const resendId = email.resend_id || (email.id.startsWith('inbound-') || email.id.startsWith('sent-') ? null : email.id);
  if (resendId && (!email.html || !email.text || email.text.trim() === '')) {
    if (email.folder === 'inbox') {
      try {
        const liveRec = await resend.emails.receiving.get(resendId);
        if (liveRec?.data) {
          email.html = liveRec.data.html || email.html;
          email.text = liveRec.data.text || email.text;
          db.upsertEmail(email);
        }
      } catch (e) {}
    } else if (email.folder === 'sent' || email.folder === 'outbox') {
      try {
        const liveSent = await resend.emails.get(resendId);
        if (liveSent?.data) {
          email.html = liveSent.data.html || email.html;
          email.text = liveSent.data.text || email.text;
          email.status = liveSent.data.last_event || email.status;
          db.upsertEmail(email);
        }
      } catch (e) {}
    }
  }

  // Automatically mark as read when user opens the email
  if (!email.read) {
    email.read = true;
    db.setReadStatus(email.id, true);
    db.upsertEmail(email);
  }

  res.json({ email });
});

// 5. Send Email via Resend (Preserves failed attempts in Outbox for safe retry)
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

      // Save to Outbox as Failed so user does NOT lose work and can retry
      const failedEmail = {
        id: `failed-${Date.now()}`,
        resend_id: null,
        folder: 'outbox',
        account: senderEmail,
        from: formattedFrom,
        to: payload.to,
        subject,
        html: payload.html,
        text: payload.text,
        status: 'failed',
        read: false,
        created_at: new Date().toISOString()
      };
      db.upsertEmail(failedEmail);

      return res.status(400).json({
        error: result.error.message || 'Resend API error',
        email: failedEmail,
        savedToOutbox: true
      });
    }

    const resendId = result.data?.id;

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

    db.upsertEmail(newSentEmail);
    db.setReadStatus(newSentEmail.id, true);

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

// 6. Resend Email (For Bounced or Failed emails in Outbox)
router.post('/emails/:id/resend', async (req, res) => {
  try {
    const { id } = req.params;
    const email = db.getEmailById(id);

    if (!email) {
      return res.status(404).json({ error: 'Email not found to resend' });
    }

    const senderEmail = matchAccount(email.from) || CONNECTED_ACCOUNTS[0];
    let formattedFrom = email.from;
    if (!formattedFrom || !formattedFrom.includes('<')) {
      let displayName = 'Judad KSA';
      if (senderEmail.startsWith('admin')) displayName = 'Judad Admin';
      else if (senderEmail.startsWith('support')) displayName = 'Judad Support';
      else displayName = 'Judad Info';
      formattedFrom = `"${displayName}" <${senderEmail}>`;
    }

    const payload = {
      from: formattedFrom,
      to: Array.isArray(email.to) ? email.to : [email.to],
      subject: email.subject,
      html: email.html || `<p>${(email.text || '').replace(/\n/g, '<br/>')}</p>`,
      text: email.text || ''
    };

    const result = await resend.emails.send(payload);

    if (result.error) {
      email.status = 'failed';
      email.folder = 'outbox';
      db.upsertEmail(email);
      return res.status(400).json({
        error: result.error.message || 'Resend delivery failed',
        email
      });
    }

    // Success: Move from Outbox to Sent
    email.resend_id = result.data?.id || email.resend_id;
    email.folder = 'sent';
    email.status = 'sent';
    email.created_at = new Date().toISOString();
    db.upsertEmail(email);

    res.json({
      success: true,
      message: 'Email resent successfully and moved to Sent!',
      email,
      resendResponse: result.data
    });
  } catch (error) {
    console.error('Error resending email:', error);
    res.status(500).json({ error: error.message || 'Failed to resend email' });
  }
});

// 7. Webhook Endpoint for Resend (Inbound and Event delivery updates including Bounced/Failed)
router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;

    // Event 1: Inbound Email (email.received or email.inbound)
    if (payload?.type === 'email.inbound' || payload?.type === 'email.received' || payload?.email) {
      const emailData = payload.data || payload;
      const emailId = emailData.email_id || emailData.id;

      if (db.isDemoEmail(emailId, emailData.subject)) {
        return res.json({ ignored: true, reason: 'Demo email blocked' });
      }

      const recipient = Array.isArray(emailData.to) ? emailData.to[0] : (emailData.to || '');
      const matchedAcc = matchAccount(recipient);

      if (!matchedAcc) {
        return res.json({ ignored: true, reason: `Recipient not belonging to ${DOMAIN}` });
      }

      let emailHtml = emailData.html || '';
      let emailText = emailData.text || '';

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

      const existing = db.getEmailById(emailId);
      if (existing) {
        existing.html = emailHtml || existing.html;
        existing.text = emailText || existing.text;
        db.upsertEmail(existing);
        return res.json({ success: true, action: 'inbound_updated', id: existing.id });
      }

      const wasRead = db.getReadStatus(emailId);

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
        read: wasRead === true ? true : false,
        created_at: emailData.created_at || new Date().toISOString()
      };

      db.upsertEmail(inboundEmail);
      return res.json({ success: true, action: 'inbound_saved', id: inboundEmail.id });
    }

    // Event 2: Status update for sent email (e.g. email.bounced, email.delivered, email.failed)
    if (payload?.type && payload.data?.email_id) {
      const emailId = payload.data.email_id;
      const found = db.getEmailById(emailId);
      if (found) {
        const eventType = payload.type.replace('email.', '');
        found.status = eventType;
        if (eventType === 'bounced' || eventType === 'failed') {
          found.folder = 'outbox';
        }
        db.upsertEmail(found);
        return res.json({ success: true, action: 'status_updated', status: found.status, folder: found.folder });
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// 8. Sync sent AND received emails from Resend (STRICTLY for judadksa.com ONLY)
router.post('/emails/sync-resend', async (req, res) => {
  try {
    const inboundCount = await syncInboundFromResend(true);
    const outboundCount = await syncOutboundFromResend(true);

    res.json({
      success: true,
      message: `Successfully synced ${inboundCount} inbox and ${outboundCount} sent emails from Resend`,
      domain: DOMAIN,
      inboundCount,
      outboundCount
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync with Resend' });
  }
});

// 9. Mark single email read / unread
router.patch('/emails/:id/read', (req, res) => {
  const { id } = req.params;
  const { read } = req.body;
  const isRead = typeof read === 'boolean' ? read : true;

  db.setReadStatus(id, isRead);

  const email = db.getEmailById(id);
  if (!email) {
    return res.json({ success: true, id, read: isRead });
  }

  email.read = isRead;
  db.upsertEmail(email);

  res.json({ success: true, email });
});

// 10. Client LocalStorage Read State Synchronization
router.post('/emails/sync-read-states', (req, res) => {
  const { readIds = [], unreadIds = [] } = req.body;
  db.batchSetReadStatus(readIds, unreadIds);
  res.json({
    success: true,
    message: `Synced ${readIds.length} read and ${unreadIds.length} unread states`
  });
});

// 11. Mark all emails in a folder / account as read
router.post('/emails/mark-all-read', (req, res) => {
  const { folder = 'inbox', account = 'all' } = req.body;
  const count = db.markAllRead(folder, account);
  res.json({
    success: true,
    message: `Marked ${count} emails as read in ${folder}`,
    count
  });
});

// 12. Delete / Move to Trash
router.delete('/emails/:id', (req, res) => {
  const { id } = req.params;
  const email = db.getEmailById(id);

  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  if (email.folder === 'trash') {
    db.deleteEmailPermanently(id);
    return res.json({ success: true, action: 'permanently_deleted' });
  } else {
    db.updateEmailFolder(id, 'trash');
    email.folder = 'trash';
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
    console.log(`💾 Database: ${db.useSqlite ? 'SQLite (node:sqlite)' : 'JSON file fallback'}`);
    console.log(`🔗 Webhook URL: http://localhost:${PORT}/api/webhook`);
    console.log(`===============================================`);
  });
}

module.exports = app;
