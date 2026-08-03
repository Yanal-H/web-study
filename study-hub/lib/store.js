'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fsrs, createEmptyCard, Rating: FSRSRating } = require('ts-fsrs');
const { buildSeedSubjects, COLORS } = require('./seedData');

const scheduler = fsrs(); // FSRS-5, default parameters (~90% target retention) — the same algorithm Anki itself now uses

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
      srs: {},
      flags: []
    };
  }
  const p = db.personal[userId];
  if (!p.qAnswers) p.qAnswers = [];
  if (!p.srs) p.srs = {};
  if (!p.flags) p.flags = [];
  return p;
}
function ensureProgress(userId) {
  if (!db.progress[userId]) db.progress[userId] = {};
  return db.progress[userId];
}

/* ---- spaced repetition: FSRS-5 (open-spaced-repetition/ts-fsrs) ---- */
const FSRS_RATING = { again: FSRSRating.Again, hard: FSRSRating.Hard, good: FSRSRating.Good, easy: FSRSRating.Easy };
const FSRS_STATE_NAME = ['New', 'Learning', 'Review', 'Relearning'];
function reviewCard(prevRaw, rating) {
  const grade = FSRS_RATING[rating];
  if (grade === undefined) throw new Error('Invalid rating');
  const now = new Date();
  const card = prevRaw
    ? { ...prevRaw, due: new Date(prevRaw.due), last_review: prevRaw.last_review ? new Date(prevRaw.last_review) : undefined }
    : createEmptyCard(now);
  const { card: next } = scheduler.next(card, now, grade);
  return next; // due/last_review are Date objects; JSON.stringify serializes them to ISO strings on persist()
}
function cardIsDue(srsState, now) {
  return !srsState || new Date(srsState.due).getTime() <= now;
}
function cardStateName(srsState) {
  return srsState ? FSRS_STATE_NAME[srsState.state] || 'New' : 'New';
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
  reviewCard,
  cardIsDue,
  cardStateName
};
