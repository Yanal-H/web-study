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
const THEMES = ['midnight', 'aurora', 'sunset', 'forest', 'neon', 'paper'];

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
function todayStr(d = new Date()) { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); }

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
  users: [],
  personal: { tasks: [], pomodoro: { focus: 25, short: 5, long: 15, sessions: [] }, planner: { blocks: [], cells: {}, exams: [] }, qbank: [] },
  qbank: [],
  activity: [],
  currentView: 'dashboard',
  currentSubjectId: null,
  activeChatRoom: null,
  joinedRoom: null,
  socket: null
};

/* ================= THEME ================= */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('studyhub_theme', theme);
  document.querySelectorAll('.theme-swatch').forEach((el) => el.classList.toggle('active', el.dataset.theme === theme));
}
function renderThemeSwatches() {
  const wrap = document.getElementById('themeSwatches');
  const grads = { midnight: 'linear-gradient(135deg,#8b9eff,#c4a7ff)', aurora: 'linear-gradient(135deg,#4fd6ff,#8b7bff)', sunset: 'linear-gradient(135deg,#ff7a59,#ff5c98)', forest: 'linear-gradient(135deg,#5ad19a,#9ad67e)', neon: 'linear-gradient(135deg,#00ffc8,#ff00c8)', paper: 'linear-gradient(135deg,#5b54d6,#cf5f9e)' };
  wrap.innerHTML = THEMES.map((t) => `<span class="theme-swatch" data-theme="${t}" title="${t}" style="background:${grads[t]}"></span>`).join('');
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
  renderAll();
  setView('dashboard');
  loadQBank();
}

(async function initial() {
  try {
    const { user } = await apiGet('/api/me');
    STATE.me = user;
    await bootApp();
  } catch (e) {
    authScreen.hidden = false;
    refreshBootstrapHint();
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
    if (msg.room === STATE.activeChatRoom) { renderChatMessage(msg); scrollChatBottom(); }
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

function switchRoom(room) {
  if (STATE.joinedRoom === room) return;
  if (STATE.joinedRoom) STATE.socket.emit('room:leave', { room: STATE.joinedRoom });
  STATE.joinedRoom = room;
  if (room) STATE.socket.emit('room:join', { room });
}

/* ================= NAV / ROUTING ================= */
const VIEWS = ['dashboard', 'chat', 'subjects', 'notes', 'planner', 'qbank', 'pomodoro', 'tasks', 'calculators', 'mnemonics', 'resources', 'admin'];
function setView(name) {
  if (!VIEWS.includes(name)) name = 'dashboard';
  STATE.currentView = name;
  VIEWS.forEach((v) => document.getElementById('view-' + v).classList.toggle('active', v === name));
  document.querySelectorAll('.navitem[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.getElementById('sidebar').classList.remove('open');
  window.scrollTo(0, 0);
  if (name !== 'chat' && name !== 'notes') switchRoom(null);
  if (name === 'dashboard') renderDashboard();
  if (name === 'chat') { renderChatRooms(); openChatRoom(STATE.activeChatRoom || 'global'); }
  if (name === 'admin') { loadAdminAll(); }
  if (name === 'qbank') loadQBank();
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

  const stats = [
    { label: 'Members online', value: document.getElementById('onlineCount').textContent, icon: ICONS.chat, color: 'var(--good)' },
    { label: 'Subjects', value: STATE.subjects.length, icon: ICONS.book, color: 'var(--brand)' },
    { label: 'My topics done', value: `${myDone}/${totalTopics}`, icon: ICONS.check, color: 'var(--brand-3)' },
    { label: 'My focus today', value: `${todayMin}m`, icon: ICONS.clock, color: 'var(--info)' }
  ];
  document.getElementById('dashStats').innerHTML = stats.map((s) => `
    <div class="card stat-card"><div class="ico" style="background:${s.color}22;color:${s.color}">${s.icon}</div><div><div class="num">${s.value}</div><div class="lbl">${s.label}</div></div></div>`).join('');

  renderActivityFeed('activityFeed');
  const nav = [['subjects', 'Subjects', ICONS.book], ['chat', 'Chat', ICONS.chat], ['qbank', 'Q-Bank', ICONS.target], ['pomodoro', 'Focus Timer', ICONS.clock]];
  document.getElementById('quickNav').innerHTML = nav.map(([v, l, i]) => `<button class="btn" data-jump="${v}" style="justify-content:flex-start">${i}${l}</button>`).join('');
  document.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.jump)));
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
  document.getElementById('chatRoomList').innerHTML = rooms.map((r) => `<button class="chat-room-btn ${STATE.activeChatRoom === r.id ? 'active' : ''}" data-room="${r.id}"><span class="dot" style="background:${r.color}"></span>${escapeHTML(r.name)}</button>`).join('');
  document.querySelectorAll('.chat-room-btn').forEach((b) => b.addEventListener('click', () => openChatRoom(b.dataset.room)));
}
function openChatRoom(room) {
  STATE.activeChatRoom = room;
  const rooms = [{ id: 'global', name: 'Study Hall' }].concat(STATE.subjects.map((s) => ({ id: 'subject:' + s.id, name: s.name })));
  document.getElementById('chatRoomTitle').textContent = (rooms.find((r) => r.id === room) || {}).name || room;
  document.querySelectorAll('.chat-room-btn').forEach((b) => b.classList.toggle('active', b.dataset.room === room));
  document.getElementById('chatMessages').innerHTML = '';
  switchRoom(room);
}
function renderChatMessage(msg) {
  const wrap = document.getElementById('chatMessages');
  const mine = msg.userId === STATE.me.id;
  const div = document.createElement('div');
  div.className = 'msg' + (mine ? ' mine' : '');
  div.dataset.msg = msg.id;
  div.innerHTML = `
    <span class="avatar" style="background:${msg.color}">${initials(msg.username)}</span>
    <div><div class="meta">${mine ? 'You' : escapeHTML(msg.username)} · ${timeAgo(msg.ts)}</div>
    <div class="bubble">${escapeHTML(msg.text)}${(STATE.me.role === 'admin') ? `<button class="msg-del btn icon ghost sm" data-del-msg="${msg.id}" title="Delete">${ICONS.trash}</button>` : ''}</div></div>`;
  wrap.appendChild(div);
  const delBtn = div.querySelector('[data-del-msg]');
  if (delBtn) delBtn.addEventListener('click', () => apiDel('/api/admin/messages/' + msg.id).catch(() => {}));
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
}
document.getElementById('chatSend').addEventListener('click', sendChat);
document.getElementById('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

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
  renderChatRooms();
  renderDashboard();
}
function subjectOptionsHTML(selectedId) {
  return STATE.subjects.map((s) => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${escapeHTML(s.name)}</option>`).join('');
}
function subjectById(id) { return STATE.subjects.find((s) => s.id === id); }

/* ================= NOTES (live collaborative) ================= */
let pendingNoteText = null;
let noteSaveTimer = null;
function openNotes(subjectId) {
  const s = subjectById(subjectId);
  if (!s) return;
  STATE.currentSubjectId = subjectId;
  document.getElementById('notesSubjectName').textContent = s.name;
  document.getElementById('notesTextarea').value = s.notes || '';
  updateNotesMeta(s);
  document.getElementById('notesUpdateBanner').classList.remove('show');
  setView('notes');
  switchRoom('subject:' + subjectId);
}
function updateNotesMeta(s) {
  document.getElementById('notesUpdatedMeta').textContent = s.notesUpdatedBy ? `Last edited by ${s.notesUpdatedBy} · ${timeAgo(s.notesUpdatedAt)}` : 'No edits yet';
}
document.getElementById('notesBack').addEventListener('click', () => { switchRoom(null); setView('subjects'); });
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

/* ================= RENDER ALL ================= */
function renderAll() {
  renderSubjects();
  document.getElementById('qbSubject').innerHTML = subjectOptionsHTML();
  document.getElementById('pomoSubject').innerHTML = subjectOptionsHTML();
  document.getElementById('mnemoSubject').innerHTML = subjectOptionsHTML();
  renderChatRooms();
  renderPlanner();
  renderTasks();
  renderCalculators();
  renderMnemonics();
  renderResources();
  document.getElementById('setFocus').value = STATE.personal.pomodoro.focus;
  document.getElementById('setShort').value = STATE.personal.pomodoro.short;
  document.getElementById('setLong').value = STATE.personal.pomodoro.long;
  pomo.remaining = pomoDurations().focus;
  updateTimerDisplay();
}

})();
