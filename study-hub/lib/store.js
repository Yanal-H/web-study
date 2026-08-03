'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildSeedSubjects, COLORS } = require('./seedData');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function uid(prefix) {
  return (prefix ? prefix + '_' : '') + crypto.randomBytes(9).toString('base64url');
}

function defaultDB() {
  return {
    users: [],
    invites: [],
    subjects: buildSeedSubjects(),
    messages: [],
    mnemonics: [],
    resources: [],
    questions: [],   // {id, subjectId, stem, choices:[{id,text}], correctChoiceId, explanation, tags:[], authorId, authorName, createdAt}
    flashcards: [],  // {id, subjectId, front, back, authorId, authorName, createdAt}
    personal: {}, // userId -> { tasks, pomodoro, planner, qbank, qAnswers, srs }
    progress: {}  // userId -> { [topicId]: true }
  };
}

let db;

function load() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    db = JSON.parse(raw);
    const def = defaultDB();
    for (const k of Object.keys(def)) {
      if (!(k in db)) db[k] = def[k];
    }
  } catch (e) {
    db = defaultDB();
    persist();
  }
}

let writeTimer = null;
function persist() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_PATH);
  }, 60);
}

load();

/* ---- users ---- */
function findUserByUsername(username) {
  const lc = String(username || '').trim().toLowerCase();
  return db.users.find((u) => u.username.toLowerCase() === lc);
}
function findUserById(id) {
  return db.users.find((u) => u.id === id);
}
function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, role: u.role, color: u.color, banned: !!u.banned, createdAt: u.createdAt };
}
function ensurePersonal(userId) {
  if (!db.personal[userId]) {
    db.personal[userId] = {
      tasks: [],
      pomodoro: { focus: 25, short: 5, long: 15, sessions: [] },
      planner: { blocks: ['Morning', 'Midday', 'Afternoon', 'Evening', 'Night'], cells: {}, exams: [] },
      qbank: [],
      qAnswers: [],
      srs: {}
    };
  }
  const p = db.personal[userId];
  if (!p.qAnswers) p.qAnswers = [];
  if (!p.srs) p.srs = {};
  return p;
}
function ensureProgress(userId) {
  if (!db.progress[userId]) db.progress[userId] = {};
  return db.progress[userId];
}

/* ---- spaced repetition (simplified SM-2) ---- */
function reviewCard(prev, rating) {
  let { ease, interval, reps } = prev || { ease: 2.5, interval: 0, reps: 0 };
  if (rating === 'again') {
    reps = 0; interval = 0; ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    if (rating === 'hard') { ease = Math.max(1.3, ease - 0.15); interval = Math.max(1, Math.round((interval || 1) * 1.2)); }
    else if (rating === 'good') { interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round((interval || 1) * ease); }
    else if (rating === 'easy') { ease = ease + 0.15; interval = reps === 1 ? 4 : Math.round((interval || 1) * ease * 1.3); }
  }
  interval = Math.max(rating === 'again' ? 0 : 1, interval);
  const now = Date.now();
  const dueInMs = rating === 'again' ? 60 * 1000 : interval * 86400000;
  return { ease, interval, reps, due: now + dueInMs, lastReviewed: now };
}

/* ---- invites ---- */
function makeInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase().match(/.{1,4}/g).join('-');
}

module.exports = {
  uid,
  COLORS,
  persist,
  get db() { return db; },
  findUserByUsername,
  findUserById,
  publicUser,
  ensurePersonal,
  ensureProgress,
  makeInviteCode,
  reviewCard
};
