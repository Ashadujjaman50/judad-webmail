const path = require('path');
const fs = require('fs');

// Check if running in a serverless environment (Netlify, AWS Lambda)
const isServerless = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);

const DATA_DIR = isServerless ? '/tmp' : path.join(__dirname, 'data');
const SQLITE_FILE = path.join(DATA_DIR, 'judadmail.db');
const JSON_FILE = path.join(DATA_DIR, 'emails.json');
const READ_STATUS_FILE = path.join(DATA_DIR, 'read_status.json');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory:', err);
  }
}

// In-memory fallback structures in case SQLite is not available
let sqliteDb = null;
let useSqlite = false;

// Known demo/test IDs to permanently exclude in live production
const DEMO_EMAIL_IDS = new Set([
  'b86ba276-22a5-494e-9c80-be22c692ce55'
]);

function isDemoEmail(id, subject = '', text = '') {
  if (!id) return false;
  if (DEMO_EMAIL_IDS.has(id)) return true;
  if (id.startsWith('sim-') || id.startsWith('test-')) return true;
  const subj = (subject || '').toLowerCase().trim();
  const txt = (text || '').toLowerCase().trim();
  if (subj === 'test mail' && txt.includes('hello bangladesh')) {
    return true;
  }
  return false;
}

// Attempt to initialize SQLite (Node 22.5+ node:sqlite DatabaseSync)
try {
  const { DatabaseSync } = require('node:sqlite');
  sqliteDb = new DatabaseSync(SQLITE_FILE);
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      resend_id TEXT,
      folder TEXT,
      account TEXT,
      from_addr TEXT,
      to_addr TEXT,
      subject TEXT,
      html TEXT,
      text TEXT,
      status TEXT,
      read INTEGER DEFAULT 0,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS read_status (
      id TEXT PRIMARY KEY,
      is_read INTEGER DEFAULT 0,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder);
    CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account);
    CREATE INDEX IF NOT EXISTS idx_emails_read ON emails(read);
    CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
    CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at);
  `);
  useSqlite = true;

  // Purge any demo/test emails from SQLite database
  try {
    sqliteDb.prepare("DELETE FROM emails WHERE id = 'b86ba276-22a5-494e-9c80-be22c692ce55' OR id LIKE 'sim-%' OR id LIKE 'test-%'").run();
    sqliteDb.prepare("DELETE FROM read_status WHERE id = 'b86ba276-22a5-494e-9c80-be22c692ce55' OR id LIKE 'sim-%' OR id LIKE 'test-%'").run();
  } catch (e) {}

  console.log(`[Database] SQLite initialized successfully at: ${SQLITE_FILE}`);
} catch (err) {
  useSqlite = false;
  console.warn(`[Database] SQLite not available, using JSON file store: ${err.message}`);
}

// JSON Fallback Helpers
function loadReadStatusMap() {
  try {
    if (fs.existsSync(READ_STATUS_FILE)) {
      const map = JSON.parse(fs.readFileSync(READ_STATUS_FILE, 'utf-8'));
      // Clean demo IDs from map
      for (const id of Object.keys(map)) {
        if (isDemoEmail(id)) delete map[id];
      }
      return map;
    }
  } catch (e) {}
  return {};
}

function saveReadStatusMap(map) {
  try {
    fs.writeFileSync(READ_STATUS_FILE, JSON.stringify(map, null, 2), 'utf-8');
  } catch (e) {}
}

function loadJsonEmails() {
  try {
    if (fs.existsSync(JSON_FILE)) {
      const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
      if (Array.isArray(data.emails)) {
        return data.emails.filter(e => !isDemoEmail(e.id, e.subject, e.text));
      }
    }
  } catch (e) {}
  return [];
}

function saveJsonEmails(emails) {
  try {
    const cleanList = emails.filter(e => !isDemoEmail(e.id, e.subject, e.text));
    fs.writeFileSync(JSON_FILE, JSON.stringify({ emails: cleanList }, null, 2), 'utf-8');
  } catch (e) {}
}

// Map SQLite row to standard email object
function rowToEmail(row) {
  if (!row) return null;
  let to = [];
  try {
    to = JSON.parse(row.to_addr);
  } catch (e) {
    to = row.to_addr ? [row.to_addr] : [];
  }
  return {
    id: row.id,
    resend_id: row.resend_id || row.id,
    folder: row.folder || 'inbox',
    account: row.account,
    from: row.from_addr,
    to: to,
    subject: row.subject || '(No Subject)',
    html: row.html || '',
    text: row.text || '',
    status: row.status || 'delivered',
    read: row.read === 1,
    created_at: row.created_at || new Date().toISOString()
  };
}

// Map email object to SQLite params
function emailToRow(email) {
  return {
    id: email.id,
    resend_id: email.resend_id || email.id,
    folder: email.folder || 'inbox',
    account: email.account || '',
    from_addr: email.from || '',
    to_addr: JSON.stringify(Array.isArray(email.to) ? email.to : (email.to ? [email.to] : [])),
    subject: email.subject || '(No Subject)',
    html: email.html || '',
    text: email.text || '',
    status: email.status || 'delivered',
    read: email.read ? 1 : 0,
    created_at: email.created_at || new Date().toISOString()
  };
}

/**
 * Get read status for an email ID
 */
function getReadStatus(id) {
  if (!id || isDemoEmail(id)) return null;

  if (useSqlite) {
    try {
      const row = sqliteDb.prepare('SELECT is_read FROM read_status WHERE id = ?').get(id);
      if (row) return row.is_read === 1;
    } catch (e) {
      console.error('Error fetching read_status from SQLite:', e);
    }
  }

  const map = loadReadStatusMap();
  if (typeof map[id] === 'boolean') {
    return map[id];
  }
  return null;
}

/**
 * Set read status for an email ID
 */
function setReadStatus(id, isRead) {
  if (!id || isDemoEmail(id)) return;
  const numVal = isRead ? 1 : 0;
  const now = new Date().toISOString();

  if (useSqlite) {
    try {
      sqliteDb.prepare(`
        INSERT INTO read_status (id, is_read, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET is_read = excluded.is_read, updated_at = excluded.updated_at
      `).run(id, numVal, now);

      sqliteDb.prepare(`
        UPDATE emails SET read = ? WHERE id = ? OR resend_id = ?
      `).run(numVal, id, id);
    } catch (e) {
      console.error('Error setting read_status in SQLite:', e);
    }
  }

  const map = loadReadStatusMap();
  map[id] = !!isRead;
  saveReadStatusMap(map);

  const jsonEmails = loadJsonEmails();
  let modified = false;
  for (const e of jsonEmails) {
    if (e.id === id || e.resend_id === id) {
      e.read = !!isRead;
      modified = true;
    }
  }
  if (modified) {
    saveJsonEmails(jsonEmails);
  }
}

/**
 * Batch set read status
 */
function batchSetReadStatus(readIds = [], unreadIds = []) {
  const now = new Date().toISOString();

  if (useSqlite) {
    try {
      const upsert = sqliteDb.prepare(`
        INSERT INTO read_status (id, is_read, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET is_read = excluded.is_read, updated_at = excluded.updated_at
      `);
      const updateEmail = sqliteDb.prepare(`
        UPDATE emails SET read = ? WHERE id = ? OR resend_id = ?
      `);

      for (const id of readIds) {
        if (!id || isDemoEmail(id)) continue;
        upsert.run(id, 1, now);
        updateEmail.run(1, id, id);
      }

      for (const id of unreadIds) {
        if (!id || isDemoEmail(id)) continue;
        upsert.run(id, 0, now);
        updateEmail.run(0, id, id);
      }
    } catch (e) {
      console.error('Error batch setting read status in SQLite:', e);
    }
  }

  const map = loadReadStatusMap();
  for (const id of readIds) if (id && !isDemoEmail(id)) map[id] = true;
  for (const id of unreadIds) if (id && !isDemoEmail(id)) map[id] = false;
  saveReadStatusMap(map);

  const jsonEmails = loadJsonEmails();
  let modified = false;
  for (const e of jsonEmails) {
    if (readIds.includes(e.id) || (e.resend_id && readIds.includes(e.resend_id))) {
      e.read = true;
      modified = true;
    } else if (unreadIds.includes(e.id) || (e.resend_id && unreadIds.includes(e.resend_id))) {
      e.read = false;
      modified = true;
    }
  }
  if (modified) {
    saveJsonEmails(jsonEmails);
  }
}

/**
 * Get all clean emails (strictly excludes demo emails)
 */
function getAllEmails() {
  if (useSqlite) {
    try {
      const rows = sqliteDb.prepare('SELECT * FROM emails ORDER BY created_at DESC').all();
      return rows.map(rowToEmail).filter(e => !isDemoEmail(e.id, e.subject, e.text));
    } catch (e) {
      console.error('Error getting all emails from SQLite:', e);
    }
  }

  return loadJsonEmails();
}

/**
 * Get email by ID or Resend ID
 */
function getEmailById(id) {
  if (!id || isDemoEmail(id)) return null;

  if (useSqlite) {
    try {
      const row = sqliteDb.prepare('SELECT * FROM emails WHERE (id = ? OR resend_id = ?) LIMIT 1').get(id, id);
      if (row && !isDemoEmail(row.id, row.subject, row.text)) {
        return rowToEmail(row);
      }
    } catch (e) {
      console.error('Error getting email by ID from SQLite:', e);
    }
  }

  const list = loadJsonEmails();
  return list.find(e => (e.id === id || e.resend_id === id) && !isDemoEmail(e.id, e.subject, e.text)) || null;
}

/**
 * Upsert email (Strictly blocks demo emails, preserves read status)
 */
function upsertEmail(emailData) {
  if (!emailData || !emailData.id || isDemoEmail(emailData.id, emailData.subject, emailData.text)) {
    return null;
  }

  const existingRead = getReadStatus(emailData.id) ?? getReadStatus(emailData.resend_id);
  let finalRead = false;
  if (existingRead !== null) {
    finalRead = existingRead;
  } else if (typeof emailData.read === 'boolean') {
    finalRead = emailData.read;
  }

  const normalized = {
    ...emailData,
    read: finalRead
  };

  if (useSqlite) {
    try {
      const row = emailToRow(normalized);
      sqliteDb.prepare(`
        INSERT INTO emails (
          id, resend_id, folder, account, from_addr, to_addr, subject, html, text, status, read, created_at
        ) VALUES (
          @id, @resend_id, @folder, @account, @from_addr, @to_addr, @subject, @html, @text, @status, @read, @created_at
        ) ON CONFLICT(id) DO UPDATE SET
          folder = excluded.folder,
          account = excluded.account,
          from_addr = excluded.from_addr,
          to_addr = excluded.to_addr,
          subject = excluded.subject,
          html = CASE WHEN excluded.html != '' THEN excluded.html ELSE emails.html END,
          text = CASE WHEN excluded.text != '' THEN excluded.text ELSE emails.text END,
          status = excluded.status,
          read = excluded.read
      `).run(row);
    } catch (e) {
      console.error('Error upserting email into SQLite:', e);
    }
  }

  const jsonEmails = loadJsonEmails();
  const idx = jsonEmails.findIndex(e => e.id === normalized.id || (e.resend_id && e.resend_id === normalized.resend_id));
  if (idx >= 0) {
    jsonEmails[idx] = {
      ...jsonEmails[idx],
      ...normalized,
      html: normalized.html || jsonEmails[idx].html,
      text: normalized.text || jsonEmails[idx].text,
      read: finalRead
    };
  } else {
    jsonEmails.unshift(normalized);
  }
  saveJsonEmails(jsonEmails);

  return normalized;
}

/**
 * Update email folder (e.g. move to trash or outbox)
 */
function updateEmailFolder(id, folder) {
  if (!id) return false;

  if (useSqlite) {
    try {
      sqliteDb.prepare('UPDATE emails SET folder = ? WHERE id = ? OR resend_id = ?').run(folder, id, id);
    } catch (e) {
      console.error('Error updating email folder in SQLite:', e);
    }
  }

  const jsonEmails = loadJsonEmails();
  let modified = false;
  for (const e of jsonEmails) {
    if (e.id === id || e.resend_id === id) {
      e.folder = folder;
      modified = true;
    }
  }
  if (modified) saveJsonEmails(jsonEmails);
  return true;
}

/**
 * Update email status (e.g. sent, bounced, failed)
 */
function updateEmailStatus(id, status, folder = null) {
  if (!id) return false;

  if (useSqlite) {
    try {
      if (folder) {
        sqliteDb.prepare('UPDATE emails SET status = ?, folder = ? WHERE id = ? OR resend_id = ?').run(status, folder, id, id);
      } else {
        sqliteDb.prepare('UPDATE emails SET status = ? WHERE id = ? OR resend_id = ?').run(status, id, id);
      }
    } catch (e) {
      console.error('Error updating email status in SQLite:', e);
    }
  }

  const jsonEmails = loadJsonEmails();
  let modified = false;
  for (const e of jsonEmails) {
    if (e.id === id || e.resend_id === id) {
      e.status = status;
      if (folder) e.folder = folder;
      modified = true;
    }
  }
  if (modified) saveJsonEmails(jsonEmails);
  return true;
}

/**
 * Permanently delete email
 */
function deleteEmailPermanently(id) {
  if (!id) return false;

  if (useSqlite) {
    try {
      sqliteDb.prepare('DELETE FROM emails WHERE id = ? OR resend_id = ?').run(id, id);
    } catch (e) {
      console.error('Error deleting email in SQLite:', e);
    }
  }

  let jsonEmails = loadJsonEmails();
  const beforeLen = jsonEmails.length;
  jsonEmails = jsonEmails.filter(e => e.id !== id && e.resend_id !== id);
  if (jsonEmails.length !== beforeLen) {
    saveJsonEmails(jsonEmails);
  }
  return true;
}

/**
 * Mark all emails in a folder (or account) as read
 */
function markAllRead(folder = 'inbox', account = 'all') {
  const all = getAllEmails();
  const readIds = [];

  for (const e of all) {
    if (folder && e.folder !== folder) continue;
    if (account && account !== 'all' && e.account.toLowerCase() !== account.toLowerCase()) continue;
    if (!e.read) {
      readIds.push(e.id);
    }
  }

  if (readIds.length > 0) {
    batchSetReadStatus(readIds, []);
  }

  return readIds.length;
}

// Initial cleanup of JSON on startup
saveJsonEmails(loadJsonEmails());

module.exports = {
  isServerless,
  useSqlite,
  isDemoEmail,
  getReadStatus,
  setReadStatus,
  batchSetReadStatus,
  getAllEmails,
  getEmailById,
  upsertEmail,
  updateEmailFolder,
  updateEmailStatus,
  deleteEmailPermanently,
  markAllRead
};
