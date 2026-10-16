/**
 * Judad KSA Webmail Client Application
 * Connects info@judadksa.com, admin@judadksa.com, support@judadksa.com via Resend API
 */

(function () {
  'use strict';

  // LocalStorage Keys for Indestructible Read/Unread State Persistence
  const STORAGE_READ_KEY = 'judad_read_emails_v1';
  const STORAGE_UNREAD_KEY = 'judad_unread_emails_v1';

  function getStoredReadIds() {
    try {
      const raw = localStorage.getItem(STORAGE_READ_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  function saveStoredReadIds(set) {
    try {
      localStorage.setItem(STORAGE_READ_KEY, JSON.stringify(Array.from(set)));
    } catch (e) {}
  }

  function getStoredUnreadIds() {
    try {
      const raw = localStorage.getItem(STORAGE_UNREAD_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  function saveStoredUnreadIds(set) {
    try {
      localStorage.setItem(STORAGE_UNREAD_KEY, JSON.stringify(Array.from(set)));
    } catch (e) {}
  }

  function markEmailAsReadInStorage(id) {
    if (!id) return;
    const readSet = getStoredReadIds();
    const unreadSet = getStoredUnreadIds();
    readSet.add(id);
    unreadSet.delete(id);
    saveStoredReadIds(readSet);
    saveStoredUnreadIds(unreadSet);
  }

  function markEmailAsUnreadInStorage(id) {
    if (!id) return;
    const readSet = getStoredReadIds();
    const unreadSet = getStoredUnreadIds();
    readSet.delete(id);
    unreadSet.add(id);
    saveStoredReadIds(readSet);
    saveStoredUnreadIds(unreadSet);
  }

  async function syncClientReadStatesWithServer() {
    const readSet = getStoredReadIds();
    const unreadSet = getStoredUnreadIds();
    if (readSet.size === 0 && unreadSet.size === 0) return;

    try {
      await fetch('/api/emails/sync-read-states', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          readIds: Array.from(readSet),
          unreadIds: Array.from(unreadSet)
        })
      });
    } catch (e) {}
  }

  // Format new unread / Total count badge
  function formatBadgeHtml(unread, total) {
    return `
      <span class="badge-unread">${unread}</span>
      <span class="badge-sep">/</span>
      <span class="badge-total">${total}</span>
    `;
  }

  function updateBadgeElement(el, unread, total, titlePrefix = '') {
    if (!el) return;
    el.innerHTML = formatBadgeHtml(unread, total);
    el.className = `count-badge ${unread > 0 ? 'has-unread' : ''}`;
    el.title = `${titlePrefix ? titlePrefix + ': ' : ''}${unread} new unread / ${total} total`;
  }

  // State Management
  const state = {
    currentAccount: 'all', // 'all' or specific email address
    currentFolder: 'inbox', // 'inbox' | 'sent' | 'trash'
    currentFilter: 'all',   // 'all' | 'unread'
    searchQuery: '',
    selectedEmailId: null,
    emails: [],
    accounts: [],
    currentEmailData: null
  };

  // DOM Elements
  const elements = {
    // Header
    searchInput: document.getElementById('searchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    syncResendBtn: document.getElementById('syncResendBtn'),
    simulateInboundBtn: document.getElementById('simulateInboundBtn'),
    domainInfoBtn: document.getElementById('domainInfoBtn'),
    openComposeBtn: document.getElementById('openComposeBtn'),
    domainStatusPill: document.getElementById('domainStatusPill'),

    // Sidebar
    accountList: document.getElementById('accountList'),
    badgeAllInbox: document.getElementById('badgeAllInbox'),
    folderInboxBtn: document.getElementById('folderInboxBtn'),
    folderSentBtn: document.getElementById('folderSentBtn'),
    folderTrashBtn: document.getElementById('folderTrashBtn'),
    currentFolderInboxBadge: document.getElementById('currentFolderInboxBadge'),
    currentFolderSentBadge: document.getElementById('currentFolderSentBadge'),
    currentFolderTrashBadge: document.getElementById('currentFolderTrashBadge'),

    // Message List Column
    currentViewTitle: document.getElementById('currentViewTitle'),
    emailCountPill: document.getElementById('emailCountPill'),
    filterAllBtn: document.getElementById('filterAllBtn'),
    filterUnreadBtn: document.getElementById('filterUnreadBtn'),
    markAllReadBtn: document.getElementById('markAllReadBtn'),
    emailItemsContainer: document.getElementById('emailItemsContainer'),

    // Email Detail Column
    noSelectionPlaceholder: document.getElementById('noSelectionPlaceholder'),
    activeEmailView: document.getElementById('activeEmailView'),
    emptyComposeTrigger: document.getElementById('emptyComposeTrigger'),
    detailSubject: document.getElementById('detailSubject'),
    detailAccountBadge: document.getElementById('detailAccountBadge'),
    detailStatusBadge: document.getElementById('detailStatusBadge'),
    detailFolderBadge: document.getElementById('detailFolderBadge'),
    detailAvatar: document.getElementById('detailAvatar'),
    detailFromName: document.getElementById('detailFromName'),
    detailFromEmail: document.getElementById('detailFromEmail'),
    detailToEmail: document.getElementById('detailToEmail'),
    detailDate: document.getElementById('detailDate'),
    detailBody: document.getElementById('detailBody'),
    detailResendId: document.getElementById('detailResendId'),
    replyBtn: document.getElementById('replyBtn'),
    forwardBtn: document.getElementById('forwardBtn'),
    toggleReadBtn: document.getElementById('toggleReadBtn'),
    toggleReadLabel: document.getElementById('toggleReadLabel'),
    deleteEmailBtn: document.getElementById('deleteEmailBtn'),

    // Compose Modal
    composeModal: document.getElementById('composeModal'),
    closeComposeBtn: document.getElementById('closeComposeBtn'),
    cancelComposeBtn: document.getElementById('cancelComposeBtn'),
    composeForm: document.getElementById('composeForm'),
    composeFromSelect: document.getElementById('composeFromSelect'),
    composeToInput: document.getElementById('composeToInput'),
    composeSubjectInput: document.getElementById('composeSubjectInput'),
    composeMessageInput: document.getElementById('composeMessageInput'),
    submitSendBtn: document.getElementById('submitSendBtn'),

    // Inbound Simulator Modal
    inboundModal: document.getElementById('inboundModal'),
    closeInboundBtn: document.getElementById('closeInboundBtn'),
    cancelInboundBtn: document.getElementById('cancelInboundBtn'),
    inboundSimForm: document.getElementById('inboundSimForm'),
    inboundTargetAccount: document.getElementById('inboundTargetAccount'),
    inboundSender: document.getElementById('inboundSender'),
    inboundSubject: document.getElementById('inboundSubject'),
    inboundMessage: document.getElementById('inboundMessage'),

    // Domain Info Modal
    domainModal: document.getElementById('domainModal'),
    closeDomainModalBtn: document.getElementById('closeDomainModalBtn'),
    confirmDomainModalBtn: document.getElementById('confirmDomainModalBtn'),
    copyWebhookBtn: document.getElementById('copyWebhookBtn'),
    webhookUrlCode: document.getElementById('webhookUrlCode'),

    // Toast
    toastContainer: document.getElementById('toastContainer')
  };

  // Pre-built Quick Templates (100% English)
  const templates = {
    welcome: {
      subject: 'Welcome to Judad KSA!',
      body: `<p>Dear Valued Client,</p><p>Welcome to <strong>Judad KSA</strong>. We are delighted to have you with us.</p><p>We are committed to delivering top-tier solutions. If you have any questions or require assistance, please feel free to reply directly to this email.</p><p>Best regards,<br/><strong>Team Judad KSA</strong><br/>Website: judadksa.com</p>`
    },
    support: {
      subject: 'Re: Judad KSA Support Inquiry',
      body: `<p>Hello,</p><p>Thank you for reaching out to Judad KSA Customer Support. Our team has reviewed your inquiry.</p><p>Please let us know your preferred time for a consultation or check our official portal for further assistance.</p><p>Warm regards,<br/><strong>Judad Support Desk</strong><br/>support@judadksa.com</p>`
    },
    quote: {
      subject: 'Official Quotation & Service Proposal - Judad KSA',
      body: `<p>Dear Valued Client,</p><p>Thank you for contacting Judad KSA. Please find our commercial proposal and service quotation details outlined below:</p><ul><li>Service Scope: Enterprise IT & Mail Solutions</li><li>Domain: judadksa.com</li><li>Validity: 14 business days</li></ul><p>Feel free to let us know if you require any custom adjustments.</p><p>Best regards,<br/><strong>Management Team</strong><br/>admin@judadksa.com</p>`
    }
  };

  // Helper: Toast Notifications
  function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Format Date Friendly
  function formatDate(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();

      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (isToday) {
        return timeStr;
      }
      return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
    } catch (e) {
      return isoString;
    }
  }

  // Escape HTML to prevent XSS in text preview
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
  }

  // Extract display name and plain email
  function parseEmailAddress(addressStr) {
    if (!addressStr) return { name: 'Unknown', email: '' };
    if (Array.isArray(addressStr)) addressStr = addressStr[0];

    const match = addressStr.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/);
    if (match) {
      return {
        name: match[1] || match[2].split('@')[0],
        email: match[2]
      };
    }
    return { name: addressStr.split('@')[0], email: addressStr };
  }

  // 1. Fetch & Render Accounts in Sidebar with unread / total count
  async function loadAccounts() {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      state.accounts = data.accounts || [];

      const totals = data.totals || {};
      const unreadInbox = totals.unreadInbox ?? 0;
      const totalInbox = totals.totalInbox ?? totals.inbox ?? 0;
      const unreadSent = totals.unreadSent ?? 0;
      const totalSent = totals.totalSent ?? totals.sent ?? 0;
      const unreadTrash = totals.unreadTrash ?? 0;
      const totalTrash = totals.totalTrash ?? totals.trash ?? 0;

      // Update folder badges to show new unread / Total count
      updateBadgeElement(elements.badgeAllInbox, unreadInbox, totalInbox, 'All Inboxes');
      updateBadgeElement(elements.currentFolderInboxBadge, unreadInbox, totalInbox, 'Inbox');
      updateBadgeElement(elements.currentFolderSentBadge, unreadSent, totalSent, 'Sent');
      updateBadgeElement(elements.currentFolderTrashBadge, unreadTrash, totalTrash, 'Trash');

      renderAccountList();
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  }

  // Render Account Sidebar Buttons with unread / total count
  function renderAccountList() {
    if (!elements.accountList) return;

    const totalAllUnread = state.accounts.reduce((sum, a) => sum + (a.unreadInbox || 0), 0);
    const totalAllInbox = state.accounts.reduce((sum, a) => sum + (a.totalInbox || 0), 0);

    let html = `
      <button class="account-item ${state.currentAccount === 'all' ? 'active' : ''}" data-account="all">
        <div class="account-icon global">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
        </div>
        <div class="account-details">
          <span class="account-name">All Inboxes</span>
          <span class="account-desc">Unified View</span>
        </div>
        <span class="count-badge ${totalAllUnread > 0 ? 'has-unread' : ''}" id="badgeAllInbox" title="All Inboxes: ${totalAllUnread} new unread / ${totalAllInbox} total">
          ${formatBadgeHtml(totalAllUnread, totalAllInbox)}
        </span>
      </button>
    `;

    state.accounts.forEach(acc => {
      let iconClass = 'info';
      let iconLetter = 'I';
      if (acc.email.startsWith('admin')) {
        iconClass = 'admin';
        iconLetter = 'A';
      } else if (acc.email.startsWith('support')) {
        iconClass = 'support';
        iconLetter = 'S';
      }

      const unread = acc.unreadInbox || 0;
      const total = acc.totalInbox || 0;

      html += `
        <button class="account-item ${state.currentAccount === acc.email ? 'active' : ''}" data-account="${acc.email}">
          <div class="account-icon ${iconClass}">${iconLetter}</div>
          <div class="account-details">
            <span class="account-name">${acc.email}</span>
            <span class="account-desc">${acc.role}</span>
          </div>
          <span class="count-badge ${unread > 0 ? 'has-unread' : ''}" title="${acc.email}: ${unread} new unread / ${total} total">
            ${formatBadgeHtml(unread, total)}
          </span>
        </button>
      `;
    });

    elements.accountList.innerHTML = html;

    // Attach listeners
    elements.accountList.querySelectorAll('.account-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const acc = btn.dataset.account;
        if (state.currentAccount !== acc) {
          state.currentAccount = acc;
          state.selectedEmailId = null;
          updateViewTitle();
          renderAccountList();
          loadEmails();
        }
      });
    });
  }

  // Update View Header Title
  function updateViewTitle() {
    let folderName = 'Inbox';
    if (state.currentFolder === 'sent') folderName = 'Sent';
    if (state.currentFolder === 'trash') folderName = 'Trash';

    let accountName = 'All Accounts';
    if (state.currentAccount !== 'all') {
      accountName = state.currentAccount;
    }

    elements.currentViewTitle.innerText = `${folderName} • ${accountName}`;
  }

  // 2. Fetch & Render Email List
  async function loadEmails() {
    try {
      elements.emailItemsContainer.innerHTML = `
        <div class="loading-state">
          <div class="spinner"></div>
          <span>Loading emails...</span>
        </div>
      `;

      const params = new URLSearchParams({
        folder: state.currentFolder,
        account: state.currentAccount,
        search: state.searchQuery
      });

      const res = await fetch(`/api/emails?${params.toString()}`);
      const data = await res.json();
      state.emails = data.emails || [];

      // Reconcile with client persistent storage (Ensures emails NEVER flip back to unread on reload or sync)
      const readSet = getStoredReadIds();
      const unreadSet = getStoredUnreadIds();

      state.emails.forEach(email => {
        if (readSet.has(email.id) || (email.resend_id && readSet.has(email.resend_id))) {
          email.read = true;
        } else if (unreadSet.has(email.id) || (email.resend_id && unreadSet.has(email.resend_id))) {
          email.read = false;
        }
      });

      // Filter by unread if active
      let displayList = state.emails;
      if (state.currentFilter === 'unread') {
        displayList = displayList.filter(e => !e.read);
      }

      // Update header email count pill
      const unreadInList = state.emails.filter(e => !e.read).length;
      const totalInList = state.emails.length;

      if (state.currentFilter === 'unread') {
        elements.emailCountPill.innerHTML = `<span class="pill-unread-num">${displayList.length} unread</span>`;
      } else {
        elements.emailCountPill.innerHTML = `
          <span class="pill-unread-num">${unreadInList} unread</span>
          <span style="opacity:0.4; margin: 0 4px;">/</span>
          <span>${totalInList} total</span>
        `;
      }

      if (displayList.length === 0) {
        let msg = 'No emails found in this folder.';
        if (state.searchQuery) {
          msg = `No results found for "${state.searchQuery}".`;
        } else if (state.currentFilter === 'unread') {
          msg = 'No unread emails in this folder.';
        }

        elements.emailItemsContainer.innerHTML = `
          <div class="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
            <p>${msg}</p>
            ${state.currentFolder === 'inbox' && state.currentFilter === 'all' ? `
              <button class="btn btn-sm btn-primary" id="btnEmptySimulate">
                Send a test email to your inbox
              </button>
            ` : ''}
          </div>
        `;

        const btnSim = document.getElementById('btnEmptySimulate');
        if (btnSim) {
          btnSim.addEventListener('click', openInboundModal);
        }

        if (!state.emails.find(e => e.id === state.selectedEmailId)) {
          showPlaceholder();
        }
        return;
      }

      // Render emails
      let listHtml = '';
      displayList.forEach(email => {
        const isSelected = email.id === state.selectedEmailId;
        const isUnread = !email.read;
        const sender = parseEmailAddress(email.from);
        const recipient = parseEmailAddress(Array.isArray(email.to) ? email.to[0] : email.to);

        const contactName = state.currentFolder === 'sent' ? `To: ${recipient.name}` : sender.name;

        let accType = 'info';
        if (email.account?.includes('admin')) accType = 'admin';
        if (email.account?.includes('support')) accType = 'support';

        let snippet = email.text || '';
        if (!snippet && email.html) {
          const temp = document.createElement('div');
          temp.innerHTML = email.html;
          snippet = temp.textContent || temp.innerText || '';
        }
        snippet = snippet.replace(/\s+/g, ' ').trim();
        if (snippet.length > 80) snippet = snippet.substring(0, 80) + '...';

        listHtml += `
          <div class="email-item ${isSelected ? 'active' : ''} ${isUnread ? 'unread' : ''}" data-id="${email.id}">
            ${isUnread ? '<div class="unread-indicator"></div>' : ''}
            <div class="email-item-avatar ${accType}">
              ${(contactName || 'J').charAt(0).toUpperCase()}
            </div>
            <div class="email-item-content">
              <div class="email-item-header">
                <span class="email-item-sender">${escapeHtml(contactName)}</span>
                <span class="email-item-date">${formatDate(email.created_at)}</span>
              </div>
              <div class="email-item-subject">${escapeHtml(email.subject || '(No Subject)')}</div>
              <div class="email-item-snippet">${escapeHtml(snippet || 'No message preview available')}</div>
              <div class="email-item-badges">
                <span class="pill-account ${accType}">${email.account || 'judadksa.com'}</span>
                <span class="pill-status ${email.status || 'sent'}">${email.status || 'sent'}</span>
              </div>
            </div>
          </div>
        `;
      });

      elements.emailItemsContainer.innerHTML = listHtml;

      elements.emailItemsContainer.querySelectorAll('.email-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          selectEmail(id);
        });
      });

      if (!state.selectedEmailId && displayList.length > 0) {
        selectEmail(displayList[0].id);
      }
    } catch (error) {
      console.error('Error loading emails:', error);
      elements.emailItemsContainer.innerHTML = `
        <div class="empty-state">
          <p>Failed to load emails</p>
        </div>
      `;
    }
  }

  // 3. Select & Display Single Email in Reader Column
  async function selectEmail(id) {
    state.selectedEmailId = id;

    // Immediately persist read status locally
    markEmailAsReadInStorage(id);

    elements.emailItemsContainer.querySelectorAll('.email-item').forEach(el => {
      if (el.dataset.id === id) {
        el.classList.add('active');
        el.classList.remove('unread');
        const indicator = el.querySelector('.unread-indicator');
        if (indicator) indicator.remove();
      } else {
        el.classList.remove('active');
      }
    });

    const local = state.emails.find(e => e.id === id || e.resend_id === id);
    const wasUnread = local && !local.read;
    if (local) {
      local.read = true;
    }

    try {
      const res = await fetch(`/api/emails/${id}`);
      if (!res.ok) throw new Error('Email not found');
      const data = await res.json();
      const email = data.email;
      email.read = true; // Guarantee true
      state.currentEmailData = email;

      renderEmailDetail(email);
      loadAccounts();
    } catch (err) {
      console.error('Error fetching email details:', err);
      showPlaceholder();
    }
  }

  // Render Full Email in Reader Column
  function renderEmailDetail(email) {
    elements.noSelectionPlaceholder.style.display = 'none';
    elements.activeEmailView.style.display = 'flex';

    const sender = parseEmailAddress(email.from);
    const toStr = Array.isArray(email.to) ? email.to.join(', ') : (email.to || '');

    elements.detailSubject.innerText = email.subject || '(No Subject)';
    elements.detailAccountBadge.innerText = email.account || 'judadksa.com';
    elements.detailStatusBadge.innerText = (email.status || 'sent').toUpperCase();
    elements.detailFolderBadge.innerText = (email.folder || 'Inbox').toUpperCase();

    let accType = 'info';
    if (email.account?.includes('admin')) accType = 'admin';
    if (email.account?.includes('support')) accType = 'support';
    elements.detailAvatar.className = `sender-avatar ${accType}`;
    elements.detailAvatar.innerText = (sender.name || 'J').charAt(0).toUpperCase();

    elements.detailFromName.innerText = sender.name;
    elements.detailFromEmail.innerText = `<${sender.email}>`;
    elements.detailToEmail.innerText = toStr;
    elements.detailDate.innerText = new Date(email.created_at).toLocaleString();

    // Body content: prefer HTML, fall back to text
    if (email.html && email.html.trim() !== '') {
      elements.detailBody.innerHTML = email.html;
    } else if (email.text && email.text.trim() !== '') {
      elements.detailBody.innerHTML = `<p>${escapeHtml(email.text).replace(/\n/g, '<br/>')}</p>`;
    } else {
      elements.detailBody.innerHTML = `<p class="text-muted">(No body content available)</p>`;
    }

    elements.detailResendId.innerText = email.resend_id || email.id;
    elements.toggleReadLabel.innerText = email.read ? 'Mark Unread' : 'Mark Read';
  }

  function showPlaceholder() {
    elements.activeEmailView.style.display = 'none';
    elements.noSelectionPlaceholder.style.display = 'flex';
    state.selectedEmailId = null;
    state.currentEmailData = null;
  }

  // 4. Send Email via Resend
  async function handleSendEmail(e) {
    e.preventDefault();

    const from = elements.composeFromSelect.value;
    const to = elements.composeToInput.value.trim();
    const subject = elements.composeSubjectInput.value.trim();
    const message = elements.composeMessageInput.value;

    if (!from || !to || !subject || !message) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    const submitBtn = elements.submitSendBtn;
    const btnContent = submitBtn.querySelector('.btn-content');
    const spinner = submitBtn.querySelector('.btn-spinner');

    btnContent.style.display = 'none';
    spinner.style.display = 'inline-block';
    submitBtn.disabled = true;

    try {
      const res = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to,
          subject,
          html: message,
          text: message.replace(/<[^>]*>?/gm, '')
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send email');
      }

      showToast(`Email sent successfully from ${from}`, 'success');
      closeComposeModal();

      elements.composeForm.reset();

      switchFolder('sent');
      loadAccounts();
      loadEmails();
    } catch (err) {
      console.error('Error sending email:', err);
      showToast(err.message || 'Error sending email', 'error');
    } finally {
      btnContent.style.display = 'inline-flex';
      spinner.style.display = 'none';
      submitBtn.disabled = false;
    }
  }

  // 5. Inbound Simulator
  async function handleInboundSimulate(e) {
    e.preventDefault();

    const targetAccount = elements.inboundTargetAccount.value;
    const from = elements.inboundSender.value.trim();
    const subject = elements.inboundSubject.value.trim();
    const message = elements.inboundMessage.value.trim();

    try {
      const res = await fetch('/api/emails/simulate-inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: targetAccount,
          from,
          subject,
          message
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Simulation failed');

      showToast(`Test email received into ${targetAccount} inbox!`, 'success');
      closeInboundModal();

      switchFolder('inbox');
      await loadAccounts();
      await loadEmails();

      if (data.email?.id) {
        selectEmail(data.email.id);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // 6. Sync with Resend (Syncs read IDs first, ensuring read state is preserved!)
  async function handleSyncResend() {
    elements.syncResendBtn.disabled = true;
    showToast('Syncing live emails from Resend...', 'info');

    try {
      // First ensure the server is primed with our stored read states
      await syncClientReadStatesWithServer();

      const res = await fetch('/api/emails/sync-resend', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(data.message || 'Sync completed successfully', 'success');
      await loadAccounts();
      await loadEmails();
    } catch (err) {
      showToast(err.message || 'Failed to sync with Resend', 'error');
    } finally {
      elements.syncResendBtn.disabled = false;
    }
  }

  // 7. Delete / Move to trash
  async function handleDeleteEmail() {
    if (!state.selectedEmailId) return;

    const confirmMsg = state.currentFolder === 'trash'
      ? 'Are you sure you want to permanently delete this email?'
      : 'Move this email to trash?';

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/emails/${state.selectedEmailId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(data.action === 'permanently_deleted' ? 'Email permanently deleted' : 'Email moved to trash', 'info');
      showPlaceholder();
      loadAccounts();
      loadEmails();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // 8. Toggle Read/Unread
  async function handleToggleRead() {
    if (!state.currentEmailData) return;
    const id = state.currentEmailData.id;
    const targetStatus = !state.currentEmailData.read;

    // Persist to localStorage
    if (targetStatus) {
      markEmailAsReadInStorage(id);
      if (state.currentEmailData.resend_id) markEmailAsReadInStorage(state.currentEmailData.resend_id);
    } else {
      markEmailAsUnreadInStorage(id);
      if (state.currentEmailData.resend_id) markEmailAsUnreadInStorage(state.currentEmailData.resend_id);
    }

    state.currentEmailData.read = targetStatus;
    const local = state.emails.find(e => e.id === id || e.resend_id === id);
    if (local) {
      local.read = targetStatus;
    }

    elements.toggleReadLabel.innerText = targetStatus ? 'Mark Unread' : 'Mark Read';
    showToast(targetStatus ? 'Marked as read' : 'Marked as unread', 'info');

    // Update list UI
    elements.emailItemsContainer.querySelectorAll('.email-item').forEach(el => {
      if (el.dataset.id === id) {
        if (targetStatus) {
          el.classList.remove('unread');
          const indicator = el.querySelector('.unread-indicator');
          if (indicator) indicator.remove();
        } else {
          el.classList.add('unread');
          if (!el.querySelector('.unread-indicator')) {
            const ind = document.createElement('div');
            ind.className = 'unread-indicator';
            el.prepend(ind);
          }
        }
      }
    });

    try {
      await fetch(`/api/emails/${id}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: targetStatus })
      });
    } catch (e) {}

    await loadAccounts();
    if (state.currentFilter === 'unread') {
      loadEmails();
    }
  }

  // 9. Mark All Emails in Folder as Read
  async function handleMarkAllRead() {
    try {
      const readSet = getStoredReadIds();
      const unreadSet = getStoredUnreadIds();

      state.emails.forEach(e => {
        e.read = true;
        readSet.add(e.id);
        if (e.resend_id) readSet.add(e.resend_id);
        unreadSet.delete(e.id);
        if (e.resend_id) unreadSet.delete(e.resend_id);
      });

      saveStoredReadIds(readSet);
      saveStoredUnreadIds(unreadSet);

      await fetch('/api/emails/mark-all-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder: state.currentFolder,
          account: state.currentAccount
        })
      });

      showToast('All emails marked as read', 'success');
      await loadAccounts();
      await loadEmails();
    } catch (err) {
      console.error('Error marking all as read:', err);
      showToast('Failed to mark all as read', 'error');
    }
  }

  // 10. Reply Handler
  function handleReply() {
    if (!state.currentEmailData) return;
    const email = state.currentEmailData;
    const sender = parseEmailAddress(email.from);

    elements.composeToInput.value = sender.email;
    elements.composeSubjectInput.value = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;

    if (email.account && elements.composeFromSelect.querySelector(`option[value="${email.account}"]`)) {
      elements.composeFromSelect.value = email.account;
    }

    elements.composeMessageInput.value = `\n\n--- Original Message ---\nFrom: ${email.from}\nDate: ${email.created_at}\n\n${email.text || ''}`;

    openComposeModal();
  }

  // 11. Forward Handler
  function handleForward() {
    if (!state.currentEmailData) return;
    const email = state.currentEmailData;

    elements.composeToInput.value = '';
    elements.composeSubjectInput.value = email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`;

    if (email.account && elements.composeFromSelect.querySelector(`option[value="${email.account}"]`)) {
      elements.composeFromSelect.value = email.account;
    }

    elements.composeMessageInput.value = `\n\n---------- Forwarded message ---------\nFrom: ${email.from}\nDate: ${email.created_at}\nSubject: ${email.subject}\nTo: ${email.to}\n\n${email.text || ''}`;

    openComposeModal();
  }

  // Switch folder helper
  function switchFolder(folder) {
    state.currentFolder = folder;
    state.selectedEmailId = null;

    [elements.folderInboxBtn, elements.folderSentBtn, elements.folderTrashBtn].forEach(btn => {
      btn.classList.remove('active');
    });

    if (folder === 'inbox') elements.folderInboxBtn.classList.add('active');
    if (folder === 'sent') elements.folderSentBtn.classList.add('active');
    if (folder === 'trash') elements.folderTrashBtn.classList.add('active');

    updateViewTitle();
    loadEmails();
  }

  // Modal open/close helpers
  function openComposeModal(presetFrom = null) {
    if (presetFrom && elements.composeFromSelect.querySelector(`option[value="${presetFrom}"]`)) {
      elements.composeFromSelect.value = presetFrom;
    } else if (state.currentAccount !== 'all') {
      elements.composeFromSelect.value = state.currentAccount;
    }
    elements.composeModal.style.display = 'flex';
  }

  function closeComposeModal() {
    elements.composeModal.style.display = 'none';
  }

  function openInboundModal() {
    if (state.currentAccount !== 'all') {
      elements.inboundTargetAccount.value = state.currentAccount;
    }
    elements.inboundModal.style.display = 'flex';
  }

  function closeInboundModal() {
    elements.inboundModal.style.display = 'none';
  }

  function openDomainModal() {
    const origin = window.location.origin;
    elements.webhookUrlCode.innerText = `${origin}/api/webhook`;
    elements.domainModal.style.display = 'flex';
  }

  function closeDomainModal() {
    elements.domainModal.style.display = 'none';
  }

  function copyWebhookUrl() {
    const text = elements.webhookUrlCode.innerText;
    navigator.clipboard.writeText(text).then(() => {
      showToast('Webhook URL copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Failed to copy URL', 'error');
    });
  }

  // Setup Event Listeners
  function setupEvents() {
    elements.folderInboxBtn.addEventListener('click', () => switchFolder('inbox'));
    elements.folderSentBtn.addEventListener('click', () => switchFolder('sent'));
    elements.folderTrashBtn.addEventListener('click', () => switchFolder('trash'));

    elements.filterAllBtn.addEventListener('click', () => {
      state.currentFilter = 'all';
      elements.filterAllBtn.classList.add('active');
      elements.filterUnreadBtn.classList.remove('active');
      loadEmails();
    });

    elements.filterUnreadBtn.addEventListener('click', () => {
      state.currentFilter = 'unread';
      elements.filterUnreadBtn.classList.add('active');
      elements.filterAllBtn.classList.remove('active');
      loadEmails();
    });

    if (elements.markAllReadBtn) {
      elements.markAllReadBtn.addEventListener('click', handleMarkAllRead);
    }

    let searchTimeout = null;
    elements.searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const val = e.target.value.trim();
      elements.clearSearchBtn.style.display = val ? 'inline' : 'none';

      searchTimeout = setTimeout(() => {
        state.searchQuery = val;
        loadEmails();
      }, 300);
    });

    elements.clearSearchBtn.addEventListener('click', () => {
      elements.searchInput.value = '';
      elements.clearSearchBtn.style.display = 'none';
      state.searchQuery = '';
      loadEmails();
    });

    elements.openComposeBtn.addEventListener('click', () => openComposeModal());
    elements.emptyComposeTrigger.addEventListener('click', () => openComposeModal());
    elements.simulateInboundBtn.addEventListener('click', openInboundModal);
    elements.syncResendBtn.addEventListener('click', handleSyncResend);
    elements.domainInfoBtn.addEventListener('click', openDomainModal);
    elements.domainStatusPill.addEventListener('click', openDomainModal);

    elements.closeComposeBtn.addEventListener('click', closeComposeModal);
    elements.cancelComposeBtn.addEventListener('click', closeComposeModal);

    elements.closeInboundBtn.addEventListener('click', closeInboundModal);
    elements.cancelInboundBtn.addEventListener('click', closeInboundModal);

    elements.closeDomainModalBtn.addEventListener('click', closeDomainModal);
    elements.confirmDomainModalBtn.addEventListener('click', closeDomainModal);

    elements.copyWebhookBtn.addEventListener('click', copyWebhookUrl);

    [elements.composeModal, elements.inboundModal, elements.domainModal].forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    });

    document.querySelectorAll('.btn-template').forEach(btn => {
      btn.addEventListener('click', () => {
        const tplKey = btn.dataset.tpl;
        const tpl = templates[tplKey];
        if (tpl) {
          elements.composeSubjectInput.value = tpl.subject;
          elements.composeMessageInput.value = tpl.body;
        }
      });
    });

    elements.composeForm.addEventListener('submit', handleSendEmail);
    elements.inboundSimForm.addEventListener('submit', handleInboundSimulate);

    elements.replyBtn.addEventListener('click', handleReply);
    elements.forwardBtn.addEventListener('click', handleForward);
    elements.deleteEmailBtn.addEventListener('click', handleDeleteEmail);
    elements.toggleReadBtn.addEventListener('click', handleToggleRead);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        elements.composeModal.style.display = 'none';
        elements.inboundModal.style.display = 'none';
        elements.domainModal.style.display = 'none';
      }
      if (e.key === 'c' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        openComposeModal();
      }
    });
  }

  // Initialize Application
  async function init() {
    setupEvents();
    updateViewTitle();
    // Synchronize local read IDs to server to ensure zero state regression
    await syncClientReadStatesWithServer();
    await loadAccounts();
    await loadEmails();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
