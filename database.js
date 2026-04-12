const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: connectionString,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
  process.exit(-1);
});

async function initDB() {
  console.log('[DB] Starting PostgreSQL initDB process...');
  const client = await pool.connect();
  try {
    // Создание таблицы пользователей
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        totalGames INTEGER DEFAULT 0,
        totalSolved INTEGER DEFAULT 0,
        bestResult INTEGER DEFAULT 0,
        bestSolo INTEGER DEFAULT 0,
        glicko_rating REAL DEFAULT 1500,
        glicko_rd REAL DEFAULT 350,
        glicko_vol REAL DEFAULT 0.06,
        created BIGINT
      )
    `);
    console.log('[DB] users table ready');

    // Структура таблицы истории матчей
    await client.query(`
      CREATE TABLE IF NOT EXISTS match_results (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        score INTEGER DEFAULT 0,
        is_win INTEGER DEFAULT 0,
        timestamp BIGINT NOT NULL,
        mode VARCHAR(50) NOT NULL
      )
    `);
    console.log('[DB] match_results table initialized');

    // Community tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS community_tasks (
        id SERIAL PRIMARY KEY,
        author VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        topic VARCHAR(100) NOT NULL,
        grade VARCHAR(20) NOT NULL,
        createdAt BIGINT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS community_comments (
        id SERIAL PRIMARY KEY,
        taskId INTEGER NOT NULL,
        author VARCHAR(255) NOT NULL,
        text TEXT NOT NULL,
        createdAt BIGINT NOT NULL
      )
    `);
    
    // Daily challenge tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_challenges (
        date VARCHAR(20) PRIMARY KEY,
        question TEXT NOT NULL,
        answer VARCHAR(255) NOT NULL,
        options TEXT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_solvers (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        date VARCHAR(20) NOT NULL,
        timestamp BIGINT NOT NULL,
        UNIQUE(username, date)
      )
    `);

    // Achievements table
    await client.query(`
      CREATE TABLE IF NOT EXISTS achievements (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        achievementId VARCHAR(100) NOT NULL,
        timestamp BIGINT NOT NULL,
        UNIQUE(username, achievementId)
      )
    `);

    // Solo records by difficulty
    await client.query(`
      CREATE TABLE IF NOT EXISTS solo_records (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        mode VARCHAR(50) NOT NULL,
        score INTEGER DEFAULT 0,
        timestamp BIGINT NOT NULL,
        UNIQUE(username, mode)
      )
    `);

    // Проверка/добавление новых колонок (миграции)
    const columns = [
      'bestSolo INTEGER DEFAULT 0',
      'glicko_rating REAL DEFAULT 1500',
      'glicko_rd REAL DEFAULT 350',
      'glicko_vol REAL DEFAULT 0.06',
      'xp INTEGER DEFAULT 0'
    ];

    for (const colDef of columns) {
      const colName = colDef.split(' ')[0];
      try {
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${colName} ${colDef.substring(colDef.indexOf(' ')+1)}`);
      } catch (e) {
        console.warn(`[DB] Migration notice (${colName}):`, e.message);
      }
    }
    
    console.log('[DB] Database initialized successfully on PostgreSQL (Neon.tech)');
  } finally {
    client.release();
  }
}

async function getUser(username) {
  const res = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  return res.rows[0];
}

async function createUser(user) {
  const res = await pool.query(`
    INSERT INTO users (username, password, created)
    VALUES ($1, $2, $3) RETURNING id
  `, [user.username, user.password, Date.now()]);
  console.log(`[DB] User created: ${user.username} (ID: ${res.rows[0].id})`);
  return res.rows[0].id;
}

async function updateUserStats(username, updates) {
  const keys = Object.keys(updates);
  if (keys.length === 0) return 0;
  
  // Special handling for xp column might be needed if it was added late,
  // but pg handle columns dynamically in this query builder style fine.
  
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => updates[k]);
  values.push(username); // Это последнее значение для WHERE условия
  
  const res = await pool.query(`UPDATE users SET ${setClause} WHERE LOWER(username) = LOWER($${keys.length + 1})`, values);
  console.log(`[DB] Stats updated for ${username}: ${keys.join(', ')}`);
  return res.rowCount;
}

async function getLeaderboard(limit = 10) {
  const res = await pool.query('SELECT username, wins, totalSolved, bestSolo, glicko_rating FROM users ORDER BY glicko_rating DESC, wins DESC LIMIT $1', [limit]);
  return res.rows;
}

async function recordMatchResult(data) {
  const { username, score, is_win, mode } = data;
  const res = await pool.query(`
    INSERT INTO match_results (username, score, is_win, timestamp, mode)
    VALUES ($1, $2, $3, $4, $5) RETURNING id
  `, [username, score, is_win ? 1 : 0, Date.now(), mode]);
  console.log(`[DB] Match result recorded: ${username} (score: ${score}, win: ${is_win})`);
  return res.rows[0].id;
}

async function getFilteredLeaderboard(filter = 'all', limit = 10) {
  let query, params;
  
  if (filter === 'all') {
    query = 'SELECT username, wins, totalSolved, bestSolo, glicko_rating FROM users ORDER BY glicko_rating DESC, wins DESC LIMIT $1';
    params = [limit];
  } else {
    let interval = 0;
    if (filter === 'hour') interval = 3600000;
    if (filter === 'day') interval = 86400000;
    
    const startTime = Date.now() - interval;
    
    query = `
      SELECT username, 
             COALESCE(SUM(is_win)::int, 0) as wins, 
             COALESCE(SUM(score)::int, 0) as totalSolved, 
             COALESCE(MAX(score)::int, 0) as bestSolo, 
             1500 as glicko_rating 
      FROM match_results 
      WHERE timestamp > $1 
      GROUP BY username 
      ORDER BY wins DESC, totalSolved DESC 
      LIMIT $2
    `;
    params = [startTime, limit];
  }
  
  const res = await pool.query(query, params);
  return res.rows;
}

async function getMatchHistory(username, limit = 10) {
   const res = await pool.query('SELECT * FROM match_results WHERE LOWER(username) = LOWER($1) ORDER BY timestamp DESC LIMIT $2', [username, limit]);
   return res.rows;
}

async function searchUsers(prefix, limit = 5) {
  const res = await pool.query('SELECT username, glicko_rating FROM users WHERE username ILIKE $1 LIMIT $2', [prefix + '%', limit]);
  return res.rows;
}

// ──── Community Functions ────

async function getCommunityTasks() {
  const tasksRes = await pool.query('SELECT * FROM community_tasks ORDER BY createdAt DESC');
  const tasks = tasksRes.rows;
  
  // Fetch comment counts for each task
  for (let t of tasks) {
    const countRes = await pool.query('SELECT COUNT(*)::int as count FROM community_comments WHERE taskId = $1', [t.id]);
    t.commentCount = countRes.rows[0].count;
  }
  return tasks;
}

async function getCommunityComments(taskId) {
  const res = await pool.query('SELECT * FROM community_comments WHERE taskId = $1 ORDER BY createdAt ASC', [taskId]);
  return res.rows;
}

async function createCommunityTask(data) {
  const { author, title, text, topic, grade } = data;
  const res = await pool.query(`
    INSERT INTO community_tasks (author, title, content, topic, grade, createdAt)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
  `, [author, title, text, topic, grade, Date.now()]);
  return res.rows[0].id;
}

async function addCommunityComment(data) {
  const { taskId, author, text } = data;
  const res = await pool.query(`
    INSERT INTO community_comments (taskId, author, text, createdAt)
    VALUES ($1, $2, $3, $4) RETURNING id
  `, [taskId, author, text, Date.now()]);
  return res.rows[0].id;
}

// ──── Daily Challenge Functions ────

async function getDailyChallenge(date) {
  const res = await pool.query('SELECT * FROM daily_challenges WHERE date = $1', [date]);
  if (!res.rows[0]) return null;
  const challenge = res.rows[0];
  return {
    ...challenge,
    options: JSON.parse(challenge.options)
  };
}

async function setDailyChallenge(challenge) {
  const { date, question, answer, options } = challenge;
  await pool.query(`
    INSERT INTO daily_challenges (date, question, answer, options)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (date) DO UPDATE SET question = $2, answer = $3, options = $4
  `, [date, question, answer, JSON.stringify(options)]);
}

async function hasSolvedDaily(username, date) {
  const res = await pool.query('SELECT id FROM daily_solvers WHERE username = $1 AND date = $2', [username, date]);
  return res.rowCount > 0;
}

async function markDailySolved(username, date) {
  await pool.query(`
    INSERT INTO daily_solvers (username, date, timestamp)
    VALUES ($1, $2, $3)
    ON CONFLICT DO NOTHING
  `, [username, date, Date.now()]);
}

// ──── Achievements & Records ────

async function addAchievement(username, achievementId) {
  await pool.query(`
    INSERT INTO achievements (username, achievementId, timestamp)
    VALUES ($1, $2, $3)
    ON CONFLICT (username, achievementId) DO NOTHING
  `, [username, achievementId, Date.now()]);
}

async function getUserAchievements(username) {
  const res = await pool.query('SELECT achievementId as achievement_id, timestamp FROM achievements WHERE LOWER(username) = LOWER($1)', [username]);
  return res.rows;
}

async function getUserSoloRecords(username) {
  const res = await pool.query('SELECT mode, score, timestamp FROM solo_records WHERE LOWER(username) = LOWER($1)', [username]);
  return res.rows;
}

async function updateSoloRecord(username, difficulty, score) {
  await pool.query(`
    INSERT INTO solo_records (username, mode, score, timestamp)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (username, mode) DO UPDATE SET 
      score = CASE WHEN EXCLUDED.score > solo_records.score THEN EXCLUDED.score ELSE solo_records.score END,
      timestamp = CASE WHEN EXCLUDED.score > solo_records.score THEN EXCLUDED.timestamp ELSE solo_records.timestamp END
  `, [username, difficulty, score, Date.now()]);
  
  // Also keep the global bestSolo in users table for leaderboard
  const user = await getUser(username);
  if (user && score > (user.bestSolo || 0)) {
    await updateUserStats(username, { bestSolo: score });
  }
}

module.exports = {
  pool,
  initDB,
  getUser,
  createUser,
  updateUserStats,
  getLeaderboard,
  getFilteredLeaderboard,
  recordMatchResult,
  getMatchHistory,
  searchUsers,
  getCommunityTasks,
  getCommunityComments,
  createCommunityTask,
  addCommunityComment,
  getDailyChallenge,
  setDailyChallenge,
  hasSolvedDaily,
  markDailySolved,
  addAchievement,
  getUserAchievements,
  getUserSoloRecords,
  updateSoloRecord
};

