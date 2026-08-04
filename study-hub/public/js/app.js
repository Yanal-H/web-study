'use strict';
(function () {

/* ================= ICONS / CONST ================= */
const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="chev"><path d="m9 6 6 6-6 6"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s-6 6.5-6 11a6 6 0 0 0 12 0c0-1.5-.6-2.6-1.3-3.6.1 1.6-.6 2.4-1.2 2.6C16 8 14 6.5 14 4c-1 1-3 3.5-2 6.5C10.8 9.7 10 8 10.3 6 8.7 8 8 9.8 8 11a4 4 0 0 0 4 4"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>'
};
const THEMES = ['midnight', 'aurora', 'sunset', 'forest', 'neon', 'bloom', 'ocean', 'paper'];

function escapeHTML(str) { return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function initials(name) { return String(name || '?').trim().slice(0, 2).toUpperCase(); }
function animateCountUp(el) {
  const raw = el.textContent;
  const match = raw.match(/^(\d+)/);
  if (!match || prefersReducedMotion) return;
  const target = parseInt(match[1], 10);
  const suffix = raw.slice(match[1].length);
  const duration = 550;
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(eased * target) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function celebrate() {
  if (prefersReducedMotion) return;
  const colors = ['var(--brand)', 'var(--brand-2)', 'var(--brand-3)', 'var(--good)', 'var(--warn)'];
  for (let i = 0; i < 28; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    const duration = 1.6 + Math.random() * 1.2;
    const delay = Math.random() * 0.3;
    el.style.left = Math.random() * 100 + 'vw';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.animationDuration = duration + 's';
    el.style.animationDelay = delay + 's';
    el.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), (duration + delay) * 1000 + 100);
  }
}
function renderMathIn(el) {
  if (window.renderMathInElement && el) {
    try { renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false }); } catch (e) { /* ignore malformed LaTeX */ }
  }
}
function renderMarkdownSafe(raw) {
  // Escape HTML first so markdown syntax still works but raw <tags> from other users can't inject script/HTML.
  const escaped = escapeHTML(raw);
  return window.marked ? marked.parse(escaped) : escaped.replace(/\n/g, '<br>');
}
function todayStr(d = new Date()) { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); }

/* ================= CSV HELPERS ================= */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}
function toCSVField(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function toCSV(rows) { return rows.map((r) => r.map(toCSVField).join(',')).join('\r\n'); }
function downloadCSV(filename, rows) {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
function wireFileToTextarea(fileInputId, textareaId) {
  document.getElementById(fileInputId).addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { document.getElementById(textareaId).value = reader.result; };
    reader.readAsText(file);
  });
}

/* ================= API HELPERS ================= */
async function api(path, opts) {
  const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }, opts));
  let body = null;
  try { body = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) throw new Error((body && body.error) || res.statusText);
  return body;
}
const apiGet = (p) => api(p);
const apiPost = (p, d) => api(p, { method: 'POST', body: JSON.stringify(d || {}) });
const apiPut = (p, d) => api(p, { method: 'PUT', body: JSON.stringify(d || {}) });
const apiPatch = (p, d) => api(p, { method: 'PATCH', body: JSON.stringify(d || {}) });
const apiDel = (p) => api(p, { method: 'DELETE' });

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ================= STATE ================= */
const STATE = {
  me: null,
  subjects: [],
  mnemonics: [],
  resources: [],
  questions: [],
  flashcards: [],
  diagrams: [],
  users: [],
  personal: { tasks: [], pomodoro: { focus: 25, short: 5, long: 15, sessions: [] }, planner: { blocks: [], cells: {}, exams: [] }, qbank: [], qAnswers: [], srs: {} },
  qbank: [],
  srsDue: { due: [], totalCards: 0, dueCount: 0 },
  activity: [],
  currentView: 'dashboard',
  currentSubjectId: null,
  activeChatRoom: null,
  joinedRoom: null,
  socket: null,
  qSessionState: null,
  fcQueue: null,
  unreadByRoom: {}
};

/* ================= THEME ================= */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('studyhub_theme', theme);
  document.querySelectorAll('.theme-swatch').forEach((el) => el.classList.toggle('active', el.dataset.theme === theme));
}

/* ---- reading-comfort text size ---- */
const READ_MIN = 0.9, READ_MAX = 1.3, READ_STEP = 0.05;
function applyReadScale(scale) {
  const clamped = Math.min(READ_MAX, Math.max(READ_MIN, Math.round(scale * 100) / 100));
  document.documentElement.style.setProperty('--read', clamped);
  localStorage.setItem('studyhub_read', clamped);
  const fill = document.getElementById('readFill');
  if (fill) fill.style.width = Math.round(((clamped - READ_MIN) / (READ_MAX - READ_MIN)) * 100) + '%';
}
function currentReadScale() { return parseFloat(localStorage.getItem('studyhub_read')) || 1; }
document.getElementById('readDown').addEventListener('click', () => applyReadScale(currentReadScale() - READ_STEP));
document.getElementById('readUp').addEventListener('click', () => applyReadScale(currentReadScale() + READ_STEP));

/* ---- card cursor spotlight ---- */
let spotCard = null;
const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReducedMotion) {
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest && e.target.closest('.card');
    if (card !== spotCard) {
      if (spotCard) spotCard.classList.remove('spot');
      spotCard = card;
      if (card) card.classList.add('spot');
    }
    if (card) {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    }
  }, { passive: true });
}
function renderThemeSwatches() {
  const wrap = document.getElementById('themeSwatches');
  const grads = {
    midnight: 'linear-gradient(135deg,#7c83ff,#b083ff,#ff8fd0)',
    aurora: 'linear-gradient(135deg,#22d3ee,#818cf8,#34d399)',
    sunset: 'linear-gradient(135deg,#fb7185,#fb923c,#fbbf24)',
    forest: 'linear-gradient(135deg,#10b981,#a3e635,#fbbf24)',
    neon: 'linear-gradient(135deg,#00f5d4,#00c8ff,#ff2ec4)',
    bloom: 'linear-gradient(135deg,#fb6f92,#c084fc,#ffd166)',
    ocean: 'linear-gradient(135deg,#22d3ee,#2dd4bf,#ff8a65)',
    paper: 'linear-gradient(135deg,#4f46e5,#c026d3,#0d9488)'
  };
  wrap.innerHTML = THEMES.map((t) => `<span class="theme-swatch" data-theme="${t}" title="${t[0].toUpperCase() + t.slice(1)}" style="background:${grads[t]}"></span>`).join('');
  wrap.querySelectorAll('.theme-swatch').forEach((el) => el.addEventListener('click', () => applyTheme(el.dataset.theme)));
}

/* ================= AUTH SCREEN ================= */
const authScreen = document.getElementById('authScreen');
const appRoot = document.getElementById('app');
let authMode = 'login';

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('.auth-tab').forEach((t) => t.classList.toggle('active', t.dataset.authtab === mode));
  document.getElementById('loginForm').hidden = mode !== 'login';
  document.getElementById('registerForm').hidden = mode !== 'register';
  document.getElementById('authErr').hidden = true;
}
document.querySelectorAll('.auth-tab').forEach((t) => t.addEventListener('click', () => setAuthMode(t.dataset.authtab)));

function authError(msg) {
  const el = document.getElementById('authErr');
  el.textContent = msg; el.hidden = false;
}

async function refreshBootstrapHint() {
  try {
    const { needsBootstrap } = await apiGet('/api/bootstrap');
    const hint = document.getElementById('authHint');
    const inviteField = document.getElementById('inviteField');
    if (needsBootstrap) {
      hint.textContent = "No one has an account yet — the first person to join becomes the admin. Skip the invite code below.";
      inviteField.style.display = 'none';
      setAuthMode('register');
    } else {
      hint.textContent = 'This study hub is invite-only. Ask an admin for an invite code.';
      inviteField.style.display = '';
    }
  } catch (e) { /* ignore */ }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const { user } = await apiPost('/api/login', { username, password });
    STATE.me = user;
    await bootApp();
  } catch (err) { authError(err.message); }
});
document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    const inviteCode = document.getElementById('regInvite').value;
    const { user } = await apiPost('/api/register', { username, password, inviteCode });
    STATE.me = user;
    await bootApp();
  } catch (err) { authError(err.message); }
});
document.getElementById('btnLogout').addEventListener('click', async () => {
  if (STATE.socket) STATE.socket.disconnect();
  await apiPost('/api/logout', {});
  location.reload();
});

/* ================= BOOT ================= */
async function bootApp() {
  authScreen.hidden = true;
  appRoot.hidden = false;
  const [state, personalRes] = await Promise.all([apiGet('/api/state'), apiGet('/api/personal')]);
  STATE.subjects = state.subjects;
  STATE.mnemonics = state.mnemonics;
  STATE.resources = state.resources;
  STATE.questions = state.questions;
  STATE.flashcards = state.flashcards;
  STATE.diagrams = state.diagrams;
  STATE.users = state.users;
  STATE.me = state.me;
  STATE.personal = personalRes.personal;

  document.getElementById('meAvatar').style.background = STATE.me.color;
  document.getElementById('meAvatar').textContent = initials(STATE.me.username);
  document.getElementById('meUsername').textContent = STATE.me.username;
  document.getElementById('meRole').textContent = STATE.me.role;
  document.getElementById('adminNavGroup').hidden = STATE.me.role !== 'admin';

  connectSocket();
  renderThemeSwatches();
  applyTheme(localStorage.getItem('studyhub_theme') || 'midnight');
  applyReadScale(currentReadScale());
  renderAll();
  setView('dashboard');
  loadQBank();
  loadSrsDue();
  hideBootSplash();
}
function hideBootSplash() {
  const s = document.getElementById('bootSplash');
  if (s) { s.classList.add('gone'); setTimeout(() => s.remove(), 600); }
}

(async function initial() {
  try {
    const { user } = await apiGet('/api/me');
    STATE.me = user;
    await bootApp();
  } catch (e) {
    authScreen.hidden = false;
    refreshBootstrapHint();
    hideBootSplash();
  }
})();

/* ================= SOCKET ================= */
function connectSocket() {
  const socket = io();
  STATE.socket = socket;

  socket.on('hello', ({ onlineTotal }) => setOnline(onlineTotal));
  socket.on('presence:global', ({ onlineTotal }) => setOnline(onlineTotal));

  socket.on('room:history', ({ room, messages }) => {
    if (room !== STATE.activeChatRoom) return;
    document.getElementById('chatMessages').innerHTML = '';
    messages.forEach(renderChatMessage);
    scrollChatBottom();
  });
  socket.on('presence:update', ({ room, users, onlineTotal }) => {
    setOnline(onlineTotal);
    if (room === STATE.joinedRoom) renderChatPresence(users);
  });
  socket.on('chat:message', (msg) => {
    const viewingThisRoom = STATE.currentView === 'chat' && msg.room === STATE.activeChatRoom;
    if (viewingThisRoom) { renderChatMessage(msg); scrollChatBottom(); typingUsers.delete(msg.username); renderTypingIndicator(); }
    else if (msg.userId !== STATE.me.id) {
      STATE.unreadByRoom[msg.room] = (STATE.unreadByRoom[msg.room] || 0) + 1;
      updateUnreadBadges();
      if (messageMentionsMe(msg.text)) toast(`${msg.username} mentioned you in chat`);
    }
  });
  socket.on('chat:typing', ({ room, username }) => {
    if (room === STATE.activeChatRoom && username !== STATE.me.username) showTyping(username);
  });
  socket.on('chat:deleted', ({ id, room }) => {
    const el = document.querySelector(`[data-msg="${id}"]`);
    if (el) el.remove();
    if (STATE.currentView === 'admin') loadAdminMessages();
  });

  socket.on('note:updated', ({ subjectId, text, updatedBy, updatedAt }) => {
    const subj = STATE.subjects.find((s) => s.id === subjectId);
    if (subj) { subj.notes = text; subj.notesUpdatedBy = updatedBy; subj.notesUpdatedAt = updatedAt; }
    if (STATE.currentView === 'notes' && STATE.currentSubjectId === subjectId) {
      const ta = document.getElementById('notesTextarea');
      if (document.activeElement === ta) {
        pendingNoteText = text;
        document.getElementById('notesUpdateText').textContent = `${updatedBy} just updated this note.`;
        document.getElementById('notesUpdateBanner').classList.add('show');
      } else {
        ta.value = text;
        updateNotesMeta(subj);
        if (notesTab === 'preview') renderNotesPreview();
      }
    }
  });

  socket.on('subject:created', ({ subject }) => {
    STATE.subjects.push(subject);
    refreshSubjectDependents();
    toast(`New subject: ${subject.name}`);
  });
  socket.on('subject:deleted', ({ id }) => {
    STATE.subjects = STATE.subjects.filter((s) => s.id !== id);
    if (STATE.currentView === 'notes' && STATE.currentSubjectId === id) { toast('This subject was removed'); setView('subjects'); }
    refreshSubjectDependents();
  });
  socket.on('topic:added', ({ subjectId, topic }) => {
    const s = STATE.subjects.find((x) => x.id === subjectId);
    if (s) s.topics.push(topic);
    if (STATE.currentView === 'subjects') renderSubjects();
  });
  socket.on('topic:deleted', ({ subjectId, topicId }) => {
    const s = STATE.subjects.find((x) => x.id === subjectId);
    if (s) s.topics = s.topics.filter((t) => t.id !== topicId);
    if (STATE.currentView === 'subjects') renderSubjects();
  });
  socket.on('progress:updated', ({ subjectId, topicId, payload }) => {
    const s = STATE.subjects.find((x) => x.id === subjectId);
    const t = s && s.topics.find((x) => x.id === topicId);
    if (t) { t.doneCount = payload.doneCount; t.totalUsers = payload.totalUsers; }
    if (STATE.currentView === 'subjects') renderSubjects();
    if (STATE.currentView === 'dashboard') renderDashboard();
  });
  socket.on('progress:mine', ({ topicId, mine }) => {
    for (const s of STATE.subjects) { const t = s.topics.find((x) => x.id === topicId); if (t) t.mine = mine; }
    if (STATE.currentView === 'subjects') renderSubjects();
  });

  socket.on('mnemonic:added', ({ mnemonic }) => { STATE.mnemonics.unshift(mnemonic); if (STATE.currentView === 'mnemonics') renderMnemonics(); });
  socket.on('mnemonic:deleted', ({ id }) => { STATE.mnemonics = STATE.mnemonics.filter((m) => m.id !== id); if (STATE.currentView === 'mnemonics') renderMnemonics(); });
  socket.on('resource:added', ({ resource }) => { STATE.resources.unshift(resource); if (STATE.currentView === 'resources') renderResources(); });
  socket.on('resource:deleted', ({ id }) => { STATE.resources = STATE.resources.filter((r) => r.id !== id); if (STATE.currentView === 'resources') renderResources(); });

  socket.on('question:added', ({ question }) => { STATE.questions.push(question); document.getElementById('cnt-questions').textContent = STATE.questions.length; if (STATE.currentView === 'practice') { renderQuestionList(); populateQFilterSubjects(); } });
  socket.on('question:deleted', ({ id }) => { STATE.questions = STATE.questions.filter((q) => q.id !== id); document.getElementById('cnt-questions').textContent = STATE.questions.length; if (STATE.currentView === 'practice') renderQuestionList(); });
  socket.on('flashcard:added', ({ card }) => { STATE.flashcards.push(card); if (STATE.currentView === 'flashcards') renderFlashcardList(); loadSrsDue(); });
  socket.on('flashcard:deleted', ({ id }) => { STATE.flashcards = STATE.flashcards.filter((c) => c.id !== id); if (STATE.currentView === 'flashcards') renderFlashcardList(); loadSrsDue(); });
  socket.on('diagram:added', ({ diagram }) => { STATE.diagrams.push(diagram); if (STATE.currentView === 'diagrams') renderDiagrams(); });
  socket.on('diagram:deleted', ({ id }) => { STATE.diagrams = STATE.diagrams.filter((d) => d.id !== id); if (STATE.currentView === 'diagrams') renderDiagrams(); });
  socket.on('question:bulkAdded', ({ questions }) => { STATE.questions.push(...questions); document.getElementById('cnt-questions').textContent = STATE.questions.length; if (STATE.currentView === 'practice') { renderQuestionList(); populateQFilterSubjects(); } });
  socket.on('flashcard:bulkAdded', ({ cards }) => { STATE.flashcards.push(...cards); if (STATE.currentView === 'flashcards') renderFlashcardList(); loadSrsDue(); });
  socket.on('bulk:result', ({ kind, added, skipped }) => { toast(`Imported ${added} ${kind}${added === 1 ? '' : 's'}${skipped ? ` (${skipped} row${skipped === 1 ? '' : 's'} skipped)` : ''}`); });

  socket.on('activity:feed', (item) => {
    STATE.activity.unshift(item);
    if (STATE.activity.length > 60) STATE.activity.length = 60;
    if (STATE.currentView === 'dashboard') renderActivityFeed('activityFeed');
    if (STATE.currentView === 'pomodoro') renderActivityFeed('pomoFeed');
  });
}
function setOnline(n) {
  document.getElementById('onlineCount').textContent = n;
  if (STATE.currentView === 'dashboard') renderDashboard();
}

function updateUnreadBadges() {
  const total = Object.values(STATE.unreadByRoom).reduce((a, n) => a + n, 0);
  const badge = document.getElementById('chatUnread');
  if (total > 0) { badge.hidden = false; badge.textContent = total > 99 ? '99+' : total; } else badge.hidden = true;
  if (STATE.currentView === 'chat') renderChatRooms();
}

function switchRoom(room) {
  if (STATE.joinedRoom === room) return;
  if (STATE.joinedRoom) STATE.socket.emit('room:leave', { room: STATE.joinedRoom });
  STATE.joinedRoom = room;
  if (room) STATE.socket.emit('room:join', { room });
}

/* ================= NAV / ROUTING ================= */
const VIEWS = ['dashboard', 'chat', 'subjects', 'notes', 'planner', 'practice', 'flashcards', 'qbank', 'pomodoro', 'tasks', 'calculators', 'labvalues', 'diagrams', 'mnemonics', 'resources', 'admin'];
function setView(name) {
  if (!VIEWS.includes(name)) name = 'dashboard';
  STATE.currentView = name;
  VIEWS.forEach((v) => document.getElementById('view-' + v).classList.toggle('active', v === name));
  document.querySelectorAll('.navitem[data-view]').forEach((b) => {
    const becomingActive = b.dataset.view === name && !b.classList.contains('active');
    b.classList.toggle('active', b.dataset.view === name);
    if (becomingActive && !prefersReducedMotion) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  });
  document.getElementById('sidebar').classList.remove('open');
  window.scrollTo(0, 0);
  if (name !== 'chat' && name !== 'notes') switchRoom(null);
  if (name === 'dashboard') renderDashboard();
  if (name === 'chat') { renderChatRooms(); openChatRoom(STATE.activeChatRoom || 'global'); }
  if (name === 'admin') { loadAdminAll(); }
  if (name === 'qbank') loadQBank();
  if (name === 'labvalues') renderLabValues();
}
document.querySelectorAll('.navitem[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('sidebar').classList.add('open'));
document.getElementById('scrim').addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));

/* ================= DASHBOARD ================= */
function renderDashboard() {
  document.getElementById('dashGreeting').textContent = `Welcome back, ${STATE.me.username}`;
  document.getElementById('dashDate').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const totalTopics = STATE.subjects.reduce((a, s) => a + s.topics.length, 0);
  const myDone = STATE.subjects.reduce((a, s) => a + s.topics.filter((t) => t.mine).length, 0);
  const todaySessions = STATE.personal.pomodoro.sessions.filter((s) => s.date === todayStr());
  const todayMin = todaySessions.reduce((a, s) => a + s.minutes, 0);

  const qAnswers = STATE.personal.qAnswers || [];
  const readiness = qAnswers.length ? Math.round((qAnswers.filter((a) => a.correct).length / qAnswers.length) * 100) : null;

  const stats = [
    { label: 'Members online', value: document.getElementById('onlineCount').textContent, icon: ICONS.chat, color: 'var(--good)' },
    { label: 'Subjects', value: STATE.subjects.length, icon: ICONS.book, color: 'var(--brand)' },
    { label: 'My topics done', value: `${myDone}/${totalTopics}`, icon: ICONS.check, color: 'var(--brand-3)' },
    { label: 'My focus today', value: `${todayMin}m`, icon: ICONS.clock, color: 'var(--info)' },
    { label: 'Readiness estimate', value: readiness === null ? '—' : readiness + '%', icon: ICONS.target, color: readiness === null ? 'var(--muted)' : readiness >= 75 ? 'var(--good)' : readiness >= 55 ? 'var(--warn)' : 'var(--danger)' }
  ];
  document.getElementById('dashStats').innerHTML = stats.map((s) => `
    <div class="card stat-card"><div class="ico" style="background:${s.color}22;color:${s.color}">${s.icon}</div><div><div class="num">${s.value}</div><div class="lbl">${s.label}</div></div></div>`).join('');
  document.querySelectorAll('#dashStats .num').forEach(animateCountUp);

  renderActivityFeed('activityFeed');
  renderStreakHeatmap();
  renderWeakSubjects();
  renderAccuracyTrend();
  const nav = [['subjects', 'Subjects', ICONS.book], ['practice', 'Practice Qs', ICONS.target], ['flashcards', 'Flashcards', ICONS.book], ['chat', 'Chat', ICONS.chat]];
  document.getElementById('quickNav').innerHTML = nav.map(([v, l, i]) => `<button class="btn" data-jump="${v}" style="justify-content:flex-start">${i}${l}</button>`).join('');
  document.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.jump)));
}

/* ---- streak heatmap ---- */
function renderStreakHeatmap() {
  const counts = {};
  const bump = (dateStr) => { if (dateStr) counts[dateStr] = (counts[dateStr] || 0) + 1; };
  (STATE.personal.pomodoro.sessions || []).forEach((s) => bump(s.date));
  (STATE.personal.qbank || []).forEach((q) => bump(q.date));
  (STATE.personal.qAnswers || []).forEach((a) => bump(todayStr(new Date(a.ts))));
  Object.values(STATE.personal.srs || {}).forEach((s) => { if (s.last_review) bump(todayStr(new Date(s.last_review))); });

  const days = 126;
  const today = new Date();
  const cells = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = todayStr(d);
    const c = counts[key] || 0;
    const level = c === 0 ? 0 : c <= 1 ? 1 : c <= 3 ? 2 : c <= 6 ? 3 : 4;
    cells.push({ key, level, c });
  }
  document.getElementById('streakHeatmap').innerHTML = cells.map((c, i) => `<span class="heatmap-cell" data-level="${c.level}" style="animation-delay:${Math.min(i * 3, 600)}ms" title="${c.key}: ${c.c} ${c.c === 1 ? 'activity' : 'activities'}"></span>`).join('');
  const first = cells[0].key, last = cells[cells.length - 1].key;
  document.getElementById('heatmapRange').textContent = `${first} → ${last}`;
}

/* ---- weak/strong subjects ---- */
function renderWeakSubjects() {
  const bySubj = {};
  (STATE.personal.qAnswers || []).forEach((a) => {
    if (!a.subjectId) return;
    bySubj[a.subjectId] = bySubj[a.subjectId] || { total: 0, correct: 0 };
    bySubj[a.subjectId].total++;
    if (a.correct) bySubj[a.subjectId].correct++;
  });
  const rows = Object.entries(bySubj).filter(([, d]) => d.total >= 3).map(([sid, d]) => ({ subject: subjectById(sid), pct: Math.round((d.correct / d.total) * 100), total: d.total })).filter((r) => r.subject).sort((a, b) => a.pct - b.pct);
  const wrap = document.getElementById('weakSubjects');
  if (!rows.length) { wrap.innerHTML = `<div class="empty">Answer a few practice questions to see your strong and weak subjects here.</div>`; return; }
  wrap.innerHTML = rows.slice(0, 8).map((r) => {
    const color = r.pct < 60 ? 'var(--danger)' : r.pct < 80 ? 'var(--warn)' : 'var(--good)';
    return `<div class="weak-row"><span class="dot" style="background:${r.subject.color}"></span><span class="name">${escapeHTML(r.subject.name)}</span><span class="muted mono" style="font-size:.72rem">${r.total} answered</span><span class="acc" style="background:${color}22;color:${color}">${r.pct}%</span></div>`;
  }).join('');
}

/* ---- accuracy trend chart ---- */
function renderAccuracyTrend() {
  const wrap = document.getElementById('accuracyTrend');
  const days = 14;
  const today = new Date();
  const byDate = {};
  (STATE.personal.qAnswers || []).forEach((a) => {
    const key = todayStr(new Date(a.ts));
    byDate[key] = byDate[key] || { total: 0, correct: 0 };
    byDate[key].total++;
    if (a.correct) byDate[key].correct++;
  });
  const points = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = todayStr(d);
    const stat = byDate[key];
    points.push({ key, total: stat ? stat.total : 0, pct: stat && stat.total ? (stat.correct / stat.total) * 100 : null });
  }
  if (!points.some((p) => p.total > 0)) { wrap.innerHTML = `<div class="empty">Answer some practice questions to see your trend here.</div>`; return; }

  const w = 560, h = 130, pad = 6, baseline = h - 22;
  const maxTotal = Math.max(1, ...points.map((p) => p.total));
  const barW = (w - pad * 2) / points.length;
  const bars = points.map((p, i) => {
    const bh = p.total ? (p.total / maxTotal) * (baseline - 14) : 0;
    const x = pad + i * barW;
    return `<rect x="${(x + 2).toFixed(1)}" y="${(baseline - bh).toFixed(1)}" width="${(barW - 4).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="var(--surface-3)"><title>${p.key}: ${p.total} answered</title></rect>`;
  }).join('');
  const lp = points.map((p, i) => ({ x: pad + i * barW + barW / 2, y: p.pct === null ? null : baseline - (p.pct / 100) * (baseline - 14) })).filter((p) => p.y !== null);
  const pathD = lp.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const dots = lp.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="var(--brand)"/>`).join('');
  wrap.innerHTML = `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:130px" preserveAspectRatio="none">
      ${bars}
      ${pathD ? `<path d="${pathD}" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      ${dots}
    </svg>
    <div class="row" style="justify-content:space-between;font-size:.68rem;color:var(--muted);margin-top:2px"><span>${points[0].key}</span><span class="muted">bars = questions/day · line = accuracy</span><span>Today</span></div>`;
}

function renderActivityFeed(elId) {
  const wrap = document.getElementById(elId);
  if (!STATE.activity.length) { wrap.innerHTML = `<div class="empty">No study sessions logged yet today.</div>`; return; }
  wrap.innerHTML = STATE.activity.slice(0, 20).map((a) => `
    <div class="feed-item"><span class="avatar" style="width:24px;height:24px;font-size:.62rem;background:${a.color}">${initials(a.username)}</span>
    <span><strong>${escapeHTML(a.username)}</strong> focused <span class="mono badge">${a.minutes}m</span>${a.subjectName ? ' on ' + escapeHTML(a.subjectName) : ''}</span>
    <span class="muted" style="margin-left:auto;font-size:.72rem">${timeAgo(a.ts)}</span></div>`).join('');
}

/* ================= CHAT ================= */
function renderChatRooms() {
  const rooms = [{ id: 'global', name: 'Study Hall', color: 'var(--brand)' }].concat(STATE.subjects.map((s) => ({ id: 'subject:' + s.id, name: s.name, color: s.color })));
  document.getElementById('chatRoomList').innerHTML = rooms.map((r) => `<button class="chat-room-btn ${STATE.activeChatRoom === r.id ? 'active' : ''}" data-room="${r.id}"><span class="dot" style="background:${r.color}"></span>${escapeHTML(r.name)}${STATE.unreadByRoom[r.id] ? `<span class="room-unread">${STATE.unreadByRoom[r.id] > 9 ? '9+' : STATE.unreadByRoom[r.id]}</span>` : ''}</button>`).join('');
  document.querySelectorAll('.chat-room-btn').forEach((b) => b.addEventListener('click', () => openChatRoom(b.dataset.room)));
}
function openChatRoom(room) {
  STATE.activeChatRoom = room;
  const rooms = [{ id: 'global', name: 'Study Hall' }].concat(STATE.subjects.map((s) => ({ id: 'subject:' + s.id, name: s.name })));
  document.getElementById('chatRoomTitle').textContent = (rooms.find((r) => r.id === room) || {}).name || room;
  document.querySelectorAll('.chat-room-btn').forEach((b) => b.classList.toggle('active', b.dataset.room === room));
  document.getElementById('chatMessages').innerHTML = '';
  typingUsers.forEach((t) => clearTimeout(t));
  typingUsers.clear();
  renderTypingIndicator();
  delete STATE.unreadByRoom[room];
  updateUnreadBadges();
  switchRoom(room);
}
function linkifyMentions(text) {
  const escaped = escapeHTML(text);
  const usernames = STATE.users.map((u) => u.username).sort((a, b) => b.length - a.length);
  if (!usernames.length) return escaped;
  const pattern = new RegExp('@(' + usernames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi');
  return escaped.replace(pattern, (m) => `<span class="mention">${m}</span>`);
}
function messageMentionsMe(text) {
  if (!STATE.me) return false;
  const re = new RegExp('@' + STATE.me.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  return re.test(text);
}
function renderChatMessage(msg) {
  const wrap = document.getElementById('chatMessages');
  const mine = msg.userId === STATE.me.id;
  const mentioned = !mine && messageMentionsMe(msg.text);
  const div = document.createElement('div');
  div.className = 'msg' + (mine ? ' mine' : '') + (mentioned ? ' mentions-me' : '');
  div.dataset.msg = msg.id;
  div.innerHTML = `
    <span class="avatar" style="background:${msg.color}">${initials(msg.username)}</span>
    <div><div class="meta">${mine ? 'You' : escapeHTML(msg.username)} · ${timeAgo(msg.ts)}</div>
    <div class="bubble">${linkifyMentions(msg.text)}${(STATE.me.role === 'admin') ? `<button class="msg-del btn icon ghost sm" data-del-msg="${msg.id}" title="Delete">${ICONS.trash}</button>` : ''}</div></div>`;
  wrap.appendChild(div);
  const delBtn = div.querySelector('[data-del-msg]');
  if (delBtn) delBtn.addEventListener('click', () => apiDel('/api/admin/messages/' + msg.id).catch(() => {}));
  if (mentioned) toast(`${msg.username} mentioned you`);
}
function scrollChatBottom() { const wrap = document.getElementById('chatMessages'); wrap.scrollTop = wrap.scrollHeight; }
function renderChatPresence(users) {
  document.getElementById('chatPresence').innerHTML = users.slice(0, 8).map((u) => `<span class="avatar" style="background:${u.color}" title="${escapeHTML(u.username)}">${initials(u.username)}</span>`).join('');
}
function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !STATE.activeChatRoom) return;
  STATE.socket.emit('chat:send', { room: STATE.activeChatRoom, text });
  input.value = '';
  document.getElementById('mentionMenu').hidden = true;
  mentionMatches = [];
}
document.getElementById('chatSend').addEventListener('click', sendChat);
document.getElementById('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !mentionMatches.length) sendChat(); });

let lastTypingEmit = 0;
document.getElementById('chatInput').addEventListener('input', () => {
  if (!STATE.activeChatRoom) return;
  const now = Date.now();
  if (now - lastTypingEmit > 1500) { STATE.socket.emit('chat:typing', { room: STATE.activeChatRoom }); lastTypingEmit = now; }
  updateMentionMenu();
});

/* ---- @mention autocomplete ---- */
let mentionMatches = [];
let mentionSel = 0;
function currentMentionQuery() {
  const input = document.getElementById('chatInput');
  const upToCursor = input.value.slice(0, input.selectionStart);
  const m = upToCursor.match(/(?:^|\s)@([a-zA-Z0-9 _.-]{0,24})$/);
  return m ? m[1] : null;
}
function updateMentionMenu() {
  const q = currentMentionQuery();
  const menu = document.getElementById('mentionMenu');
  if (q === null) { menu.hidden = true; mentionMatches = []; return; }
  mentionMatches = STATE.users.filter((u) => u.username.toLowerCase().startsWith(q.toLowerCase())).slice(0, 6);
  if (!mentionMatches.length) { menu.hidden = true; return; }
  mentionSel = 0;
  menu.hidden = false;
  menu.innerHTML = mentionMatches.map((u, i) => `<button class="mention-item ${i === 0 ? 'sel' : ''}" data-idx="${i}"><span class="avatar" style="width:20px;height:20px;font-size:.58rem;background:${u.color}">${initials(u.username)}</span>${escapeHTML(u.username)}</button>`).join('');
  menu.querySelectorAll('.mention-item').forEach((el) => el.addEventListener('click', () => insertMention(+el.dataset.idx)));
}
function insertMention(idx) {
  const u = mentionMatches[idx];
  if (!u) return;
  const input = document.getElementById('chatInput');
  const cursor = input.selectionStart;
  const before = input.value.slice(0, cursor).replace(/@([a-zA-Z0-9 _.-]{0,24})$/, '@' + u.username + ' ');
  const after = input.value.slice(cursor);
  input.value = before + after;
  input.focus();
  const newPos = before.length;
  input.setSelectionRange(newPos, newPos);
  document.getElementById('mentionMenu').hidden = true;
  mentionMatches = [];
}
document.getElementById('chatInput').addEventListener('keydown', (e) => {
  if (!mentionMatches.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); mentionSel = (mentionSel + 1) % mentionMatches.length; highlightMentionSel(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); mentionSel = (mentionSel - 1 + mentionMatches.length) % mentionMatches.length; highlightMentionSel(); }
  else if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); insertMention(mentionSel); }
  else if (e.key === 'Escape') { document.getElementById('mentionMenu').hidden = true; mentionMatches = []; }
});
function highlightMentionSel() {
  document.querySelectorAll('.mention-item').forEach((el) => el.classList.toggle('sel', +el.dataset.idx === mentionSel));
}
document.getElementById('chatInput').addEventListener('blur', () => {
  setTimeout(() => { document.getElementById('mentionMenu').hidden = true; mentionMatches = []; }, 150);
});
const typingUsers = new Map(); // username -> timeout id, per current room
function showTyping(username) {
  clearTimeout(typingUsers.get(username));
  typingUsers.set(username, setTimeout(() => { typingUsers.delete(username); renderTypingIndicator(); }, 2500));
  renderTypingIndicator();
}
function renderTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  const names = Array.from(typingUsers.keys());
  if (!names.length) { el.classList.remove('show'); el.textContent = ''; el.hidden = true; return; }
  const label = names.length === 1 ? `${names[0]} is typing` : names.length === 2 ? `${names.join(' and ')} are typing` : `${names.length} people are typing`;
  el.hidden = false;
  el.innerHTML = `${escapeHTML(label)}<span class="typing-dots"><span></span><span></span><span></span></span>`;
  requestAnimationFrame(() => el.classList.add('show'));
}

/* ================= SUBJECTS ================= */
let chosenColor = '#8b9eff';
const COLORS = ['#8b9eff', '#ff9ec9', '#7be0d6', '#ffb454', '#56d4a0', '#c4a7ff', '#ff7a93', '#6db3ff', '#f2d06b', '#a3e635'];
function renderColorPicker() {
  document.getElementById('subjColors').innerHTML = COLORS.map((c) => `<span class="c ${c === chosenColor ? 'active' : ''}" style="background:${c}" data-color="${c}"></span>`).join('');
  document.querySelectorAll('#subjColors .c').forEach((c) => c.addEventListener('click', () => { chosenColor = c.dataset.color; renderColorPicker(); }));
}
document.getElementById('subjectAddToggle').addEventListener('click', () => {
  const f = document.getElementById('subjectForm');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
  chosenColor = COLORS[STATE.subjects.length % COLORS.length];
  renderColorPicker();
  document.getElementById('subjName').focus();
});
document.getElementById('subjCancel').addEventListener('click', () => (document.getElementById('subjectForm').style.display = 'none'));
document.getElementById('subjSave').addEventListener('click', () => {
  const name = document.getElementById('subjName').value.trim();
  if (!name) return toast('Give the subject a name');
  STATE.socket.emit('subject:create', { name, color: chosenColor });
  document.getElementById('subjName').value = '';
  document.getElementById('subjectForm').style.display = 'none';
});

let openSubjectId = null;
function renderSubjects() {
  document.getElementById('cnt-subjects').textContent = STATE.subjects.length;
  const grid = document.getElementById('subjectsGrid');
  if (!STATE.subjects.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">📚</div>No subjects yet. Add the first one above.</div>`; return; }
  grid.innerHTML = STATE.subjects.map((s) => {
    const doneMine = s.topics.filter((t) => t.mine).length;
    const pct = s.topics.length ? Math.round((doneMine / s.topics.length) * 100) : 0;
    return `
    <div class="card subject-card ${openSubjectId === s.id ? 'open' : ''}" data-subj="${s.id}">
      <div class="head">
        <span class="dot" style="background:${s.color};width:11px;height:11px"></span>
        <span class="name">${escapeHTML(s.name)}</span>
        <button class="btn sm ghost" data-notes-open="${s.id}">Notes</button>
        ${STATE.me.role === 'admin' ? `<button class="btn icon ghost danger" data-subj-del="${s.id}" title="Delete subject">${ICONS.trash}</button>` : ''}
        <span style="display:flex" data-subj-toggle="${s.id}">${ICONS.chev}</span>
      </div>
      <div class="muted" style="font-size:.76rem;margin-top:8px">${doneMine}/${s.topics.length} topics — your progress</div>
      <div class="progress" style="margin-top:6px"><i style="width:${pct}%;background:${s.color}"></i></div>
      <div class="topics" data-subj-body="${s.id}">
        ${s.topics.map((t) => `
          <div class="list-item">
            <button class="check ${t.mine ? 'on' : ''}" data-topic="${s.id}|${t.id}">${ICONS.check}</button>
            <span style="flex:1;font-size:.85rem;${t.mine ? 'text-decoration:line-through;color:var(--muted)' : ''}">${escapeHTML(t.name)}</span>
            <span class="community-count" title="learners who finished this">${t.doneCount}/${t.totalUsers}</span>
            <button class="btn icon ghost danger" data-topic-del="${s.id}|${t.id}">${ICONS.trash}</button>
          </div>`).join('') || `<div class="muted" style="font-size:.8rem;padding:8px 4px">No topics yet.</div>`}
        <div class="row tight" style="margin-top:10px">
          <input class="input" placeholder="Add a topic…" data-topic-input="${s.id}" style="flex:1">
          <button class="btn sm primary" data-topic-add="${s.id}">Add</button>
        </div>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('[data-notes-open]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openNotes(b.dataset.notesOpen); }));
  grid.querySelectorAll('[data-subj-toggle]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); const id = el.dataset.subjToggle; openSubjectId = openSubjectId === id ? null : id; renderSubjects(); }));
  grid.querySelectorAll('.subject-card .head').forEach((h) => h.addEventListener('click', (e) => {
    if (e.target.closest('[data-subj-del]') || e.target.closest('[data-notes-open]')) return;
    const id = h.closest('.subject-card').dataset.subj;
    openSubjectId = openSubjectId === id ? null : id;
    renderSubjects();
  }));
  grid.querySelectorAll('[data-subj-del]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('Delete this subject and all its topics for everyone?')) return;
    await apiDel('/api/admin/subjects/' + b.dataset.subjDel).catch((err) => toast(err.message));
  }));
  grid.querySelectorAll('[data-topic]').forEach((b) => b.addEventListener('click', () => { const [sid, tid] = b.dataset.topic.split('|'); STATE.socket.emit('progress:toggle', { subjectId: sid, topicId: tid }); }));
  grid.querySelectorAll('[data-topic-del]').forEach((b) => b.addEventListener('click', () => { const [sid, tid] = b.dataset.topicDel.split('|'); STATE.socket.emit('topic:delete', { subjectId: sid, topicId: tid }); }));
  grid.querySelectorAll('[data-topic-add]').forEach((b) => b.addEventListener('click', () => {
    const sid = b.dataset.topicAdd;
    const input = grid.querySelector(`[data-topic-input="${sid}"]`);
    const v = input.value.trim(); if (!v) return;
    STATE.socket.emit('topic:add', { subjectId: sid, name: v });
    input.value = '';
  }));
  grid.querySelectorAll('[data-topic-input]').forEach((inp) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') grid.querySelector(`[data-topic-add="${inp.dataset.topicInput}"]`).click(); }));
}

function refreshSubjectDependents() {
  renderSubjects();
  document.getElementById('qbSubject').innerHTML = subjectOptionsHTML();
  document.getElementById('pomoSubject').innerHTML = subjectOptionsHTML();
  document.getElementById('mnemoSubject').innerHTML = subjectOptionsHTML();
  document.getElementById('qSubject').innerHTML = subjectOptionsHTML();
  document.getElementById('fcSubject').innerHTML = subjectOptionsHTML();
  document.getElementById('dgSubject').innerHTML = subjectOptionsHTML();
  populateQFilterSubjects();
  renderChatRooms();
  renderDashboard();
}
function populateQFilterSubjects() {
  const sel = document.getElementById('qFilterSubject');
  const current = sel.value;
  sel.innerHTML = '<option value="">All subjects</option>' + subjectOptionsHTML();
  sel.value = current;
}
function subjectOptionsHTML(selectedId) {
  return STATE.subjects.map((s) => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${escapeHTML(s.name)}</option>`).join('');
}
function subjectById(id) { return STATE.subjects.find((s) => s.id === id); }

/* ================= NOTES (live collaborative) ================= */
let pendingNoteText = null;
let noteSaveTimer = null;
let notesTab = 'source';
function openNotes(subjectId) {
  const s = subjectById(subjectId);
  if (!s) return;
  STATE.currentSubjectId = subjectId;
  document.getElementById('notesSubjectName').textContent = s.name;
  document.getElementById('notesTextarea').value = s.notes || '';
  updateNotesMeta(s);
  document.getElementById('notesUpdateBanner').classList.remove('show');
  document.getElementById('notesHistoryPanel').style.display = 'none';
  setNotesTab('source');
  setView('notes');
  switchRoom('subject:' + subjectId);
}
function updateNotesMeta(s) {
  document.getElementById('notesUpdatedMeta').textContent = s.notesUpdatedBy ? `Last edited by ${s.notesUpdatedBy} · ${timeAgo(s.notesUpdatedAt)}` : 'No edits yet';
}
function setNotesTab(tab) {
  notesTab = tab;
  document.getElementById('notesTabSource').classList.toggle('tab-active', tab === 'source');
  document.getElementById('notesTabPreview').classList.toggle('tab-active', tab === 'preview');
  document.getElementById('notesTextarea').style.display = tab === 'source' ? 'block' : 'none';
  document.getElementById('notesPreview').style.display = tab === 'preview' ? 'block' : 'none';
  if (tab === 'preview') renderNotesPreview();
}
function renderNotesPreview() {
  const preview = document.getElementById('notesPreview');
  preview.innerHTML = renderMarkdownSafe(document.getElementById('notesTextarea').value);
  renderMathIn(preview);
}
document.getElementById('notesTabSource').addEventListener('click', () => setNotesTab('source'));
document.getElementById('notesTabPreview').addEventListener('click', () => setNotesTab('preview'));
document.getElementById('notesBack').addEventListener('click', () => { switchRoom(null); setView('subjects'); });

document.getElementById('notesHistoryBtn').addEventListener('click', async () => {
  const panel = document.getElementById('notesHistoryPanel');
  const opening = panel.style.display === 'none';
  panel.style.display = opening ? 'block' : 'none';
  if (opening) await loadNotesHistory();
});
document.getElementById('notesHistoryClose').addEventListener('click', () => (document.getElementById('notesHistoryPanel').style.display = 'none'));
async function loadNotesHistory() {
  const list = document.getElementById('notesHistoryList');
  list.innerHTML = `<div class="muted" style="font-size:.85rem;padding:8px 4px">Loading…</div>`;
  try {
    const { history } = await apiGet(`/api/subjects/${STATE.currentSubjectId}/history`);
    if (!history.length) { list.innerHTML = `<div class="empty">No earlier versions yet — history builds up as edits happen over time.</div>`; return; }
    list.innerHTML = history.map((h) => `
      <div class="list-item">
        <div style="flex:1"><div style="font-weight:600;font-size:.85rem">${escapeHTML(h.authorName)}</div><div class="muted" style="font-size:.72rem">${timeAgo(h.ts)} · ${h.text.length} chars</div></div>
        <button class="btn sm ghost" data-history-preview="${h.index}">Preview</button>
        <button class="btn sm primary" data-history-restore="${h.index}">Restore</button>
      </div>`).join('');
    list.querySelectorAll('[data-history-preview]').forEach((b) => b.addEventListener('click', () => {
      const entry = history.find((h) => h.index === +b.dataset.historyPreview);
      if (entry) { setNotesTab('source'); document.getElementById('notesTextarea').value = entry.text; toast('Previewing an old version — click Restore to keep it, or reopen Notes to discard'); }
    }));
    list.querySelectorAll('[data-history-restore]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Restore this version? The current text will be saved to history first, so nothing is lost.')) return;
      try {
        const res = await apiPost(`/api/subjects/${STATE.currentSubjectId}/restore`, { index: +b.dataset.historyRestore });
        document.getElementById('notesTextarea').value = res.notes;
        const subj = subjectById(STATE.currentSubjectId);
        if (subj) { subj.notes = res.notes; subj.notesUpdatedBy = res.notesUpdatedBy; subj.notesUpdatedAt = res.notesUpdatedAt; updateNotesMeta(subj); }
        if (notesTab === 'preview') renderNotesPreview();
        document.getElementById('notesHistoryPanel').style.display = 'none';
        toast('Restored');
      } catch (e) { toast(e.message); }
    }));
  } catch (e) { list.innerHTML = `<div class="empty">Couldn't load history.</div>`; }
}
document.getElementById('notesTextarea').addEventListener('input', () => {
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(() => {
    if (!STATE.currentSubjectId) return;
    STATE.socket.emit('note:update', { subjectId: STATE.currentSubjectId, text: document.getElementById('notesTextarea').value });
  }, 350);
});
document.getElementById('notesUpdateReload').addEventListener('click', () => {
  if (pendingNoteText !== null) document.getElementById('notesTextarea').value = pendingNoteText;
  pendingNoteText = null;
  document.getElementById('notesUpdateBanner').classList.remove('show');
  const s = subjectById(STATE.currentSubjectId);
  if (s) updateNotesMeta(s);
  if (notesTab === 'preview') renderNotesPreview();
});

/* ================= PLANNER ================= */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function renderPlanner() {
  const planner = STATE.personal.planner;
  const g = document.getElementById('plannerGrid');
  let html = `<div></div>` + DAYS.map((d) => `<div class="hd">${d}</div>`).join('');
  planner.blocks.forEach((label, bi) => {
    html += `<div class="lbl" contenteditable="true" data-block="${bi}">${escapeHTML(label)}</div>`;
    DAYS.forEach((d) => { const key = d + '-' + bi; html += `<div class="planner-cell" contenteditable="true" data-cell="${key}" data-ph="+">${escapeHTML(planner.cells[key] || '')}</div>`; });
  });
  g.innerHTML = html;
  const savePlanner = () => apiPut('/api/planner', { blocks: planner.blocks, cells: planner.cells }).catch(() => {});
  g.querySelectorAll('[data-cell]').forEach((c) => c.addEventListener('blur', () => { const v = c.textContent.trim(); if (v) planner.cells[c.dataset.cell] = v; else delete planner.cells[c.dataset.cell]; savePlanner(); }));
  g.querySelectorAll('[data-block]').forEach((c) => c.addEventListener('blur', () => { planner.blocks[+c.dataset.block] = c.textContent.trim() || 'Block'; savePlanner(); }));
  renderExams();
}
document.getElementById('examAdd').addEventListener('click', async () => {
  const name = document.getElementById('examName').value.trim();
  const date = document.getElementById('examDate').value;
  if (!name || !date) return toast('Add a name and a date');
  const { exam } = await apiPost('/api/planner/exams', { name, date });
  STATE.personal.planner.exams.push(exam);
  document.getElementById('examName').value = ''; document.getElementById('examDate').value = '';
  renderExams();
});
function renderExams() {
  const wrap = document.getElementById('examList');
  const sorted = [...STATE.personal.planner.exams].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) { wrap.innerHTML = `<div class="empty">No exams on the calendar yet.</div>`; return; }
  const now = new Date(todayStr());
  wrap.innerHTML = sorted.map((ex) => {
    const days = Math.ceil((new Date(ex.date) - now) / 86400000);
    const color = days < 0 ? 'var(--muted)' : days <= 7 ? 'var(--danger)' : days <= 21 ? 'var(--warn)' : 'var(--good)';
    return `<div class="exam-pill"><div class="days mono" style="color:${color}">${days < 0 ? 'done' : days}</div>
      <div style="flex:1"><div style="font-weight:700">${escapeHTML(ex.name)}</div><div class="muted" style="font-size:.75rem">${new Date(ex.date + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div></div>
      <button class="btn icon ghost danger" data-exam-del="${ex.id}">${ICONS.trash}</button></div>`;
  }).join('');
  wrap.querySelectorAll('[data-exam-del]').forEach((b) => b.addEventListener('click', async () => {
    await apiDel('/api/planner/exams/' + b.dataset.examDel);
    STATE.personal.planner.exams = STATE.personal.planner.exams.filter((e) => e.id !== b.dataset.examDel);
    renderExams();
  }));
}

/* ================= QBANK ================= */
document.getElementById('qbDate').value = todayStr();
async function loadQBank() { const { qbank } = await apiGet('/api/qbank'); STATE.qbank = qbank; renderQBank(); }
document.getElementById('qbAdd').addEventListener('click', async () => {
  const subjectId = document.getElementById('qbSubject').value;
  const total = +document.getElementById('qbTotal').value;
  const correct = +document.getElementById('qbCorrect').value;
  const date = document.getElementById('qbDate').value || todayStr();
  if (!subjectId) return toast('Add a subject first');
  if (!total || correct < 0 || correct > total) return toast('Check your numbers');
  try {
    await apiPost('/api/qbank', { subjectId, total, correct, date });
    document.getElementById('qbTotal').value = ''; document.getElementById('qbCorrect').value = '';
    toast('Block logged');
    loadQBank();
  } catch (err) { toast(err.message); }
});
function renderQBank() {
  const totalQ = STATE.qbank.reduce((a, q) => a + q.total, 0);
  const totalC = STATE.qbank.reduce((a, q) => a + q.correct, 0);
  document.getElementById('qbStats').innerHTML = [
    { l: 'Blocks logged (group)', v: STATE.qbank.length },
    { l: 'Questions attempted', v: totalQ },
    { l: 'Group accuracy', v: totalQ ? Math.round((totalC / totalQ) * 100) + '%' : '—' }
  ].map((s) => `<div class="card stat-card"><div><div class="num">${s.v}</div><div class="lbl">${s.l}</div></div></div>`).join('');

  const bySubj = {};
  STATE.qbank.forEach((q) => { bySubj[q.subjectId] = bySubj[q.subjectId] || { total: 0, correct: 0 }; bySubj[q.subjectId].total += q.total; bySubj[q.subjectId].correct += q.correct; });
  const rows = Object.entries(bySubj);
  const bySubjWrap = document.getElementById('qbBySubject');
  bySubjWrap.innerHTML = rows.length ? rows.map(([sid, d]) => {
    const s = subjectById(sid); if (!s) return '';
    const pct = Math.round((d.correct / d.total) * 100);
    return `<div><div class="row" style="justify-content:space-between;margin-bottom:4px"><span style="font-size:.84rem;font-weight:600"><span class="dot" style="background:${s.color};display:inline-block;margin-right:6px"></span>${escapeHTML(s.name)}</span><span class="mono muted" style="font-size:.8rem">${d.correct}/${d.total} · ${pct}%</span></div><div class="progress"><i style="width:${pct}%;background:${s.color}"></i></div></div>`;
  }).join('') : `<div class="empty">Log a block to see accuracy trends.</div>`;

  const tableWrap = document.getElementById('qbTableWrap');
  if (!STATE.qbank.length) { tableWrap.innerHTML = `<div class="empty">No blocks logged yet.</div>`; return; }
  tableWrap.innerHTML = `<table><thead><tr><th>Date</th><th>Who</th><th>Subject</th><th>Score</th><th>Accuracy</th><th></th></tr></thead><tbody>
    ${STATE.qbank.slice(0, 60).map((q) => {
      const s = subjectById(q.subjectId); const pct = Math.round((q.correct / q.total) * 100);
      const mine = q.username === STATE.me.username;
      return `<tr><td class="mono">${q.date}</td><td><span class="avatar" style="width:20px;height:20px;font-size:.58rem;background:${q.color};display:inline-grid;margin-right:6px;vertical-align:middle">${initials(q.username)}</span>${escapeHTML(q.username)}</td><td>${s ? escapeHTML(s.name) : '—'}</td><td class="mono">${q.correct}/${q.total}</td><td class="mono" style="color:${pct >= 70 ? 'var(--good)' : pct >= 50 ? 'var(--warn)' : 'var(--danger)'}">${pct}%</td><td>${(mine || STATE.me.role === 'admin') ? `<button class="btn icon ghost danger" data-qb-del="${q.id}">${ICONS.trash}</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table>`;
  tableWrap.querySelectorAll('[data-qb-del]').forEach((b) => b.addEventListener('click', async () => { await apiDel('/api/qbank/' + b.dataset.qbDel); loadQBank(); }));
}

/* ================= POMODORO ================= */
let pomo = { mode: 'focus', remaining: 25 * 60, running: false, tickId: null, cycles: 0 };
function pomoDurations() { return { focus: +document.getElementById('setFocus').value * 60, short: +document.getElementById('setShort').value * 60, long: +document.getElementById('setLong').value * 60 }; }
function renderModePills() { document.getElementById('modePills').innerHTML = ['focus', 'short', 'long'].map((m) => `<span class="mode-pill ${pomo.mode === m ? 'active' : ''}">${m === 'focus' ? 'Focus' : m === 'short' ? 'Short break' : 'Long break'}</span>`).join(''); }
function updateTimerDisplay() {
  const total = pomoDurations()[pomo.mode] || 1;
  document.getElementById('timerRing').style.setProperty('--p', Math.round((1 - pomo.remaining / total) * 100));
  document.getElementById('timerTime').textContent = `${String(Math.floor(pomo.remaining / 60)).padStart(2, '0')}:${String(pomo.remaining % 60).padStart(2, '0')}`;
  document.getElementById('timerModeLabel').textContent = pomo.mode === 'focus' ? 'Focus' : pomo.mode === 'short' ? 'Short break' : 'Long break';
  renderModePills();
}
function pomoSwitchMode(mode) { pomo.mode = mode; pomo.remaining = pomoDurations()[mode]; updateTimerDisplay(); }
document.getElementById('pomoStart').addEventListener('click', () => { pomo.running = true; document.getElementById('pomoStart').disabled = true; document.getElementById('pomoPause').disabled = false; pomo.tickId = setInterval(pomoTick, 1000); });
document.getElementById('pomoPause').addEventListener('click', () => { pomo.running = false; clearInterval(pomo.tickId); document.getElementById('pomoStart').disabled = false; document.getElementById('pomoPause').disabled = true; });
document.getElementById('pomoReset').addEventListener('click', () => { pomo.running = false; clearInterval(pomo.tickId); document.getElementById('pomoStart').disabled = false; document.getElementById('pomoPause').disabled = true; pomoSwitchMode('focus'); pomo.cycles = 0; });
['setFocus', 'setShort', 'setLong'].forEach((id, idx) => {
  const mode = ['focus', 'short', 'long'][idx];
  document.getElementById(id).addEventListener('change', () => { if (pomo.mode === mode && !pomo.running) pomo.remaining = pomoDurations()[mode]; updateTimerDisplay(); apiPut('/api/pomodoro/settings', { focus: +document.getElementById('setFocus').value, short: +document.getElementById('setShort').value, long: +document.getElementById('setLong').value }).catch(() => {}); });
});
function pomoTick() {
  pomo.remaining--;
  if (pomo.remaining <= 0) {
    if (pomo.mode === 'focus') {
      const mins = +document.getElementById('setFocus').value;
      const subjectId = document.getElementById('pomoSubject').value || null;
      STATE.socket.emit('pomodoro:complete', { minutes: mins, subjectId });
      pomo.cycles++;
      pomoSwitchMode(pomo.cycles % 4 === 0 ? 'long' : 'short');
      toast('Focus session complete — nice work');
    } else { pomoSwitchMode('focus'); toast("Break's over — back to it"); }
  }
  updateTimerDisplay();
}

/* ================= TASKS ================= */
function renderTasks() {
  const wrap = document.getElementById('taskList');
  const tasks = STATE.personal.tasks;
  if (!tasks.length) { wrap.innerHTML = `<div class="empty">No tasks yet — add your first one above.</div>`; return; }
  wrap.innerHTML = tasks.map((t) => `<div class="list-item"><button class="check ${t.done ? 'on' : ''}" data-task="${t.id}">${ICONS.check}</button><span style="flex:1;${t.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${escapeHTML(t.text)}</span><button class="btn icon ghost danger" data-task-del="${t.id}">${ICONS.trash}</button></div>`).join('');
  wrap.querySelectorAll('[data-task]').forEach((b) => b.addEventListener('click', async () => { const t = tasks.find((x) => x.id === b.dataset.task); t.done = !t.done; renderTasks(); await apiPatch('/api/tasks/' + t.id, { done: t.done }); }));
  wrap.querySelectorAll('[data-task-del]').forEach((b) => b.addEventListener('click', async () => { STATE.personal.tasks = tasks.filter((x) => x.id !== b.dataset.taskDel); renderTasks(); await apiDel('/api/tasks/' + b.dataset.taskDel); }));
}
document.getElementById('taskAdd').addEventListener('click', addTask);
document.getElementById('taskInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
async function addTask() {
  const input = document.getElementById('taskInput');
  const v = input.value.trim(); if (!v) return;
  input.value = '';
  const { task } = await apiPost('/api/tasks', { text: v });
  STATE.personal.tasks.unshift(task);
  renderTasks();
}

/* ================= CALCULATORS ================= */
const CALCULATORS = [
  { id: 'bmi', title: 'BMI', fields: [{ id: 'w', label: 'Weight (kg)' }, { id: 'h', label: 'Height (cm)' }], compute: (v) => { if (!v.w || !v.h) return null; const m = v.h / 100, bmi = v.w / (m * m); return { val: bmi.toFixed(1), unit: 'kg/m²', note: bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese' }; } },
  { id: 'bsa', title: 'Body Surface Area (Mosteller)', fields: [{ id: 'w', label: 'Weight (kg)' }, { id: 'h', label: 'Height (cm)' }], compute: (v) => { if (!v.w || !v.h) return null; return { val: Math.sqrt((v.h * v.w) / 3600).toFixed(2), unit: 'm²' }; } },
  { id: 'crcl', title: 'Creatinine Clearance (Cockcroft–Gault)', fields: [{ id: 'age', label: 'Age (yrs)' }, { id: 'w', label: 'Weight (kg)' }, { id: 'cr', label: 'Creatinine (mg/dL)' }, { id: 'sex', label: 'Sex', type: 'select', options: ['Male', 'Female'] }], compute: (v) => { if (!v.age || !v.w || !v.cr) return null; return { val: (((140 - v.age) * v.w * (v.sex === 'Female' ? 0.85 : 1)) / (72 * v.cr)).toFixed(1), unit: 'mL/min' }; } },
  { id: 'ag', title: 'Anion Gap', fields: [{ id: 'na', label: 'Sodium (mEq/L)' }, { id: 'cl', label: 'Chloride (mEq/L)' }, { id: 'hco3', label: 'Bicarbonate (mEq/L)' }], compute: (v) => { if (!v.na && !v.cl && !v.hco3) return null; return { val: (v.na - (v.cl + v.hco3)).toFixed(1), unit: 'mEq/L', note: 'normal ≈ 8–12' }; } },
  { id: 'cca', title: 'Corrected Calcium', fields: [{ id: 'ca', label: 'Measured Ca (mg/dL)' }, { id: 'alb', label: 'Albumin (g/dL)' }], compute: (v) => { if (!v.ca || v.alb === undefined) return null; return { val: (v.ca + 0.8 * (4 - v.alb)).toFixed(2), unit: 'mg/dL' }; } },
  { id: 'map', title: 'Mean Arterial Pressure', fields: [{ id: 'sbp', label: 'Systolic (mmHg)' }, { id: 'dbp', label: 'Diastolic (mmHg)' }], compute: (v) => { if (!v.sbp || !v.dbp) return null; return { val: (v.dbp + (v.sbp - v.dbp) / 3).toFixed(1), unit: 'mmHg' }; } },
  { id: 'fluids', title: 'Maintenance Fluids (Holliday–Segar)', fields: [{ id: 'w', label: 'Weight (kg)' }], compute: (v) => { if (!v.w) return null; let daily; if (v.w <= 10) daily = v.w * 100; else if (v.w <= 20) daily = 1000 + (v.w - 10) * 50; else daily = 1500 + (v.w - 20) * 20; return { val: Math.round(daily), unit: 'mL/day', note: `≈ ${Math.round(daily / 24)} mL/hr` }; } },
  { id: 'curb', title: 'CURB-65 style points (manual)', fields: [{ id: 'c', label: 'Confusion? (1/0)' }, { id: 'u', label: 'Urea >7mmol/L? (1/0)' }, { id: 'r', label: 'RR ≥30? (1/0)' }, { id: 'b', label: 'BP low? (1/0)' }, { id: 'a', label: 'Age ≥65? (1/0)' }], compute: (v) => { const parts = [v.c, v.u, v.r, v.b, v.a]; if (parts.every((p) => p === undefined)) return null; const total = parts.reduce((a, p) => a + (p ? 1 : 0), 0); return { val: total, unit: '/5', note: total <= 1 ? 'Low risk' : total <= 2 ? 'Moderate risk' : 'High risk' }; } }
];
function renderCalculators() {
  const grid = document.getElementById('calcGrid');
  grid.innerHTML = CALCULATORS.map((c) => `
    <div class="card calc-card" data-calc="${c.id}">
      <div class="section-title" style="margin-bottom:12px">${c.title}</div>
      <div class="grid" style="gap:10px">${c.fields.map((f) => `<div class="field"><label>${f.label}</label>${f.type === 'select' ? `<select class="select" data-fld="${f.id}">${f.options.map((o) => `<option>${o}</option>`).join('')}</select>` : `<input class="input" type="number" step="any" data-fld="${f.id}" placeholder="0">`}</div>`).join('')}</div>
      <div class="result" data-result><div class="k">Result</div><div class="v">—</div></div>
    </div>`).join('');
  CALCULATORS.forEach((c) => {
    const card = grid.querySelector(`[data-calc="${c.id}"]`);
    const inputs = card.querySelectorAll('[data-fld]');
    const resultBox = card.querySelector('[data-result] .v'), noteEl = card.querySelector('[data-result] .k');
    function recompute() {
      const v = {};
      c.fields.forEach((f) => { const el = card.querySelector(`[data-fld="${f.id}"]`); v[f.id] = f.type === 'select' ? el.value : (el.value === '' ? undefined : +el.value); });
      const r = c.compute(v);
      if (!r) { resultBox.textContent = '—'; noteEl.textContent = 'Result'; return; }
      resultBox.textContent = `${r.val} ${r.unit || ''}`; noteEl.textContent = r.note || 'Result';
    }
    inputs.forEach((el) => el.addEventListener('input', recompute));
    recompute();
  });
}

/* ================= DIAGRAMS ================= */
function sanitizeSVG(raw) {
  try {
    const doc = new DOMParser().parseFromString(String(raw || ''), 'image/svg+xml');
    if (doc.querySelector('parsererror')) return null;
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') return null;
    ['script', 'foreignObject', 'iframe', 'embed', 'object'].forEach((tag) => doc.querySelectorAll(tag).forEach((el) => el.remove()));
    doc.querySelectorAll('*').forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const val = attr.value || '';
        if (name.startsWith('on')) el.removeAttribute(attr.name);
        else if ((name === 'href' || name === 'xlink:href') && !val.trim().startsWith('#')) el.removeAttribute(attr.name);
        else if (/javascript:/i.test(val)) el.removeAttribute(attr.name);
      });
    });
    if (!svg.getAttribute('role')) svg.setAttribute('role', 'img');
    return new XMLSerializer().serializeToString(svg);
  } catch (e) { return null; }
}
document.getElementById('dgAddToggle').addEventListener('click', () => {
  const f = document.getElementById('dgAddForm');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
  document.getElementById('dgSubject').innerHTML = subjectOptionsHTML();
});
document.getElementById('dgCancel').addEventListener('click', () => (document.getElementById('dgAddForm').style.display = 'none'));
document.getElementById('dgSvg').addEventListener('input', () => {
  const clean = sanitizeSVG(document.getElementById('dgSvg').value);
  document.getElementById('dgPreview').innerHTML = clean || '';
});
document.getElementById('dgSave').addEventListener('click', () => {
  const subjectId = document.getElementById('dgSubject').value;
  const title = document.getElementById('dgTitle').value.trim();
  const caption = document.getElementById('dgCaption').value.trim();
  const svg = document.getElementById('dgSvg').value.trim();
  if (!title) return toast('Give the diagram a title');
  if (!sanitizeSVG(svg)) return toast('That doesn\'t look like valid, safe SVG markup');
  STATE.socket.emit('diagram:add', { subjectId, title, caption, svg });
  document.getElementById('dgTitle').value = ''; document.getElementById('dgCaption').value = ''; document.getElementById('dgSvg').value = ''; document.getElementById('dgPreview').innerHTML = '';
  document.getElementById('dgAddForm').style.display = 'none';
});
function renderDiagrams() {
  const grid = document.getElementById('dgGrid');
  if (!STATE.diagrams.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">📐</div>No diagrams yet — add the first one above.</div>`; return; }
  grid.innerHTML = STATE.diagrams.map((d) => {
    const s = subjectById(d.subjectId);
    const clean = sanitizeSVG(d.svg);
    const canDel = d.authorId === STATE.me.id || STATE.me.role === 'admin';
    return `<div class="card dg-card">
      <div class="dg-head">${s ? `<span class="badge"><span class="dot" style="background:${s.color}"></span>${escapeHTML(s.name)}</span>` : ''}<div style="font-weight:700;margin-top:6px">${escapeHTML(d.title)}</div></div>
      <figure class="diagram-figure">${clean || '<div class="empty">Could not render this diagram</div>'}</figure>
      ${d.caption ? `<figcaption>${escapeHTML(d.caption)}</figcaption>` : ''}
      <div class="dg-meta"><span>by ${escapeHTML(d.authorName)}</span>${canDel ? `<button class="btn icon ghost danger" data-dg-del="${d.id}" style="margin-left:auto">${ICONS.trash}</button>` : ''}</div>
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-dg-del]').forEach((b) => b.addEventListener('click', () => STATE.socket.emit('diagram:delete', { id: b.dataset.dgDel })));
}

/* ================= MNEMONICS ================= */
document.getElementById('mnemoAddToggle').addEventListener('click', () => { const f = document.getElementById('mnemoForm'); f.style.display = f.style.display === 'none' ? 'block' : 'none'; });
document.getElementById('mnemoCancel').addEventListener('click', () => (document.getElementById('mnemoForm').style.display = 'none'));
document.getElementById('mnemoSave').addEventListener('click', () => {
  const subjectId = document.getElementById('mnemoSubject').value;
  const term = document.getElementById('mnemoTerm').value.trim();
  const prompt = document.getElementById('mnemoPrompt').value.trim();
  const answer = document.getElementById('mnemoAnswer').value.trim();
  if (!term || !prompt) return toast('Add a term and a mnemonic');
  STATE.socket.emit('mnemonic:add', { subjectId, term, prompt, answer });
  ['mnemoTerm', 'mnemoPrompt', 'mnemoAnswer'].forEach((id) => (document.getElementById(id).value = ''));
  document.getElementById('mnemoForm').style.display = 'none';
});
let openMnemoId = null;
function renderMnemonics() {
  const grid = document.getElementById('mnemoGrid');
  if (!STATE.mnemonics.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">💡</div>No mnemonics yet — add the first one above.</div>`; return; }
  grid.innerHTML = STATE.mnemonics.map((m) => {
    const s = subjectById(m.subjectId);
    const canDel = m.authorId === STATE.me.id || STATE.me.role === 'admin';
    return `<div class="card mnemo-card ${openMnemoId === m.id ? 'open' : ''}" data-mnemo="${m.id}">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div>${s ? `<span class="badge" style="margin-bottom:6px"><span class="dot" style="background:${s.color}"></span>${escapeHTML(s.name)}</span>` : ''}<div class="term">${escapeHTML(m.term)}</div></div>
        ${canDel ? `<button class="btn icon ghost danger" data-mnemo-del="${m.id}">${ICONS.trash}</button>` : ''}
      </div>
      <div class="muted" style="margin-top:8px;font-style:italic">"${escapeHTML(m.prompt)}"</div>
      <div class="body">${escapeHTML(m.answer)}</div>
      <div class="muted" style="font-size:.68rem;margin-top:8px">by ${escapeHTML(m.authorName)}</div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.mnemo-card').forEach((c) => c.addEventListener('click', (e) => { if (e.target.closest('[data-mnemo-del]')) return; const id = c.dataset.mnemo; openMnemoId = openMnemoId === id ? null : id; renderMnemonics(); }));
  grid.querySelectorAll('[data-mnemo-del]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); STATE.socket.emit('mnemonic:delete', { id: b.dataset.mnemoDel }); }));
}

/* ================= RESOURCES ================= */
document.getElementById('resAddToggle').addEventListener('click', () => { const f = document.getElementById('resForm'); f.style.display = f.style.display === 'none' ? 'block' : 'none'; });
document.getElementById('resCancel').addEventListener('click', () => (document.getElementById('resForm').style.display = 'none'));
document.getElementById('resSave').addEventListener('click', () => {
  const title = document.getElementById('resTitle').value.trim();
  const url = document.getElementById('resUrl').value.trim();
  const category = document.getElementById('resCategory').value;
  if (!title || !url) return toast('Add a title and a URL');
  STATE.socket.emit('resource:add', { title, url, category });
  document.getElementById('resTitle').value = ''; document.getElementById('resUrl').value = '';
  document.getElementById('resForm').style.display = 'none';
});
function renderResources() {
  const wrap = document.getElementById('resList');
  if (!STATE.resources.length) { wrap.innerHTML = `<div class="empty"><div class="big">🔗</div>No resources saved yet — add the links you rely on.</div>`; return; }
  const cats = ['Question Bank', 'Video', 'Textbook', 'App', 'Other'];
  wrap.innerHTML = cats.map((cat) => {
    const items = STATE.resources.filter((r) => r.category === cat);
    if (!items.length) return '';
    return `<div class="card" style="margin-bottom:14px"><div class="section-title">${cat}</div>${items.map((r) => {
      const canDel = r.authorId === STATE.me.id || STATE.me.role === 'admin';
      return `<div class="list-item"><span style="flex:1">${escapeHTML(r.title)} <span class="muted" style="font-size:.7rem">· ${escapeHTML(r.authorName)}</span></span><a class="btn sm ghost" href="${escapeHTML(r.url)}" target="_blank" rel="noopener">Open ${ICONS.ext}</a>${canDel ? `<button class="btn icon ghost danger" data-res-del="${r.id}">${ICONS.trash}</button>` : ''}</div>`;
    }).join('')}</div>`;
  }).join('');
  wrap.querySelectorAll('[data-res-del]').forEach((b) => b.addEventListener('click', () => STATE.socket.emit('resource:delete', { id: b.dataset.resDel })));
}

/* ================= ADMIN ================= */
document.querySelectorAll('.admin-tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.admin-tab').forEach((x) => x.classList.toggle('active', x === t));
  document.querySelectorAll('.admin-view').forEach((v) => v.classList.toggle('active', v.id === 'admin-' + t.dataset.admintab));
}));
async function loadAdminAll() { loadAdminStats(); loadAdminUsers(); loadAdminInvites(); loadAdminMessages(); }
async function loadAdminStats() {
  const { stats } = await apiGet('/api/admin/stats');
  const cards = [['Members', stats.users], ['Online now', stats.onlineNow], ['Subjects', stats.subjects], ['Topics', stats.topics], ['Chat messages', stats.messages], ['Mnemonics', stats.mnemonics], ['Resources', stats.resources], ['Q-Bank entries', stats.qbankEntries]];
  document.getElementById('adminStats').innerHTML = cards.map(([l, v]) => `<div class="card stat-card"><div><div class="num">${v}</div><div class="lbl">${l}</div></div></div>`).join('');
}
async function loadAdminUsers() {
  const { users } = await apiGet('/api/admin/users');
  const tbl = document.getElementById('adminUsersTable');
  tbl.innerHTML = `<thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead><tbody>${users.map((u) => `
    <tr><td><span class="avatar" style="width:22px;height:22px;font-size:.6rem;background:${u.color};display:inline-grid;margin-right:6px;vertical-align:middle">${initials(u.username)}</span>${escapeHTML(u.username)}${u.id === STATE.me.id ? ' <span class="muted">(you)</span>' : ''}</td>
    <td><span class="badge ${u.role === 'admin' ? 'role-admin' : ''}">${u.role}</span></td>
    <td>${u.banned ? '<span class="badge" style="color:var(--danger)">banned</span>' : '<span class="badge" style="color:var(--good)">active</span>'}</td>
    <td class="muted">${new Date(u.createdAt).toLocaleDateString()}</td>
    <td>
      ${u.id !== STATE.me.id ? `
      <button class="btn sm ghost" data-role-toggle="${u.id}" data-role="${u.role === 'admin' ? 'member' : 'admin'}">${u.role === 'admin' ? 'Demote' : 'Promote'}</button>
      <button class="btn sm ghost" data-ban-toggle="${u.id}" data-ban="${!u.banned}">${u.banned ? 'Unban' : 'Ban'}</button>
      <button class="btn sm ghost danger" data-user-del="${u.id}">Delete</button>` : ''}
    </td></tr>`).join('')}</tbody>`;
  tbl.querySelectorAll('[data-role-toggle]').forEach((b) => b.addEventListener('click', async () => { try { await apiPost(`/api/admin/users/${b.dataset.roleToggle}/role`, { role: b.dataset.role }); loadAdminUsers(); } catch (e) { toast(e.message); } }));
  tbl.querySelectorAll('[data-ban-toggle]').forEach((b) => b.addEventListener('click', async () => { try { await apiPost(`/api/admin/users/${b.dataset.banToggle}/ban`, { banned: b.dataset.ban === 'true' }); loadAdminUsers(); } catch (e) { toast(e.message); } }));
  tbl.querySelectorAll('[data-user-del]').forEach((b) => b.addEventListener('click', async () => { if (!confirm('Delete this user permanently?')) return; try { await apiDel(`/api/admin/users/${b.dataset.userDel}`); loadAdminUsers(); } catch (e) { toast(e.message); } }));
}
async function loadAdminInvites() {
  const { invites } = await apiGet('/api/admin/invites');
  const tbl = document.getElementById('adminInvitesTable');
  tbl.innerHTML = `<thead><tr><th>Code</th><th>Note</th><th>Status</th><th></th></tr></thead><tbody>${invites.map((i) => `
    <tr><td class="invite-code">${i.code}</td><td>${escapeHTML(i.note || '—')}</td>
    <td>${i.usedBy ? '<span class="badge">used</span>' : i.revoked ? '<span class="badge" style="color:var(--danger)">revoked</span>' : '<span class="badge" style="color:var(--good)">available</span>'}</td>
    <td>${!i.usedBy && !i.revoked ? `<button class="btn sm ghost danger" data-invite-revoke="${i.code}">Revoke</button>` : ''}</td></tr>`).join('') || ''}</tbody>`;
  tbl.querySelectorAll('[data-invite-revoke]').forEach((b) => b.addEventListener('click', async () => { await apiDel('/api/admin/invites/' + b.dataset.inviteRevoke); loadAdminInvites(); }));
}
document.getElementById('inviteCreate').addEventListener('click', async () => {
  const note = document.getElementById('inviteNote').value.trim();
  await apiPost('/api/admin/invites', { note });
  document.getElementById('inviteNote').value = '';
  loadAdminInvites();
  toast('Invite code generated');
});
async function loadAdminMessages() {
  const { messages } = await apiGet('/api/admin/messages');
  const tbl = document.getElementById('adminMessagesTable');
  tbl.innerHTML = `<thead><tr><th>When</th><th>Room</th><th>User</th><th>Message</th><th></th></tr></thead><tbody>${messages.map((m) => `
    <tr><td class="muted mono" style="font-size:.75rem">${timeAgo(m.ts)}</td><td>${escapeHTML(m.room)}</td><td>${escapeHTML(m.username)}</td><td>${escapeHTML(m.text)}</td>
    <td><button class="btn icon ghost danger" data-admin-msg-del="${m.id}">${ICONS.trash}</button></td></tr>`).join('') || ''}</tbody>`;
  tbl.querySelectorAll('[data-admin-msg-del]').forEach((b) => b.addEventListener('click', async () => { await apiDel('/api/admin/messages/' + b.dataset.adminMsgDel); loadAdminMessages(); }));
}

/* ================= PRACTICE QUESTIONS ================= */
document.getElementById('qAddToggle').addEventListener('click', () => {
  const f = document.getElementById('qAddForm');
  const opening = f.style.display === 'none';
  f.style.display = opening ? 'block' : 'none';
  if (opening && !document.getElementById('qChoices').children.length) { addQChoiceRow(); addQChoiceRow(); }
});
document.getElementById('qCancel').addEventListener('click', () => (document.getElementById('qAddForm').style.display = 'none'));
document.getElementById('qAddChoice').addEventListener('click', () => addQChoiceRow());
function addQChoiceRow() {
  const wrap = document.getElementById('qChoices');
  if (wrap.children.length >= 6) return toast('Max 6 choices');
  const idx = wrap.children.length;
  const row = document.createElement('div');
  row.className = 'row tight';
  row.innerHTML = `<input type="radio" name="qCorrect" value="${idx}" ${idx === 0 ? 'checked' : ''} style="width:18px;height:18px;flex:none">
    <input class="input" placeholder="Choice ${String.fromCharCode(65 + idx)}" style="flex:1" data-qchoice>
    <button class="btn icon ghost danger" data-qchoice-del type="button">${ICONS.trash}</button>`;
  row.querySelector('[data-qchoice-del]').addEventListener('click', () => { if (wrap.children.length > 2) row.remove(); else toast('At least 2 choices needed'); });
  wrap.appendChild(row);
}
document.getElementById('qSave').addEventListener('click', () => {
  const subjectId = document.getElementById('qSubject').value;
  const stem = document.getElementById('qStem').value.trim();
  const explanation = document.getElementById('qExplanation').value.trim();
  const tags = document.getElementById('qTags').value.split(',').map((t) => t.trim()).filter(Boolean);
  const rows = Array.from(document.getElementById('qChoices').children);
  const choices = rows.map((r) => r.querySelector('[data-qchoice]').value.trim());
  const correctRadio = document.querySelector('input[name="qCorrect"]:checked');
  const correctIndex = correctRadio ? +correctRadio.value : 0;
  if (!stem) return toast('Add a question stem');
  if (choices.filter(Boolean).length < 2) return toast('Add at least 2 answer choices');
  if (!choices[correctIndex]) return toast('Fill in the choice you marked correct');
  STATE.socket.emit('question:add', { subjectId, stem, choices, correctIndex, explanation, tags });
  document.getElementById('qStem').value = ''; document.getElementById('qExplanation').value = ''; document.getElementById('qTags').value = '';
  document.getElementById('qChoices').innerHTML = ''; addQChoiceRow(); addQChoiceRow();
  document.getElementById('qAddForm').style.display = 'none';
  toast('Question added');
});

function renderQuestionList() {
  document.getElementById('qTotalCount').textContent = STATE.questions.length;
  document.getElementById('cnt-questions').textContent = STATE.questions.length;
  const wrap = document.getElementById('qList');
  if (!STATE.questions.length) { wrap.innerHTML = `<div class="empty">No questions yet — write the first one above.</div>`; return; }
  wrap.innerHTML = STATE.questions.slice().reverse().map((q) => {
    const s = subjectById(q.subjectId);
    const canDel = q.authorId === STATE.me.id || STATE.me.role === 'admin';
    return `<div class="q-row"><span class="dot" style="background:${s ? s.color : 'var(--muted)'}"></span><span class="stem">${escapeHTML(q.stem)}</span>${(q.tags || []).slice(0, 2).map((t) => `<span class="badge">${escapeHTML(t)}</span>`).join('')}<span class="muted" style="font-size:.7rem">${escapeHTML(q.authorName)}</span>${canDel ? `<button class="btn icon ghost danger" data-q-del="${q.id}">${ICONS.trash}</button>` : ''}</div>`;
  }).join('');
  wrap.querySelectorAll('[data-q-del]').forEach((b) => b.addEventListener('click', () => STATE.socket.emit('question:delete', { id: b.dataset.qDel })));
}

document.getElementById('qFilterSubject').addEventListener('change', updateQPoolCount);
document.getElementById('qFilterMode').addEventListener('change', updateQPoolCount);
function getQPool() {
  const subjectId = document.getElementById('qFilterSubject').value;
  const mode = document.getElementById('qFilterMode').value;
  const answers = STATE.personal.qAnswers || [];
  const lastResultByQ = {};
  answers.forEach((a) => { if (!(a.questionId in lastResultByQ)) lastResultByQ[a.questionId] = a.correct; });
  return STATE.questions.filter((q) => {
    if (subjectId && q.subjectId !== subjectId) return false;
    if (mode === 'unanswered') return !(q.id in lastResultByQ);
    if (mode === 'incorrect') return lastResultByQ[q.id] === false;
    if (mode === 'flagged') return (STATE.personal.flags || []).includes(q.id);
    return true;
  });
}
function updateQPoolCount() {
  const n = getQPool().length;
  document.getElementById('qPoolCount').textContent = n ? `${n} question${n === 1 ? '' : 's'} in this pool.` : 'No questions match this filter yet.';
}

let qTimerInterval = null;
document.getElementById('qStartSession').addEventListener('click', () => {
  const pool = getQPool();
  if (!pool.length) return toast('No questions in this pool');
  const queue = pool.slice().sort(() => Math.random() - 0.5);
  const timed = document.getElementById('qTimedMode').checked;
  STATE.qSessionState = { queue, idx: 0, correct: 0, answered: 0, timed, startedAt: Date.now() };
  document.getElementById('qSessionSetup').style.display = 'none';
  document.getElementById('qSession').style.display = 'block';
  const timerEl = document.getElementById('qTimer');
  if (timed) {
    timerEl.hidden = false;
    clearInterval(qTimerInterval);
    qTimerInterval = setInterval(() => {
      const secs = Math.floor((Date.now() - STATE.qSessionState.startedAt) / 1000);
      timerEl.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    }, 1000);
  } else timerEl.hidden = true;
  renderCurrentQuestion();
});
document.getElementById('qEndSession').addEventListener('click', endQSession);
function endQSession() {
  clearInterval(qTimerInterval);
  STATE.qSessionState = null;
  document.getElementById('qSession').style.display = 'none';
  document.getElementById('qSessionSetup').style.display = 'block';
  updateQPoolCount();
}
function renderCurrentQuestion() {
  const s = STATE.qSessionState;
  const q = s.queue[s.idx];
  document.getElementById('qProgress').textContent = `Q${s.idx + 1} / ${s.queue.length}`;
  document.getElementById('qScore').textContent = `${s.correct}/${s.answered}`;
  document.getElementById('qStemDisplay').textContent = q.stem;
  document.getElementById('qExplanationDisplay').style.display = 'none';
  document.getElementById('qNext').style.display = 'none';
  document.getElementById('qChoicesDisplay').innerHTML = q.choices.map((c, i) => `<button class="choice-btn" data-choice="${c.id}"><span class="letter">${String.fromCharCode(65 + i)}</span><span>${escapeHTML(c.text)}</span></button>`).join('');
  document.querySelectorAll('#qChoicesDisplay [data-choice]').forEach((btn) => btn.addEventListener('click', () => answerCurrentQuestion(q, btn.dataset.choice)));
  renderMathIn(document.getElementById('qStemDisplay'));
  renderMathIn(document.getElementById('qChoicesDisplay'));
  const flagBtn = document.getElementById('qFlagBtn');
  const flagged = (STATE.personal.flags || []).includes(q.id);
  flagBtn.textContent = flagged ? '🏴 Flagged' : '🏳 Flag';
  flagBtn.classList.toggle('primary', flagged);
  flagBtn.onclick = async () => {
    try {
      const { flagged: nowFlagged } = await apiPost(`/api/questions/${q.id}/flag`, {});
      STATE.personal.flags = STATE.personal.flags || [];
      if (nowFlagged) STATE.personal.flags.push(q.id); else STATE.personal.flags = STATE.personal.flags.filter((id) => id !== q.id);
      flagBtn.textContent = nowFlagged ? '🏴 Flagged' : '🏳 Flag';
      flagBtn.classList.toggle('primary', nowFlagged);
    } catch (e) { toast(e.message); }
  };
}
async function answerCurrentQuestion(q, choiceId) {
  const s = STATE.qSessionState;
  document.querySelectorAll('#qChoicesDisplay [data-choice]').forEach((b) => (b.disabled = true));
  let result;
  try { result = await apiPost(`/api/questions/${q.id}/answer`, { choiceId }); } catch (e) { return toast(e.message); }
  s.answered++;
  if (result.correct) s.correct++;
  STATE.personal.qAnswers.unshift({ id: 'local', questionId: q.id, subjectId: q.subjectId, choiceId, correct: result.correct, ts: Date.now() });
  document.getElementById('qScore').textContent = `${s.correct}/${s.answered}`;
  document.querySelectorAll('#qChoicesDisplay [data-choice]').forEach((b) => {
    if (b.dataset.choice === result.correctChoiceId) b.classList.add('correct');
    else if (b.dataset.choice === choiceId) b.classList.add('incorrect');
  });
  const expBox = document.getElementById('qExplanationDisplay');
  expBox.style.display = 'block';
  expBox.innerHTML = `<strong style="color:${result.correct ? 'var(--good)' : 'var(--danger)'}">${result.correct ? 'Correct!' : 'Not quite.'}</strong><div style="margin-top:6px;font-size:.85rem;line-height:1.6">${escapeHTML(result.explanation || 'No explanation was written for this question.')}</div>`;
  renderMathIn(expBox);
  const nextBtn = document.getElementById('qNext');
  nextBtn.style.display = 'inline-flex';
  nextBtn.textContent = s.idx + 1 < s.queue.length ? 'Next question →' : 'Finish session';
  nextBtn.onclick = () => {
    s.idx++;
    if (s.idx >= s.queue.length) {
      toast(`Session complete — ${s.correct}/${s.answered} correct`);
      if (s.answered > 0 && s.correct === s.answered) celebrate();
      endQSession();
      if (STATE.currentView === 'dashboard') renderDashboard();
    }
    else renderCurrentQuestion();
  };
}

document.getElementById('qImportToggle').addEventListener('click', () => {
  const f = document.getElementById('qImportForm');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
  document.getElementById('qImportSubject').innerHTML = subjectOptionsHTML();
});
document.getElementById('qImportCancel').addEventListener('click', () => (document.getElementById('qImportForm').style.display = 'none'));
wireFileToTextarea('qImportFile', 'qImportText');
document.getElementById('qImportRun').addEventListener('click', () => {
  const subjectId = document.getElementById('qImportSubject').value;
  const raw = parseCSV(document.getElementById('qImportText').value);
  if (!raw.length) return toast('Paste or upload some CSV first');
  let rows = raw;
  if ((rows[0][0] || '').trim().toLowerCase() === 'stem') rows = rows.slice(1);
  const items = [];
  rows.forEach((r) => {
    const stem = (r[0] || '').trim();
    const choices = r.slice(1, 7).map((c) => (c || '').trim()).filter(Boolean);
    const correctLetter = (r[7] || '').trim().toUpperCase();
    const correctIndex = correctLetter.charCodeAt(0) - 65;
    const explanation = (r[8] || '').trim();
    const tags = (r[9] || '').split(';').map((t) => t.trim()).filter(Boolean);
    if (stem && choices.length >= 2 && correctIndex >= 0 && correctIndex < choices.length) items.push({ stem, choices, correctIndex, explanation, tags });
  });
  if (!items.length) return toast('No valid rows found — check the column order');
  STATE.socket.emit('question:bulkAdd', { subjectId, items });
  document.getElementById('qImportForm').style.display = 'none';
  document.getElementById('qImportText').value = '';
});
document.getElementById('qExportBtn').addEventListener('click', async () => {
  if (!STATE.questions.length) return toast('No questions to export yet');
  const { questions } = await apiGet('/api/questions/export');
  const rows = [['stem', 'choice_a', 'choice_b', 'choice_c', 'choice_d', 'choice_e', 'choice_f', 'correct', 'explanation', 'tags']];
  questions.forEach((q) => {
    const choices = q.choices.map((c) => c.text);
    while (choices.length < 6) choices.push('');
    const correctIdx = q.choices.findIndex((c) => c.id === q.correctChoiceId);
    rows.push([q.stem, ...choices, String.fromCharCode(65 + Math.max(0, correctIdx)), q.explanation || '', (q.tags || []).join(';')]);
  });
  downloadCSV('study-hub-questions.csv', rows);
});

/* ================= FLASHCARDS ================= */
document.getElementById('fcAddToggle').addEventListener('click', () => { const f = document.getElementById('fcAddForm'); f.style.display = f.style.display === 'none' ? 'block' : 'none'; });
document.getElementById('fcCancel').addEventListener('click', () => (document.getElementById('fcAddForm').style.display = 'none'));
document.getElementById('fcClozeToggle').addEventListener('change', (e) => {
  document.getElementById('fcNormalFields').style.display = e.target.checked ? 'none' : 'block';
  document.getElementById('fcClozeField').style.display = e.target.checked ? 'block' : 'none';
});
function parseClozeText(raw) {
  const re = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/gs;
  const numbers = new Set();
  let m;
  while ((m = re.exec(raw))) numbers.add(m[1]);
  return Array.from(numbers).sort((a, b) => a - b).map((num) => ({
    front: raw.replace(/\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/gs, (full, n, answer, hint) => (n === num ? `[${hint || '…'}]` : answer)),
    back: raw.replace(/\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/gs, (full, n, answer) => (n === num ? `**${answer}**` : answer))
  }));
}
document.getElementById('fcSave').addEventListener('click', () => {
  const subjectId = document.getElementById('fcSubject').value;
  if (document.getElementById('fcClozeToggle').checked) {
    const raw = document.getElementById('fcClozeText').value.trim();
    if (!raw) return toast('Add some text with {{c1::…}} cloze markers');
    const cards = parseClozeText(raw);
    if (!cards.length) return toast('No {{c1::…}} cloze deletions found — check the syntax');
    cards.forEach((c) => STATE.socket.emit('flashcard:add', { subjectId, front: c.front, back: c.back }));
    toast(`${cards.length} cloze card${cards.length === 1 ? '' : 's'} added`);
    document.getElementById('fcClozeText').value = '';
    document.getElementById('fcAddForm').style.display = 'none';
    return;
  }
  const front = document.getElementById('fcFront').value.trim();
  const back = document.getElementById('fcBack').value.trim();
  if (!front || !back) return toast('Fill in both sides of the card');
  STATE.socket.emit('flashcard:add', { subjectId, front, back });
  document.getElementById('fcFront').value = ''; document.getElementById('fcBack').value = '';
  document.getElementById('fcAddForm').style.display = 'none';
});
document.getElementById('fcImportToggle').addEventListener('click', () => {
  const f = document.getElementById('fcImportForm');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
  document.getElementById('fcImportSubject').innerHTML = subjectOptionsHTML();
});
document.getElementById('fcImportCancel').addEventListener('click', () => (document.getElementById('fcImportForm').style.display = 'none'));
wireFileToTextarea('fcImportFile', 'fcImportText');
document.getElementById('fcImportRun').addEventListener('click', () => {
  const subjectId = document.getElementById('fcImportSubject').value;
  const raw = parseCSV(document.getElementById('fcImportText').value);
  if (!raw.length) return toast('Paste or upload some CSV first');
  let rows = raw;
  if ((rows[0][0] || '').trim().toLowerCase() === 'front') rows = rows.slice(1);
  const cards = rows.map((r) => ({ front: (r[0] || '').trim(), back: (r[1] || '').trim() })).filter((c) => c.front && c.back);
  if (!cards.length) return toast('No valid rows found — expected two columns: front, back');
  STATE.socket.emit('flashcard:bulkAdd', { subjectId, cards });
  document.getElementById('fcImportForm').style.display = 'none';
  document.getElementById('fcImportText').value = '';
});
document.getElementById('fcExportBtn').addEventListener('click', () => {
  if (!STATE.flashcards.length) return toast('No flashcards to export yet');
  const rows = [['front', 'back']].concat(STATE.flashcards.map((c) => [c.front, c.back]));
  downloadCSV('study-hub-flashcards.csv', rows);
});

function renderFlashcardList() {
  document.getElementById('fcTotalCount').textContent = STATE.flashcards.length;
  const wrap = document.getElementById('fcList');
  if (!STATE.flashcards.length) { wrap.innerHTML = `<div class="empty">No cards yet — add the first one above.</div>`; return; }
  wrap.innerHTML = STATE.flashcards.slice().reverse().map((c) => {
    const s = subjectById(c.subjectId);
    const canDel = c.authorId === STATE.me.id || STATE.me.role === 'admin';
    return `<div class="fc-row"><span class="dot" style="background:${s ? s.color : 'var(--muted)'}"></span><span class="front">${escapeHTML(c.front)}</span><span class="muted" style="font-size:.7rem">${escapeHTML(c.authorName)}</span>${canDel ? `<button class="btn icon ghost danger" data-fc-del="${c.id}">${ICONS.trash}</button>` : ''}</div>`;
  }).join('');
  wrap.querySelectorAll('[data-fc-del]').forEach((b) => b.addEventListener('click', () => STATE.socket.emit('flashcard:delete', { id: b.dataset.fcDel })));
}
async function loadSrsDue() {
  try {
    const res = await apiGet('/api/srs/due');
    STATE.srsDue = res;
    const badge = document.getElementById('cnt-due');
    if (res.dueCount > 0) { badge.hidden = false; badge.textContent = res.dueCount; } else badge.hidden = true;
    const summary = document.getElementById('fcDueSummary');
    if (summary) summary.textContent = res.totalCards === 0 ? 'No cards yet — add some below.' : `${res.dueCount} of ${res.totalCards} cards due right now.`;
  } catch (e) { /* not logged in yet */ }
}
document.getElementById('fcStartReview').addEventListener('click', () => {
  if (!STATE.srsDue.due.length) return toast('Nothing due right now — nice work');
  STATE.fcQueue = STATE.srsDue.due.slice();
  document.getElementById('fcReviewCard').style.display = 'block';
  renderCurrentFlashcard();
});
function renderCurrentFlashcard() {
  const queue = STATE.fcQueue;
  if (!queue.length) {
    document.getElementById('fcReviewMeta').textContent = 'All caught up! 🎉';
    document.getElementById('fcFrontDisplay').textContent = "You're done reviewing for now.";
    document.getElementById('fcBackDisplay').style.display = 'none';
    document.getElementById('fcFlipRow').style.display = 'none';
    document.getElementById('fcRateRow').style.display = 'none';
    loadSrsDue();
    return;
  }
  const card = queue[0];
  const s = subjectById(card.subjectId);
  document.getElementById('fcReviewMeta').textContent = `${queue.length} left${s ? ' · ' + s.name : ''} · ${card.srsState || 'New'}`;
  document.getElementById('fcFrontDisplay').innerHTML = renderMarkdownSafe(card.front);
  document.getElementById('fcBackDisplay').innerHTML = renderMarkdownSafe(card.back);
  document.getElementById('fcBackDisplay').style.display = 'none';
  document.getElementById('fcFlipRow').style.display = 'flex';
  document.getElementById('fcRateRow').style.display = 'none';
  renderMathIn(document.getElementById('fcFrontDisplay'));
  renderMathIn(document.getElementById('fcBackDisplay'));
}
document.getElementById('fcFlip').addEventListener('click', () => {
  document.getElementById('fcBackDisplay').style.display = 'flex';
  document.getElementById('fcFlipRow').style.display = 'none';
  document.getElementById('fcRateRow').style.display = 'flex';
});
document.querySelectorAll('#fcRateRow [data-rate]').forEach((b) => b.addEventListener('click', async () => {
  const card = STATE.fcQueue[0];
  try {
    const { srs, intervalDays } = await apiPost('/api/srs/review', { cardId: card.id, rating: b.dataset.rate });
    STATE.personal.srs[card.id] = srs;
    const days = intervalDays < 1 ? 'a few minutes' : intervalDays === 1 ? '1 day' : `${intervalDays} days`;
    toast(`See you again in ${days}`);
  } catch (e) { toast(e.message); }
  STATE.fcQueue.shift();
  if (STATE.fcQueue.length === 0) celebrate();
  renderCurrentFlashcard();
}));

/* ================= LAB VALUES ================= */
const LAB_VALUES = [
  { cat: 'Electrolytes', test: 'Sodium (Na+)', range: '136–145 mEq/L' },
  { cat: 'Electrolytes', test: 'Potassium (K+)', range: '3.5–5.0 mEq/L' },
  { cat: 'Electrolytes', test: 'Chloride (Cl-)', range: '98–106 mEq/L' },
  { cat: 'Electrolytes', test: 'Bicarbonate (HCO3-)', range: '22–28 mEq/L' },
  { cat: 'Electrolytes', test: 'Calcium, total', range: '8.4–10.2 mg/dL' },
  { cat: 'Electrolytes', test: 'Magnesium', range: '1.5–2.0 mEq/L' },
  { cat: 'Electrolytes', test: 'Phosphate', range: '3.0–4.5 mg/dL' },
  { cat: 'Renal / Metabolic', test: 'BUN', range: '7–20 mg/dL' },
  { cat: 'Renal / Metabolic', test: 'Creatinine', range: '0.6–1.2 mg/dL' },
  { cat: 'Renal / Metabolic', test: 'Glucose, fasting', range: '70–110 mg/dL' },
  { cat: 'Renal / Metabolic', test: 'Osmolality, serum', range: '275–295 mOsm/kg' },
  { cat: 'Liver / Pancreas', test: 'AST', range: '8–20 U/L' },
  { cat: 'Liver / Pancreas', test: 'ALT', range: '8–20 U/L' },
  { cat: 'Liver / Pancreas', test: 'Alkaline phosphatase', range: '20–70 U/L' },
  { cat: 'Liver / Pancreas', test: 'Total bilirubin', range: '0.1–1.0 mg/dL' },
  { cat: 'Liver / Pancreas', test: 'Albumin', range: '3.5–5.5 g/dL' },
  { cat: 'Liver / Pancreas', test: 'Amylase', range: '25–125 U/L' },
  { cat: 'Liver / Pancreas', test: 'Lipase', range: '10–140 U/L' },
  { cat: 'CBC', test: 'Hemoglobin (men)', range: '13.5–17.5 g/dL' },
  { cat: 'CBC', test: 'Hemoglobin (women)', range: '12.0–16.0 g/dL' },
  { cat: 'CBC', test: 'Hematocrit (men)', range: '41–53%' },
  { cat: 'CBC', test: 'Hematocrit (women)', range: '36–46%' },
  { cat: 'CBC', test: 'Leukocyte count (WBC)', range: '4,500–11,000 /mm³' },
  { cat: 'CBC', test: 'Platelet count', range: '150,000–400,000 /mm³' },
  { cat: 'CBC', test: 'MCV', range: '80–100 fL' },
  { cat: 'CBC', test: 'Reticulocyte count', range: '0.5–1.5% of RBCs' },
  { cat: 'Coagulation', test: 'PT', range: '11–15 sec' },
  { cat: 'Coagulation', test: 'PTT', range: '25–40 sec' },
  { cat: 'Coagulation', test: 'INR', range: '0.8–1.2 (therapeutic 2–3)' },
  { cat: 'Coagulation', test: 'Bleeding time', range: '2–7 min' },
  { cat: 'ABG', test: 'pH, arterial', range: '7.35–7.45' },
  { cat: 'ABG', test: 'PaCO2', range: '33–45 mmHg' },
  { cat: 'ABG', test: 'PaO2', range: '75–105 mmHg' },
  { cat: 'ABG', test: 'HCO3-, arterial', range: '22–28 mEq/L' },
  { cat: 'Lipids', test: 'Total cholesterol', range: '<200 mg/dL (desirable)' },
  { cat: 'Lipids', test: 'LDL', range: '<100 mg/dL (optimal)' },
  { cat: 'Lipids', test: 'HDL', range: '>40 mg/dL (men), >50 (women)' },
  { cat: 'Lipids', test: 'Triglycerides', range: '<150 mg/dL' },
  { cat: 'Endocrine', test: 'TSH', range: '0.4–4.0 μU/mL' },
  { cat: 'Endocrine', test: 'Free T4', range: '0.8–1.8 ng/dL' },
  { cat: 'Endocrine', test: 'Cortisol, AM', range: '5–23 μg/dL' },
  { cat: 'Endocrine', test: 'HbA1c', range: '4–5.9% (normal)' },
  { cat: 'CSF', test: 'CSF pressure', range: '70–180 mm H2O' },
  { cat: 'CSF', test: 'CSF protein', range: '15–60 mg/dL' },
  { cat: 'CSF', test: 'CSF glucose', range: '40–70 mg/dL (⅔ serum)' },
  { cat: 'CSF', test: 'CSF cell count', range: '0–5 cells/mm³' },
  { cat: 'Urinalysis', test: 'Urine specific gravity', range: '1.003–1.030' },
  { cat: 'Urinalysis', test: 'Urine pH', range: '4.6–8.0' },
  { cat: 'Urinalysis', test: 'Urine protein', range: '<150 mg/day' }
];
function renderLabValues() {
  const q = (document.getElementById('labSearch').value || '').toLowerCase().trim();
  const filtered = LAB_VALUES.filter((r) => !q || r.test.toLowerCase().includes(q) || r.cat.toLowerCase().includes(q));
  const cats = [...new Set(filtered.map((r) => r.cat))];
  const wrap = document.getElementById('labValuesList');
  if (!cats.length) { wrap.innerHTML = `<div class="empty">No matching lab values.</div>`; return; }
  wrap.innerHTML = cats.map((cat) => `<div class="card lab-cat"><div class="section-title">${cat}</div>${filtered.filter((r) => r.cat === cat).map((r) => `<div class="lab-row"><span class="test">${escapeHTML(r.test)}</span><span class="range">${escapeHTML(r.range)}</span></div>`).join('')}</div>`).join('');
}
document.getElementById('labSearch').addEventListener('input', renderLabValues);

/* ================= GLOBAL SEARCH / COMMAND PALETTE ================= */
function buildSearchGroups(q) {
  if (!q) return [];
  const groups = [];

  const subjHits = STATE.subjects.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 4);
  if (subjHits.length) groups.push({ label: 'Subjects', items: subjHits.map((s) => ({ text: s.name, action: () => { setView('subjects'); } })) });

  const topicHits = [];
  STATE.subjects.forEach((s) => s.topics.forEach((t) => { if (t.name.toLowerCase().includes(q)) topicHits.push({ text: `${t.name} — ${s.name}`, action: () => { openSubjectId = s.id; setView('subjects'); renderSubjects(); } }); }));
  if (topicHits.length) groups.push({ label: 'Topics', items: topicHits.slice(0, 4) });

  const noteHits = STATE.subjects.filter((s) => (s.notes || '').toLowerCase().includes(q)).slice(0, 3);
  if (noteHits.length) groups.push({ label: 'Notes', items: noteHits.map((s) => ({ text: `Notes — ${s.name}`, action: () => openNotes(s.id) })) });

  const mnemoHits = STATE.mnemonics.filter((m) => m.term.toLowerCase().includes(q) || m.prompt.toLowerCase().includes(q)).slice(0, 4);
  if (mnemoHits.length) groups.push({ label: 'Mnemonics', items: mnemoHits.map((m) => ({ text: m.term, action: () => setView('mnemonics') })) });

  const resHits = STATE.resources.filter((r) => r.title.toLowerCase().includes(q)).slice(0, 4);
  if (resHits.length) groups.push({ label: 'Resources', items: resHits.map((r) => ({ text: r.title, action: () => setView('resources') })) });

  const qHits = STATE.questions.filter((qq) => qq.stem.toLowerCase().includes(q)).slice(0, 4);
  if (qHits.length) groups.push({ label: 'Practice questions', items: qHits.map((qq) => ({ text: qq.stem.slice(0, 70), action: () => setView('practice') })) });

  const fcHits = STATE.flashcards.filter((c) => c.front.toLowerCase().includes(q)).slice(0, 4);
  if (fcHits.length) groups.push({ label: 'Flashcards', items: fcHits.map((c) => ({ text: c.front.slice(0, 70), action: () => setView('flashcards') })) });

  const labHits = LAB_VALUES.filter((l) => l.test.toLowerCase().includes(q)).slice(0, 4);
  if (labHits.length) groups.push({ label: 'Lab values', items: labHits.map((l) => ({ text: `${l.test} — ${l.range}`, action: () => { setView('labvalues'); document.getElementById('labSearch').value = l.test; renderLabValues(); } })) });

  const dgHits = STATE.diagrams.filter((d) => d.title.toLowerCase().includes(q)).slice(0, 4);
  if (dgHits.length) groups.push({ label: 'Diagrams', items: dgHits.map((d) => ({ text: d.title, action: () => setView('diagrams') })) });

  const navTargets = [
    ['dashboard', 'Dashboard'], ['chat', 'Chat'], ['subjects', 'Subjects'], ['planner', 'Planner'],
    ['practice', 'Practice Questions'], ['flashcards', 'Flashcards'], ['qbank', 'Q-Bank Tracker'],
    ['pomodoro', 'Focus Timer'], ['tasks', 'My Tasks'], ['calculators', 'Calculators'],
    ['labvalues', 'Lab Values'], ['mnemonics', 'Mnemonics'], ['resources', 'Resources']
  ];
  const navHits = navTargets.filter(([, label]) => label.toLowerCase().includes(q));
  if (navHits.length) groups.push({ label: 'Go to', items: navHits.map(([view, label]) => ({ text: label, action: () => setView(view) })) });

  return groups;
}

/* ---- sidebar trigger ---- */
const searchInput = document.getElementById('globalSearch');
searchInput.addEventListener('focus', (e) => { e.target.blur(); openCmdk(); });
searchInput.addEventListener('click', () => openCmdk());

/* ---- command palette modal ---- */
const cmdkOverlay = document.getElementById('cmdkOverlay');
const cmdkInput = document.getElementById('cmdkInput');
const cmdkResultsEl = document.getElementById('cmdkResults');
let cmdkFlat = [];
let cmdkSel = 0;

function openCmdk() {
  if (!STATE.me) return;
  cmdkOverlay.hidden = false;
  cmdkInput.value = '';
  renderCmdk('');
  requestAnimationFrame(() => cmdkInput.focus());
}
function closeCmdk() { cmdkOverlay.hidden = true; }
function renderCmdk(qRaw) {
  const q = qRaw.trim().toLowerCase();
  const groups = buildSearchGroups(q);
  cmdkFlat = [];
  groups.forEach((g) => g.items.forEach((it) => cmdkFlat.push(it)));
  cmdkSel = 0;
  if (!q) { cmdkResultsEl.innerHTML = `<div class="search-empty">Type to search subjects, notes, questions, flashcards, mnemonics, resources, lab values — or jump to any page.</div>`; return; }
  if (!groups.length) { cmdkResultsEl.innerHTML = `<div class="search-empty">No matches for "${escapeHTML(qRaw)}"</div>`; return; }
  let idx = 0;
  cmdkResultsEl.innerHTML = groups.map((g) => `<div class="search-group">${g.label}</div>` + g.items.map((it) => `<button class="cmdk-hit" data-idx="${idx++}">${escapeHTML(it.text)}</button>`).join('')).join('');
  cmdkResultsEl.querySelectorAll('.cmdk-hit').forEach((el) => {
    el.addEventListener('mouseenter', () => { cmdkSel = +el.dataset.idx; highlightCmdkSel(); });
    el.addEventListener('click', () => { cmdkFlat[+el.dataset.idx].action(); closeCmdk(); });
  });
  highlightCmdkSel();
}
function highlightCmdkSel() {
  cmdkResultsEl.querySelectorAll('.cmdk-hit').forEach((el) => el.classList.toggle('sel', +el.dataset.idx === cmdkSel));
  const sel = cmdkResultsEl.querySelector('.cmdk-hit.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}
cmdkInput.addEventListener('input', () => renderCmdk(cmdkInput.value));
cmdkOverlay.addEventListener('mousedown', (e) => { if (e.target === cmdkOverlay) closeCmdk(); });
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); cmdkOverlay.hidden ? openCmdk() : closeCmdk(); return; }
  if (cmdkOverlay.hidden) return;
  if (e.key === 'Escape') closeCmdk();
  else if (e.key === 'ArrowDown') { e.preventDefault(); if (cmdkFlat.length) { cmdkSel = (cmdkSel + 1) % cmdkFlat.length; highlightCmdkSel(); } }
  else if (e.key === 'ArrowUp') { e.preventDefault(); if (cmdkFlat.length) { cmdkSel = (cmdkSel - 1 + cmdkFlat.length) % cmdkFlat.length; highlightCmdkSel(); } }
  else if (e.key === 'Enter') { e.preventDefault(); const hit = cmdkFlat[cmdkSel]; if (hit) { hit.action(); closeCmdk(); } }
});

/* ================= RENDER ALL ================= */
function renderAll() {
  renderSubjects();
  document.getElementById('qbSubject').innerHTML = subjectOptionsHTML();
  document.getElementById('pomoSubject').innerHTML = subjectOptionsHTML();
  document.getElementById('mnemoSubject').innerHTML = subjectOptionsHTML();
  document.getElementById('qSubject').innerHTML = subjectOptionsHTML();
  document.getElementById('fcSubject').innerHTML = subjectOptionsHTML();
  document.getElementById('dgSubject').innerHTML = subjectOptionsHTML();
  populateQFilterSubjects();
  renderChatRooms();
  renderPlanner();
  renderTasks();
  renderCalculators();
  renderLabValues();
  renderDiagrams();
  renderMnemonics();
  renderResources();
  renderQuestionList();
  renderFlashcardList();
  updateQPoolCount();
  addQChoiceRow(); addQChoiceRow();
  document.getElementById('setFocus').value = STATE.personal.pomodoro.focus;
  document.getElementById('setShort').value = STATE.personal.pomodoro.short;
  document.getElementById('setLong').value = STATE.personal.pomodoro.long;
  pomo.remaining = pomoDurations().focus;
  updateTimerDisplay();
}

})();
