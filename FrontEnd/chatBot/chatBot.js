const API = 'https://www.kelir-api.sg247.dev';

// ── Auth guard ────────────────────────────────────────────────────────────────
const token = localStorage.getItem('token');
const user  = JSON.parse(localStorage.getItem('user') || 'null');
if (!token || !user) {
  window.location.href = '../loginSignup/index.html';
}

// ── Global 401 handler — force re-login if token is expired/invalid ───────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    clearSessionAndRedirect();
    throw new Error('Session expired. Please log in again.');
  }
  return res;
}

function clearSessionAndRedirect() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  // Wipe any sensitive in-memory state
  historyData = [];
  currentSessionId = null;
  window.location.href = '../loginSignup/index.html';
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentSessionId = null;
let isTyping         = false;
let sidebarOpen      = true;
let historyData      = [];

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadUserInfo();
  loadHistory();
  document.addEventListener('click', handleOutsideClick);
});

// ── User Info ─────────────────────────────────────────────────────────────────
function loadUserInfo() {
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);

  document.getElementById('profile-avatar').textContent = initials;
  document.getElementById('profile-name').textContent   = user.name;
  document.getElementById('profile-email').textContent  = user.email;
  document.getElementById('topbar-avatar').textContent  = initials;

  document.getElementById('modal-avatar').textContent = initials;
  document.getElementById('modal-name').textContent   = user.name;
  document.getElementById('modal-email').textContent  = user.email;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById('sidebar').classList.toggle('collapsed', !sidebarOpen);
}

// ── History ───────────────────────────────────────────────────────────────────
async function loadHistory() {
  try {
    const res  = await apiFetch(`${API}/history`, { headers: authHeaders() });
    const data = await res.json();
    if (!data.success) return;
    historyData = data.chats;
    renderHistory();
    updateProfileStats();
  } catch { /* silently fail */ }
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!historyData.length) {
    list.innerHTML = '<div class="history-empty">No conversations yet</div>';
    return;
  }
  list.innerHTML = historyData.map(chat => {
    const firstMsg = chat.messages.find(m => m.role === 'user');
    const label    = firstMsg ? truncate(firstMsg.content, 36) : 'New Chat';
    const active   = chat._id === currentSessionId ? 'active' : '';
    return `
      <div class="history-item ${active}" data-id="${chat._id}" onclick="loadSession('${chat._id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="history-item-text">${label}</span>
        <button class="history-del-btn" onclick="deleteSession(event,'${chat._id}')" title="Delete">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>`;
  }).join('');
}

async function loadSession(id) {
  const chat = historyData.find(c => c._id === id);
  if (!chat) return;
  currentSessionId = id;
  renderHistory();

  // Clear and repopulate chat area
  hideWelcome();
  const msgs = document.getElementById('messages');
  msgs.innerHTML = '';
  chat.messages.forEach(m => appendMessage(m.role === 'user' ? 'user' : 'bot', m.content));
  scrollToBottom();
}

async function deleteSession(e, id) {
  e.stopPropagation();
  await apiFetch(`${API}/history/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (currentSessionId === id) {
    startNewChat();
  }
  historyData = historyData.filter(c => c._id !== id);
  renderHistory();
  updateProfileStats();
}

function startNewChat() {
  currentSessionId = null;
  document.getElementById('messages').innerHTML = '';
  showWelcome();
  renderHistory();
}

// ── Send Message ──────────────────────────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('user-input');
  const text  = input.value.trim();
  if (!text || isTyping) return;

  hideWelcome();
  input.value = '';
  autoResize(input);

  appendMessage('user', text);
  scrollToBottom();
  showTyping();

  document.getElementById('send-btn').disabled = true;
  isTyping = true;

  try {
    const res  = await apiFetch(`${API}/user`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ userMessage: text, sessionId: currentSessionId })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    currentSessionId = data.sessionId;
    removeTyping();
    appendMessage('bot', data.botMessage);
    scrollToBottom();
    loadHistory(); // refresh sidebar
  } catch (err) {
    removeTyping();
    appendMessage('bot', '⚠️ ' + (err.message || 'Something went wrong. Please try again.'));
  } finally {
    isTyping = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('user-input').focus();
  }
}

// ── Message Rendering ─────────────────────────────────────────────────────────
function appendMessage(role, content) {
  const msgs    = document.getElementById('messages');
  const initials = role === 'user'
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)
    : 'AI';

  const row = document.createElement('div');
  row.className = `msg-row ${role}`;
  row.innerHTML = `
    <div class="msg-icon">${initials}</div>
    <div class="msg-bubble">${escapeHtml(content).replace(/\n/g, '<br>')}</div>`;
  msgs.appendChild(row);
}

function showTyping() {
  const msgs = document.getElementById('messages');
  const row  = document.createElement('div');
  row.className = 'msg-row bot';
  row.id = 'typing-row';
  row.innerHTML = `
    <div class="msg-icon">AI</div>
    <div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  msgs.appendChild(row);
  scrollToBottom();
}
function removeTyping() {
  document.getElementById('typing-row')?.remove();
}

// ── Welcome screen ────────────────────────────────────────────────────────────
function hideWelcome() { document.getElementById('welcome').style.display = 'none'; }
function showWelcome()  { document.getElementById('welcome').style.display = ''; }

function fillPrompt(text) {
  const input = document.getElementById('user-input');
  input.value = text;
  autoResize(input);
  input.focus();
}

// ── Profile Modal ─────────────────────────────────────────────────────────────
function openProfileModal() {
  document.getElementById('profile-dropdown').classList.add('hidden');
  updateProfileStats();
  document.getElementById('profile-modal').classList.remove('hidden');
}
function closeProfileModal(e) {
  if (!e || e.target === document.getElementById('profile-modal'))
    document.getElementById('profile-modal').classList.add('hidden');
}
function toggleProfileMenu() {
  document.getElementById('profile-dropdown').classList.toggle('hidden');
}
function handleOutsideClick(e) {
  const drop = document.getElementById('profile-dropdown');
  const btn  = document.getElementById('profile-menu-btn');
  if (!drop.contains(e.target) && e.target !== btn)
    drop.classList.add('hidden');
}
function updateProfileStats() {
  document.getElementById('stat-chats').textContent = historyData.length;
  const msgs = historyData.reduce((s, c) => s + c.messages.filter(m => m.role === 'user').length, 0);
  document.getElementById('stat-msgs').textContent  = msgs;
}

// ── Logout ────────────────────────────────────────────────────────────────────
function logout() {
  // Clear all sensitive data from memory and storage
  historyData = [];
  currentSessionId = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  // Clear sessionStorage too in case anything was stored there
  sessionStorage.clear();
  window.location.href = '../loginSignup/index.html';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function authHeaders() {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
function scrollToBottom() {
  const area = document.getElementById('chat-area');
  area.scrollTop = area.scrollHeight;
}
function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '…' : str;
}
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}
function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}
