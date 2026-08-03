'use strict';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const http = require('http');
const { Server } = require('socket.io');

const store = require('./lib/store');
const { uid, COLORS, persist, findUserByUsername, findUserById, publicUser, ensurePersonal, ensureProgress, makeInviteCode, reviewCard, cardIsDue, cardStateName } = store;

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));

const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE, maxAge: 30 * 24 * 3600 * 1000 }
});
app.use(sessionMiddleware);

/* ================= helpers ================= */
function randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }

function requireAuth(req, res, next) {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'Not signed in' });
  const user = findUserById(userId);
  if (!user || user.banned) { req.session.destroy(() => {}); return res.status(401).json({ error: 'Session invalid' }); }
  req.user = user;
  next();
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
    next();
  });
}

function activeUserCount() {
  return store.db.users.filter((u) => !u.banned).length || 1;
}
function topicPayload(subject, topic, userId) {
  const progress = store.db.progress;
  let doneCount = 0;
  for (const u of store.db.users) {
    if (!u.banned && progress[u.id] && progress[u.id][topic.id]) doneCount++;
  }
  return {
    id: topic.id,
    name: topic.name,
    doneCount,
    totalUsers: activeUserCount(),
    mine: !!(userId && progress[userId] && progress[userId][topic.id])
  };
}
function safeQuestion(q) {
  return { id: q.id, subjectId: q.subjectId, stem: q.stem, choices: q.choices, tags: q.tags, authorId: q.authorId, authorName: q.authorName, createdAt: q.createdAt };
}
function subjectPayload(subject, userId) {
  return {
    id: subject.id,
    name: subject.name,
    color: subject.color,
    notes: subject.notes,
    notesUpdatedBy: subject.notesUpdatedBy,
    notesUpdatedAt: subject.notesUpdatedAt,
    topics: subject.topics.map((t) => topicPayload(subject, t, userId))
  };
}

/* ================= AUTH ================= */
app.get('/api/bootstrap', (req, res) => {
  res.json({ needsBootstrap: store.db.users.length === 0 });
});

app.post('/api/register', (req, res) => {
  const { username, password, inviteCode } = req.body || {};
  const uname = String(username || '').trim();
  if (uname.length < 3 || uname.length > 24 || !/^[a-zA-Z0-9 _.-]+$/.test(uname)) {
    return res.status(400).json({ error: 'Username must be 3-24 characters (letters, numbers, spaces, . _ -).' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (findUserByUsername(uname)) return res.status(409).json({ error: 'That username is taken.' });

  const isBootstrap = store.db.users.length === 0;
  let invite = null;
  if (!isBootstrap) {
    const code = String(inviteCode || '').trim().toUpperCase();
    invite = store.db.invites.find((i) => i.code === code);
    if (!invite) return res.status(403).json({ error: 'This study hub is invite-only. Enter a valid invite code.' });
    if (invite.usedBy) return res.status(403).json({ error: 'That invite code has already been used.' });
    if (invite.revoked) return res.status(403).json({ error: 'That invite code was revoked.' });
  }

  const user = {
    id: uid('u'),
    username: uname,
    passwordHash: bcrypt.hashSync(password, 10),
    role: isBootstrap ? 'admin' : 'member',
    color: randomColor(),
    banned: false,
    createdAt: Date.now()
  };
  store.db.users.push(user);
  ensurePersonal(user.id);
  ensureProgress(user.id);
  if (invite) { invite.usedBy = user.id; invite.usedAt = Date.now(); }
  persist();

  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = findUserByUsername(username || '');
  if (!user || !bcrypt.compareSync(String(password || ''), user.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  if (user.banned) return res.status(403).json({ error: 'This account has been suspended.' });
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

/* ================= STATE (bootstrap payload after login) ================= */
app.get('/api/state', requireAuth, (req, res) => {
  res.json({
    me: publicUser(req.user),
    subjects: store.db.subjects.map((s) => subjectPayload(s, req.user.id)),
    mnemonics: store.db.mnemonics,
    resources: store.db.resources,
    questions: store.db.questions.map(safeQuestion),
    flashcards: store.db.flashcards,
    users: store.db.users.filter((u) => !u.banned).map(publicUser)
  });
});

/* ================= PERSONAL ================= */
app.get('/api/personal', requireAuth, (req, res) => {
  res.json({ personal: ensurePersonal(req.user.id) });
});

app.post('/api/tasks', requireAuth, (req, res) => {
  const text = String((req.body || {}).text || '').trim().slice(0, 240);
  if (!text) return res.status(400).json({ error: 'Task text required' });
  const p = ensurePersonal(req.user.id);
  const task = { id: uid('t'), text, done: false, createdAt: Date.now() };
  p.tasks.unshift(task);
  persist();
  res.json({ task });
});
app.patch('/api/tasks/:id', requireAuth, (req, res) => {
  const p = ensurePersonal(req.user.id);
  const t = p.tasks.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (typeof (req.body || {}).done === 'boolean') t.done = req.body.done;
  persist();
  res.json({ task: t });
});
app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  const p = ensurePersonal(req.user.id);
  p.tasks = p.tasks.filter((x) => x.id !== req.params.id);
  persist();
  res.json({ ok: true });
});

app.put('/api/pomodoro/settings', requireAuth, (req, res) => {
  const p = ensurePersonal(req.user.id);
  const { focus, short, long } = req.body || {};
  if (focus) p.pomodoro.focus = Math.max(1, Math.min(180, +focus));
  if (short) p.pomodoro.short = Math.max(1, Math.min(60, +short));
  if (long) p.pomodoro.long = Math.max(1, Math.min(90, +long));
  persist();
  res.json({ pomodoro: p.pomodoro });
});

app.put('/api/planner', requireAuth, (req, res) => {
  const p = ensurePersonal(req.user.id);
  const { blocks, cells } = req.body || {};
  if (Array.isArray(blocks)) p.planner.blocks = blocks.slice(0, 12).map((b) => String(b).slice(0, 40));
  if (cells && typeof cells === 'object') {
    const clean = {};
    for (const k of Object.keys(cells).slice(0, 200)) clean[k.slice(0, 20)] = String(cells[k]).slice(0, 400);
    p.planner.cells = clean;
  }
  persist();
  res.json({ planner: p.planner });
});
app.post('/api/planner/exams', requireAuth, (req, res) => {
  const p = ensurePersonal(req.user.id);
  const { name, date } = req.body || {};
  if (!name || !date) return res.status(400).json({ error: 'Name and date required' });
  const exam = { id: uid('ex'), name: String(name).slice(0, 80), date: String(date).slice(0, 10) };
  p.planner.exams.push(exam);
  persist();
  res.json({ exam });
});
app.delete('/api/planner/exams/:id', requireAuth, (req, res) => {
  const p = ensurePersonal(req.user.id);
  p.planner.exams = p.planner.exams.filter((e) => e.id !== req.params.id);
  persist();
  res.json({ ok: true });
});

app.get('/api/qbank', requireAuth, (req, res) => {
  const rows = [];
  for (const uid_ of Object.keys(store.db.personal)) {
    const u = findUserById(uid_);
    if (!u || u.banned) continue;
    for (const entry of store.db.personal[uid_].qbank) {
      rows.push({ ...entry, username: u.username, color: u.color });
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  res.json({ qbank: rows.slice(0, 300) });
});
app.post('/api/qbank', requireAuth, (req, res) => {
  const { subjectId, total, correct, date } = req.body || {};
  const t = +total, c = +correct;
  if (!store.db.subjects.find((s) => s.id === subjectId)) return res.status(400).json({ error: 'Unknown subject' });
  if (!t || c < 0 || c > t) return res.status(400).json({ error: 'Check your numbers' });
  const p = ensurePersonal(req.user.id);
  const entry = { id: uid('qb'), subjectId, total: t, correct: c, date: (date || '').slice(0, 10) || new Date().toISOString().slice(0, 10), createdAt: Date.now() };
  p.qbank.unshift(entry);
  persist();
  res.json({ entry: { ...entry, username: req.user.username, color: req.user.color } });
});
app.delete('/api/qbank/:id', requireAuth, (req, res) => {
  const p = ensurePersonal(req.user.id);
  p.qbank = p.qbank.filter((e) => e.id !== req.params.id);
  persist();
  res.json({ ok: true });
});

app.get('/api/questions/export', requireAuth, (req, res) => {
  // Full question data including the correct answer — an explicit export action, unlike the
  // spoiler-safe list returned by /api/state, which withholds correctChoiceId/explanation.
  res.json({ questions: store.db.questions });
});

app.get('/api/subjects/:id/history', requireAuth, (req, res) => {
  const subject = store.db.subjects.find((s) => s.id === req.params.id);
  if (!subject) return res.status(404).json({ error: 'Not found' });
  const withIndex = (subject.notesHistory || []).map((h, index) => ({ ...h, index }));
  res.json({ history: withIndex.reverse() });
});
app.post('/api/subjects/:id/restore', requireAuth, (req, res) => {
  const subject = store.db.subjects.find((s) => s.id === req.params.id);
  if (!subject) return res.status(404).json({ error: 'Not found' });
  const idx = (req.body || {}).index;
  const entry = subject.notesHistory && subject.notesHistory[idx];
  if (!entry) return res.status(400).json({ error: 'Invalid version' });
  if (!subject.notesHistory) subject.notesHistory = [];
  subject.notesHistory.push({ text: subject.notes, authorName: subject.notesUpdatedBy || 'Unknown', ts: subject.notesUpdatedAt || Date.now() });
  if (subject.notesHistory.length > 20) subject.notesHistory.shift();
  subject.notes = entry.text;
  subject.notesUpdatedBy = `${req.user.username} (restored)`;
  subject.notesUpdatedAt = Date.now();
  persist();
  io.to('subject:' + subject.id).emit('note:updated', { subjectId: subject.id, text: subject.notes, updatedBy: subject.notesUpdatedBy, updatedAt: subject.notesUpdatedAt });
  res.json({ ok: true, notes: subject.notes, notesUpdatedBy: subject.notesUpdatedBy, notesUpdatedAt: subject.notesUpdatedAt });
});

app.post('/api/questions/:id/answer', requireAuth, (req, res) => {
  const q = store.db.questions.find((x) => x.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  const choiceId = (req.body || {}).choiceId;
  const correct = choiceId === q.correctChoiceId;
  const p = ensurePersonal(req.user.id);
  p.qAnswers.unshift({ id: uid('qa'), questionId: q.id, subjectId: q.subjectId, choiceId, correct, ts: Date.now() });
  if (p.qAnswers.length > 3000) p.qAnswers.length = 3000;
  persist();
  res.json({ correct, correctChoiceId: q.correctChoiceId, explanation: q.explanation });
});

app.post('/api/questions/:id/flag', requireAuth, (req, res) => {
  const q = store.db.questions.find((x) => x.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  const p = ensurePersonal(req.user.id);
  const idx = p.flags.indexOf(q.id);
  let flagged;
  if (idx === -1) { p.flags.push(q.id); flagged = true; } else { p.flags.splice(idx, 1); flagged = false; }
  persist();
  res.json({ flagged });
});

app.get('/api/srs/due', requireAuth, (req, res) => {
  const p = ensurePersonal(req.user.id);
  const now = Date.now();
  const due = store.db.flashcards.filter((c) => cardIsDue(p.srs[c.id], now));
  res.json({
    due: due.map((c) => ({ ...c, srs: p.srs[c.id] || null, srsState: cardStateName(p.srs[c.id]) })),
    totalCards: store.db.flashcards.length,
    dueCount: due.length
  });
});
app.post('/api/srs/review', requireAuth, (req, res) => {
  const { cardId, rating } = req.body || {};
  const card = store.db.flashcards.find((c) => c.id === cardId);
  if (!card) return res.status(404).json({ error: 'Not found' });
  if (!['again', 'hard', 'good', 'easy'].includes(rating)) return res.status(400).json({ error: 'Invalid rating' });
  const p = ensurePersonal(req.user.id);
  p.srs[cardId] = reviewCard(p.srs[cardId], rating);
  persist();
  res.json({ srs: p.srs[cardId], srsState: cardStateName(p.srs[cardId]), intervalDays: p.srs[cardId].scheduled_days });
});

/* ================= ADMIN ================= */
app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json({ users: store.db.users.map(publicUser) });
});
app.post('/api/admin/users/:id/role', requireAdmin, (req, res) => {
  const target = findUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Not found' });
  const role = req.body && req.body.role;
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (target.role === 'admin' && role !== 'admin') {
    const admins = store.db.users.filter((u) => u.role === 'admin' && !u.banned);
    if (admins.length <= 1) return res.status(400).json({ error: 'At least one admin must remain.' });
  }
  target.role = role;
  persist();
  res.json({ user: publicUser(target) });
});
app.post('/api/admin/users/:id/ban', requireAdmin, (req, res) => {
  const target = findUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: "You can't ban yourself." });
  target.banned = !!(req.body && req.body.banned);
  persist();
  if (target.banned) forceDisconnect(target.id);
  res.json({ user: publicUser(target) });
});
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const target = findUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: "You can't delete yourself." });
  if (target.role === 'admin') {
    const admins = store.db.users.filter((u) => u.role === 'admin');
    if (admins.length <= 1) return res.status(400).json({ error: 'At least one admin must remain.' });
  }
  store.db.users = store.db.users.filter((u) => u.id !== target.id);
  delete store.db.personal[target.id];
  delete store.db.progress[target.id];
  persist();
  forceDisconnect(target.id);
  res.json({ ok: true });
});

app.get('/api/admin/invites', requireAdmin, (req, res) => res.json({ invites: store.db.invites }));
app.post('/api/admin/invites', requireAdmin, (req, res) => {
  const invite = { code: makeInviteCode(), note: String((req.body || {}).note || '').slice(0, 80), createdBy: req.user.id, createdAt: Date.now(), usedBy: null, usedAt: null, revoked: false };
  store.db.invites.unshift(invite);
  persist();
  res.json({ invite });
});
app.delete('/api/admin/invites/:code', requireAdmin, (req, res) => {
  const invite = store.db.invites.find((i) => i.code === req.params.code);
  if (invite && !invite.usedBy) invite.revoked = true;
  persist();
  res.json({ ok: true });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.json({
    stats: {
      users: store.db.users.length,
      admins: store.db.users.filter((u) => u.role === 'admin').length,
      onlineNow: onlineUserIds().size,
      subjects: store.db.subjects.length,
      topics: store.db.subjects.reduce((a, s) => a + s.topics.length, 0),
      messages: store.db.messages.length,
      mnemonics: store.db.mnemonics.length,
      resources: store.db.resources.length,
      qbankEntries: Object.values(store.db.personal).reduce((a, p) => a + p.qbank.length, 0),
      questions: store.db.questions.length,
      flashcards: store.db.flashcards.length
    }
  });
});

app.get('/api/admin/messages', requireAdmin, (req, res) => {
  const room = req.query.room;
  let rows = store.db.messages;
  if (room) rows = rows.filter((m) => m.room === room);
  res.json({ messages: rows.slice(-200).reverse() });
});
app.delete('/api/admin/messages/:id', requireAdmin, (req, res) => {
  const msg = store.db.messages.find((m) => m.id === req.params.id);
  store.db.messages = store.db.messages.filter((m) => m.id !== req.params.id);
  persist();
  if (msg) io.to(msg.room).emit('chat:deleted', { id: msg.id, room: msg.room });
  res.json({ ok: true });
});

app.delete('/api/admin/subjects/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  store.db.subjects = store.db.subjects.filter((s) => s.id !== id);
  store.db.questions = store.db.questions.filter((q) => q.subjectId !== id);
  store.db.flashcards = store.db.flashcards.filter((c) => c.subjectId !== id);
  persist();
  io.emit('subject:deleted', { id });
  res.json({ ok: true });
});

app.get('/api/admin/export', requireAdmin, (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="study-hub-backup.json"');
  res.json(store.db);
});

/* ================= static frontend ================= */
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ================= SERVER + SOCKET.IO ================= */
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

const roomUsers = new Map(); // room -> Map(userId -> {id,username,color})
const socketsByUser = new Map(); // userId -> Set(socket)

function onlineUserIds() {
  return new Set(socketsByUser.keys());
}
function forceDisconnect(userId) {
  const set = socketsByUser.get(userId);
  if (set) for (const s of set) s.disconnect(true);
}
function broadcastPresence(room) {
  const map = roomUsers.get(room);
  const users = map ? Array.from(map.values()) : [];
  io.to(room).emit('presence:update', { room, users, onlineTotal: onlineUserIds().size });
}

io.on('connection', (socket) => {
  const sess = socket.request.session;
  const userId = sess && sess.userId;
  const user = userId && findUserById(userId);
  if (!user || user.banned) { socket.disconnect(true); return; }

  if (!socketsByUser.has(user.id)) socketsByUser.set(user.id, new Set());
  socketsByUser.get(user.id).add(socket);
  socket.data.joinedRooms = new Set();

  socket.emit('hello', { onlineTotal: onlineUserIds().size });
  io.emit('presence:global', { onlineTotal: onlineUserIds().size });

  socket.on('room:join', ({ room }) => {
    if (typeof room !== 'string' || !room) return;
    socket.join(room);
    socket.data.joinedRooms.add(room);
    if (!roomUsers.has(room)) roomUsers.set(room, new Map());
    roomUsers.get(room).set(user.id, { id: user.id, username: user.username, color: user.color });
    const recent = store.db.messages.filter((m) => m.room === room).slice(-50);
    socket.emit('room:history', { room, messages: recent });
    broadcastPresence(room);
  });

  socket.on('room:leave', ({ room }) => {
    socket.leave(room);
    socket.data.joinedRooms.delete(room);
    const map = roomUsers.get(room);
    if (map) {
      const stillHere = Array.from(socketsByUser.get(user.id) || []).some((s) => s !== socket && s.data.joinedRooms.has(room));
      if (!stillHere) map.delete(user.id);
    }
    broadcastPresence(room);
  });

  socket.on('chat:send', ({ room, text }) => {
    const clean = String(text || '').trim().slice(0, 1000);
    if (!clean || typeof room !== 'string') return;
    const msg = { id: uid('m'), room, userId: user.id, username: user.username, color: user.color, text: clean, ts: Date.now() };
    store.db.messages.push(msg);
    if (store.db.messages.length > 5000) store.db.messages.splice(0, store.db.messages.length - 5000);
    persist();
    io.to(room).emit('chat:message', msg);
  });

  socket.on('chat:typing', ({ room }) => {
    if (typeof room !== 'string') return;
    socket.to(room).emit('chat:typing', { room, username: user.username, color: user.color });
  });

  socket.on('note:update', ({ subjectId, text }) => {
    const subject = store.db.subjects.find((s) => s.id === subjectId);
    if (!subject || typeof text !== 'string') return;
    if (!subject.notesHistory) subject.notesHistory = [];
    const now = Date.now();
    const lastSnap = subject.notesHistory[subject.notesHistory.length - 1];
    const staleEnough = !subject.notesUpdatedAt || now - subject.notesUpdatedAt > 60000;
    if (subject.notes && subject.notes.trim() && subject.notes !== text && staleEnough && (!lastSnap || lastSnap.text !== subject.notes)) {
      subject.notesHistory.push({ text: subject.notes, authorName: subject.notesUpdatedBy || 'Unknown', ts: subject.notesUpdatedAt || now });
      if (subject.notesHistory.length > 20) subject.notesHistory.shift();
    }
    subject.notes = text.slice(0, 20000);
    subject.notesUpdatedBy = user.username;
    subject.notesUpdatedAt = now;
    persist();
    socket.to('subject:' + subjectId).emit('note:updated', { subjectId, text: subject.notes, updatedBy: user.username, updatedAt: subject.notesUpdatedAt });
  });

  socket.on('subject:create', ({ name, color }) => {
    const clean = String(name || '').trim().slice(0, 60);
    if (!clean) return;
    const subject = { id: uid('subj'), name: clean, color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : randomColor(), topics: [], notes: `# ${clean}\n\nAdd a foundational overview here — everyone can edit.`, notesUpdatedBy: user.username, notesUpdatedAt: Date.now() };
    store.db.subjects.push(subject);
    persist();
    io.emit('subject:created', { subject: subjectPayload(subject, null) });
  });

  socket.on('topic:add', ({ subjectId, name }) => {
    const subject = store.db.subjects.find((s) => s.id === subjectId);
    const clean = String(name || '').trim().slice(0, 100);
    if (!subject || !clean) return;
    const topic = { id: uid('top'), name: clean };
    subject.topics.push(topic);
    persist();
    io.emit('topic:added', { subjectId, topic: topicPayload(subject, topic, null) });
  });

  socket.on('topic:delete', ({ subjectId, topicId }) => {
    const subject = store.db.subjects.find((s) => s.id === subjectId);
    if (!subject) return;
    subject.topics = subject.topics.filter((t) => t.id !== topicId);
    for (const uidKey of Object.keys(store.db.progress)) delete store.db.progress[uidKey][topicId];
    persist();
    io.emit('topic:deleted', { subjectId, topicId });
  });

  socket.on('progress:toggle', ({ subjectId, topicId }) => {
    const subject = store.db.subjects.find((s) => s.id === subjectId);
    const topic = subject && subject.topics.find((t) => t.id === topicId);
    if (!topic) return;
    const prog = ensureProgress(user.id);
    prog[topicId] = !prog[topicId];
    persist();
    io.emit('progress:updated', { subjectId, topicId, payload: topicPayload(subject, topic, null) });
    socket.emit('progress:mine', { topicId, mine: prog[topicId] });
  });

  socket.on('mnemonic:add', ({ subjectId, term, prompt, answer }) => {
    const t = String(term || '').trim().slice(0, 80), p = String(prompt || '').trim().slice(0, 300), a = String(answer || '').trim().slice(0, 600);
    if (!t || !p) return;
    const m = { id: uid('mn'), subjectId: subjectId || null, term: t, prompt: p, answer: a, authorId: user.id, authorName: user.username, createdAt: Date.now() };
    store.db.mnemonics.unshift(m);
    persist();
    io.emit('mnemonic:added', { mnemonic: m });
  });
  socket.on('mnemonic:delete', ({ id }) => {
    const m = store.db.mnemonics.find((x) => x.id === id);
    if (!m) return;
    if (m.authorId !== user.id && user.role !== 'admin') return;
    store.db.mnemonics = store.db.mnemonics.filter((x) => x.id !== id);
    persist();
    io.emit('mnemonic:deleted', { id });
  });

  socket.on('resource:add', ({ subjectId, title, url, category }) => {
    const ti = String(title || '').trim().slice(0, 100);
    let u2 = String(url || '').trim().slice(0, 400);
    if (!ti || !u2) return;
    if (!/^https?:\/\//i.test(u2)) u2 = 'https://' + u2;
    const r = { id: uid('res'), subjectId: subjectId || null, title: ti, url: u2, category: String(category || 'Other').slice(0, 30), authorId: user.id, authorName: user.username, createdAt: Date.now() };
    store.db.resources.unshift(r);
    persist();
    io.emit('resource:added', { resource: r });
  });
  socket.on('resource:delete', ({ id }) => {
    const r = store.db.resources.find((x) => x.id === id);
    if (!r) return;
    if (r.authorId !== user.id && user.role !== 'admin') return;
    store.db.resources = store.db.resources.filter((x) => x.id !== id);
    persist();
    io.emit('resource:deleted', { id });
  });

  socket.on('question:add', ({ subjectId, stem, choices, correctIndex, explanation, tags }) => {
    const cleanStem = String(stem || '').trim().slice(0, 1000);
    const cleanChoices = Array.isArray(choices) ? choices.map((c) => String(c || '').trim().slice(0, 300)).filter(Boolean) : [];
    if (!cleanStem || cleanChoices.length < 2 || cleanChoices.length > 6) return;
    const idx = +correctIndex;
    if (!(idx >= 0 && idx < cleanChoices.length)) return;
    const choiceObjs = cleanChoices.map((text) => ({ id: uid('c'), text }));
    const q = {
      id: uid('q'),
      subjectId: subjectId || null,
      stem: cleanStem,
      choices: choiceObjs,
      correctChoiceId: choiceObjs[idx].id,
      explanation: String(explanation || '').trim().slice(0, 2000),
      tags: Array.isArray(tags) ? tags.map((t) => String(t).trim().slice(0, 30)).filter(Boolean).slice(0, 6) : [],
      authorId: user.id,
      authorName: user.username,
      createdAt: Date.now()
    };
    store.db.questions.push(q);
    persist();
    io.emit('question:added', { question: safeQuestion(q) });
  });
  socket.on('question:bulkAdd', ({ subjectId, items }) => {
    if (!Array.isArray(items)) return;
    const created = [];
    for (const raw of items.slice(0, 500)) {
      const stem = String((raw && raw.stem) || '').trim().slice(0, 1000);
      const rawChoices = Array.isArray(raw && raw.choices) ? raw.choices.map((c) => String(c || '').trim().slice(0, 300)).filter(Boolean) : [];
      if (!stem || rawChoices.length < 2 || rawChoices.length > 6) continue;
      const idx = +raw.correctIndex;
      if (!(idx >= 0 && idx < rawChoices.length)) continue;
      const choiceObjs = rawChoices.map((text) => ({ id: uid('c'), text }));
      const q = {
        id: uid('q'), subjectId: subjectId || null, stem, choices: choiceObjs, correctChoiceId: choiceObjs[idx].id,
        explanation: String((raw && raw.explanation) || '').trim().slice(0, 2000),
        tags: Array.isArray(raw && raw.tags) ? raw.tags.map((t) => String(t).trim().slice(0, 30)).filter(Boolean).slice(0, 6) : [],
        authorId: user.id, authorName: user.username, createdAt: Date.now()
      };
      store.db.questions.push(q);
      created.push(safeQuestion(q));
    }
    if (!created.length) return socket.emit('bulk:result', { kind: 'question', added: 0, skipped: items.length });
    persist();
    io.emit('question:bulkAdded', { questions: created });
    socket.emit('bulk:result', { kind: 'question', added: created.length, skipped: items.length - created.length });
  });
  socket.on('question:delete', ({ id }) => {
    const q = store.db.questions.find((x) => x.id === id);
    if (!q) return;
    if (q.authorId !== user.id && user.role !== 'admin') return;
    store.db.questions = store.db.questions.filter((x) => x.id !== id);
    for (const uidKey of Object.keys(store.db.personal)) {
      const idx = store.db.personal[uidKey].flags.indexOf(id);
      if (idx !== -1) store.db.personal[uidKey].flags.splice(idx, 1);
    }
    persist();
    io.emit('question:deleted', { id });
  });

  socket.on('flashcard:add', ({ subjectId, front, back }) => {
    const f = String(front || '').trim().slice(0, 500), b = String(back || '').trim().slice(0, 1000);
    if (!f || !b) return;
    const card = { id: uid('fc'), subjectId: subjectId || null, front: f, back: b, authorId: user.id, authorName: user.username, createdAt: Date.now() };
    store.db.flashcards.push(card);
    persist();
    io.emit('flashcard:added', { card });
  });
  socket.on('flashcard:bulkAdd', ({ subjectId, cards }) => {
    if (!Array.isArray(cards)) return;
    const created = [];
    for (const raw of cards.slice(0, 500)) {
      const f = String((raw && raw.front) || '').trim().slice(0, 500);
      const b = String((raw && raw.back) || '').trim().slice(0, 1000);
      if (!f || !b) continue;
      const card = { id: uid('fc'), subjectId: subjectId || null, front: f, back: b, authorId: user.id, authorName: user.username, createdAt: Date.now() };
      store.db.flashcards.push(card);
      created.push(card);
    }
    if (!created.length) return socket.emit('bulk:result', { kind: 'flashcard', added: 0, skipped: cards.length });
    persist();
    io.emit('flashcard:bulkAdded', { cards: created });
    socket.emit('bulk:result', { kind: 'flashcard', added: created.length, skipped: cards.length - created.length });
  });
  socket.on('flashcard:delete', ({ id }) => {
    const c = store.db.flashcards.find((x) => x.id === id);
    if (!c) return;
    if (c.authorId !== user.id && user.role !== 'admin') return;
    store.db.flashcards = store.db.flashcards.filter((x) => x.id !== id);
    for (const uidKey of Object.keys(store.db.personal)) delete store.db.personal[uidKey].srs[id];
    persist();
    io.emit('flashcard:deleted', { id });
  });

  socket.on('pomodoro:complete', ({ minutes, subjectId }) => {
    const mins = Math.max(1, Math.min(180, +minutes || 0));
    const p = ensurePersonal(user.id);
    p.pomodoro.sessions.unshift({ id: uid('ps'), minutes: mins, subjectId: subjectId || null, date: new Date().toISOString().slice(0, 10), ts: Date.now() });
    if (p.pomodoro.sessions.length > 500) p.pomodoro.sessions.length = 500;
    persist();
    const subject = store.db.subjects.find((s) => s.id === subjectId);
    io.emit('activity:feed', { username: user.username, color: user.color, subjectName: subject ? subject.name : null, minutes: mins, ts: Date.now() });
  });

  socket.on('disconnect', () => {
    const set = socketsByUser.get(user.id);
    if (set) { set.delete(socket); if (set.size === 0) socketsByUser.delete(user.id); }
    for (const room of socket.data.joinedRooms) {
      const map = roomUsers.get(room);
      if (map) {
        const stillHere = Array.from(socketsByUser.get(user.id) || []).some((s) => s.data.joinedRooms.has(room));
        if (!stillHere) map.delete(user.id);
      }
      broadcastPresence(room);
    }
    io.emit('presence:global', { onlineTotal: onlineUserIds().size });
  });
});

server.listen(PORT, () => {
  console.log(`Study Hub running at http://localhost:${PORT}`);
});
