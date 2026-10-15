/**
 * Judad KSA Webmail Client Application
 * Connects info@judadksa.com, admin@judadksa.com, support@judadksa.com via Resend API
 */

(function () {
  'use strict';

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

  // Pre-built Quick Templates
  const templates = {
    welcome: {
      subject: 'Judad KSA তে আপনাকে স্বাগতম!',
      body: `<p>প্রিয় গ্রাহক,</p><p><strong>Judad KSA</strong>-এর পক্ষ থেকে আপনাকে আন্তরিক শুভেচ্ছা ও ধন্যবাদ।</p><p>আমরা সবসময় গ্রাহক সন্তুষ্টিকে সর্বোচ্চ গুরুত্ব দিয়ে থাকি। আমাদের সেবাসমূহ সম্পর্কে যেকোনো তথ্য বা সহায়তার জন্য সরাসরি এই ইমেইলে রিপ্লাই দিতে পারেন।</p><p>ধন্যবাদান্তে,<br/><strong>টিম Judad KSA</strong><br/>ওয়েবসাইট: judadksa.com</p>`
    },
    support: {
      subject: 'Re: আপনার প্রশ্নের প্রেক্ষিতে Judad KSA সহায়তা',
      body: `<p>প্রিয় গ্রাহক,</p><p>আপনার অনুসন্ধানের জন্য ধন্যবাদ। আমাদের সাপোর্ট টিম আপনার বিষয়টি পর্যালোচনা করেছে।</p><p>আপনার সমস্যার সমাধান বা বিস্তারিত তথ্য জানতে অনুগ্রহ করে আমাদের অফিসিয়াল পোর্টাল চেক করুন অথবা এই ইমেইলের প্রত্যুত্তরে আপনার সুবিধাজনক যোগাযোগের সময় জানিয়ে দিন।</p><p>আন্তরিক শুভেচ্ছা সহ,<br/><strong>Judad Support Desk</strong><br/>support@judadksa.com</p>`
    },
    quote: {
      subject: 'Official Quotation & Service Proposal - Judad KSA',
      body: `<p>Dear Valued Client,</p><p>Thank you for reaching out to Judad KSA. Please find our commercial proposal and service quotation attached as requested.</p><ul><li>Service Scope: Enterprise Solutions</li><li>Domain: judadksa.com</li><li>Validity: 14 business days</li></ul><p>Feel free to let us know if you require any adjustments.</p><p>Best regards,<br/><strong>Management Team</strong><br/>admin@judadksa.com</p>`
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

  // 1. Fetch & Render Accounts in Sidebar
  async function loadAccounts() {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      state.accounts = data.accounts || [];

      // Update total badge counters
      if (elements.badgeAllInbox) {
        elements.badgeAllInbox.innerText = data.totals?.unreadInbox || 0;
        if (data.totals?.unreadInbox > 0) {
          elements.badgeAllInbox.classList.add('unread-badge');
        } else {
          elements.badgeAllInbox.classList.remove('unread-badge');
        }
      }

      if (elements.currentFolderInboxBadge) {
        elements.currentFolderInboxBadge.innerText = data.totals?.unreadInbox || 0;
      }
      if (elements.currentFolderSentBadge) {
        elements.currentFolderSentBadge.innerText = data.totals?.sent || 0;
      }
      if (elements.currentFolderTrashBadge) {
        elements.currentFolderTrashBadge.innerText = data.totals?.trash || 0;
      }

      renderAccountList();
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  }

  // Render Account Sidebar Buttons
  function renderAccountList() {
    if (!elements.accountList) return;

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
          <span class="account-name">সকল ইনবক্স</span>
          <span class="account-desc">Unified View</span>
        </div>
        <span class="badge ${state.accounts.reduce((sum, a) => sum + a.unreadInbox, 0) > 0 ? 'unread-badge' : ''}">
          ${state.accounts.reduce((sum, a) => sum + a.unreadInbox, 0)}
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

      html += `
        <button class="account-item ${state.currentAccount === acc.email ? 'active' : ''}" data-account="${acc.email}">
          <div class="account-icon ${iconClass}">${iconLetter}</div>
          <div class="account-details">
            <span class="account-name">${acc.email}</span>
            <span class="account-desc">${acc.role}</span>
          </div>
          <span class="badge ${acc.unreadInbox > 0 ? 'unread-badge' : ''}">${acc.unreadInbox}</span>
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
    let folderName = 'ইনবক্স (Inbox)';
    if (state.currentFolder === 'sent') folderName = 'সেন্ট বক্স (Sent Box)';
    if (state.currentFolder === 'trash') folderName = 'ট্র্যাশ (Trash)';

    let accountName = 'সকল অ্যাকাউন্ট';
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
          <span>ইমেইল লোড হচ্ছে...</span>
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

      // Filter by unread if active
      let displayList = state.emails;
      if (state.currentFilter === 'unread') {
        displayList = displayList.filter(e => !e.read);
      }

      elements.emailCountPill.innerText = `${displayList.length} টি ইমেইল`;

      if (displayList.length === 0) {
        let msg = 'এই ফোল্ডারে কোনো ইমেইল পাওয়া যায়নি।';
        if (state.searchQuery) {
          msg = `"${state.searchQuery}" এর জন্য কোনো ফলাফল নেই।`;
        }
        elements.emailItemsContainer.innerHTML = `
          <div class="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
            <p>${msg}</p>
            ${state.currentFolder === 'inbox' ? `
              <button class="btn btn-sm btn-primary" id="btnEmptySimulate">
                ইনবক্সে টেস্ট মেইল পাঠিয়ে দেখুন
              </button>
            ` : ''}
          </div>
        `;

        const btnSim = document.getElementById('btnEmptySimulate');
        if (btnSim) {
          btnSim.addEventListener('click', openInboundModal);
        }

        // If currently selected email is not in list, show placeholder
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

        // Who to display as primary contact
        const contactName = state.currentFolder === 'sent' ? `To: ${recipient.name}` : sender.name;

        // Account badge type
        let accType = 'info';
        if (email.account?.includes('admin')) accType = 'admin';
        if (email.account?.includes('support')) accType = 'support';

        // Extract plain text snippet
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
              <div class="email-item-snippet">${escapeHtml(snippet || 'কোনো মেসেজ প্রিভিউ নেই')}</div>
              <div class="email-item-badges">
                <span class="pill-account ${accType}">${email.account || 'judadksa.com'}</span>
                <span class="pill-status ${email.status || 'sent'}">${email.status || 'sent'}</span>
              </div>
            </div>
          </div>
        `;
      });

      elements.emailItemsContainer.innerHTML = listHtml;

      // Click to select email
      elements.emailItemsContainer.querySelectorAll('.email-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          selectEmail(id);
        });
      });

      // Auto select first email if none selected
      if (!state.selectedEmailId && displayList.length > 0) {
        selectEmail(displayList[0].id);
      }
    } catch (error) {
      console.error('Error loading emails:', error);
      elements.emailItemsContainer.innerHTML = `
        <div class="empty-state">
          <p>ইমেইল লোড করতে সমস্যা হয়েছে</p>
        </div>
      `;
    }
  }

  // 3. Select & Display Single Email in Reader Column
  async function selectEmail(id) {
    state.selectedEmailId = id;

    // Highlight item in list
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

    try {
      const res = await fetch(`/api/emails/${id}`);
      if (!res.ok) throw new Error('Email not found');
      const data = await res.json();
      const email = data.email;
      state.currentEmailData = email;

      // Update cached state
      const local = state.emails.find(e => e.id === id);
      if (local) {
        local.read = true;
      }

      // Refresh account unread badges
      loadAccounts();

      renderEmailDetail(email);
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

    elements.detailSubject.innerText = email.subject || '(কোনো বিষয় উল্লেখ নেই)';
    elements.detailAccountBadge.innerText = email.account || 'judadksa.com';
    elements.detailStatusBadge.innerText = (email.status || 'sent').toUpperCase();
    elements.detailFolderBadge.innerText = (email.folder || 'Inbox').toUpperCase();

    // Account color class
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
    if (email.html) {
      elements.detailBody.innerHTML = email.html;
    } else {
      elements.detailBody.innerHTML = `<p>${escapeHtml(email.text || '').replace(/\n/g, '<br/>')}</p>`;
    }

    elements.detailResendId.innerText = email.resend_id || email.id;

    // Toggle read button label
    elements.toggleReadLabel.innerText = email.read ? 'অপঠিত করুন' : 'পঠিত করুন';
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
      showToast('অনুগ্রহ করে সমস্ত প্রয়োজনীয় ঘর পূরণ করুন', 'error');
      return;
    }

    // Set loading state
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
        throw new Error(data.error || 'ইমেইল পাঠাতে ব্যর্থ হয়েছে');
      }

      showToast(`ইমেইল সফলভাবে পাঠানো হয়েছে (${from} থেকে)`, 'success');
      closeComposeModal();

      // Reset form
      elements.composeForm.reset();

      // Switch to Sent folder and refresh
      switchFolder('sent');
      loadAccounts();
      loadEmails();
    } catch (err) {
      console.error('Error sending email:', err);
      showToast(err.message || 'ইমেইল পাঠাতে ত্রুটি হয়েছে', 'error');
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
      if (!res.ok) throw new Error(data.error || 'সিমুলেশন ব্যর্থ হয়েছে');

      showToast(`টেস্ট ইমেইলটি সফলভাবে ${targetAccount} ইনবক্সে এসেছে!`, 'success');
      closeInboundModal();

      // Switch to inbox
      switchFolder('inbox');
      loadAccounts();
      await loadEmails();

      // Automatically select the new inbound email
      if (data.email?.id) {
        selectEmail(data.email.id);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // 6. Sync with Resend
  async function handleSyncResend() {
    elements.syncResendBtn.disabled = true;
    showToast('Resend থেকে লাইভ ইমেইল সিঙ্ক করা হচ্ছে...', 'info');

    try {
      const res = await fetch('/api/emails/sync-resend', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(data.message || 'সিঙ্ক সম্পন্ন হয়েছে', 'success');
      loadAccounts();
      loadEmails();
    } catch (err) {
      showToast(err.message || 'সিঙ্ক ব্যর্থ হয়েছে', 'error');
    } finally {
      elements.syncResendBtn.disabled = false;
    }
  }

  // 7. Delete / Move to trash
  async function handleDeleteEmail() {
    if (!state.selectedEmailId) return;

    const confirmMsg = state.currentFolder === 'trash'
      ? 'আপনি কি নিশ্চিত যে এই ইমেইলটি চিরতরে মুছে ফেলতে চান?'
      : 'ইমেইলটি ট্র্যাশ ফোল্ডারে পাঠাতে চান?';

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/emails/${state.selectedEmailId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(data.action === 'permanently_deleted' ? 'ইমেইল স্থায়ীভাবে মুছে ফেলা হয়েছে' : 'ইমেইল ট্র্যাশে সরানো হয়েছে', 'info');
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
    const targetStatus = !state.currentEmailData.read;

    try {
      const res = await fetch(`/api/emails/${state.currentEmailData.id}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: targetStatus })
      });
      if (!res.ok) throw new Error();

      state.currentEmailData.read = targetStatus;
      elements.toggleReadLabel.innerText = targetStatus ? 'অপঠিত করুন' : 'পঠিত করুন';
      showToast(targetStatus ? 'পঠিত হিসেবে চিহ্নিত' : 'অপঠিত হিসেবে চিহ্নিত', 'info');
      loadAccounts();
      loadEmails();
    } catch (err) {
      showToast('স্ট্যাটাস আপডেট ব্যর্থ হয়েছে', 'error');
    }
  }

  // 9. Reply Handler
  function handleReply() {
    if (!state.currentEmailData) return;
    const email = state.currentEmailData;
    const sender = parseEmailAddress(email.from);

    // Set recipient as sender
    elements.composeToInput.value = sender.email;
    // Set Subject as Re:
    elements.composeSubjectInput.value = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;

    // Select the From account that this email was received on
    if (email.account && elements.composeFromSelect.querySelector(`option[value="${email.account}"]`)) {
      elements.composeFromSelect.value = email.account;
    }

    elements.composeMessageInput.value = `\n\n--- পূর্ববর্তী বার্তা ---\nপ্রেরক: ${email.from}\nতারিখ: ${email.created_at}\n\n${email.text || ''}`;

    openComposeModal();
  }

  // 10. Forward Handler
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
    // Set current domain webhook url in modal
    const origin = window.location.origin;
    elements.webhookUrlCode.innerText = `${origin}/api/webhook`;
    elements.domainModal.style.display = 'flex';
  }

  function closeDomainModal() {
    elements.domainModal.style.display = 'none';
  }

  // Copy webhook URL helper
  function copyWebhookUrl() {
    const text = elements.webhookUrlCode.innerText;
    navigator.clipboard.writeText(text).then(() => {
      showToast('Webhook URL ক্লিপবোর্ডে কপি হয়েছে!', 'success');
    }).catch(() => {
      showToast('কপি করা সম্ভব হয়নি', 'error');
    });
  }

  // Setup Event Listeners
  function setupEvents() {
    // Folder Navigation
    elements.folderInboxBtn.addEventListener('click', () => switchFolder('inbox'));
    elements.folderSentBtn.addEventListener('click', () => switchFolder('sent'));
    elements.folderTrashBtn.addEventListener('click', () => switchFolder('trash'));

    // Filter Buttons (All vs Unread)
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

    // Search Input with Debounce
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

    // Header buttons
    elements.openComposeBtn.addEventListener('click', () => openComposeModal());
    elements.emptyComposeTrigger.addEventListener('click', () => openComposeModal());
    elements.simulateInboundBtn.addEventListener('click', openInboundModal);
    elements.syncResendBtn.addEventListener('click', handleSyncResend);
    elements.domainInfoBtn.addEventListener('click', openDomainModal);
    elements.domainStatusPill.addEventListener('click', openDomainModal);

    // Modal Close
    elements.closeComposeBtn.addEventListener('click', closeComposeModal);
    elements.cancelComposeBtn.addEventListener('click', closeComposeModal);

    elements.closeInboundBtn.addEventListener('click', closeInboundModal);
    elements.cancelInboundBtn.addEventListener('click', closeInboundModal);

    elements.closeDomainModalBtn.addEventListener('click', closeDomainModal);
    elements.confirmDomainModalBtn.addEventListener('click', closeDomainModal);

    elements.copyWebhookBtn.addEventListener('click', copyWebhookUrl);

    // Close on overlay backdrop click
    [elements.composeModal, elements.inboundModal, elements.domainModal].forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    });

    // Quick Templates
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

    // Forms
    elements.composeForm.addEventListener('submit', handleSendEmail);
    elements.inboundSimForm.addEventListener('submit', handleInboundSimulate);

    // Reader action buttons
    elements.replyBtn.addEventListener('click', handleReply);
    elements.forwardBtn.addEventListener('click', handleForward);
    elements.deleteEmailBtn.addEventListener('click', handleDeleteEmail);
    elements.toggleReadBtn.addEventListener('click', handleToggleRead);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Escape closes modals
      if (e.key === 'Escape') {
        elements.composeModal.style.display = 'none';
        elements.inboundModal.style.display = 'none';
        elements.domainModal.style.display = 'none';
      }
      // 'c' opens compose when not typing in an input
      if (e.key === 'c' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        openComposeModal();
      }
    });
  }

  // Initialize Application
  async function init() {
    setupEvents();
    updateViewTitle();
    await loadAccounts();
    await loadEmails();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
