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

    // Проверка/добавление новых колонок (миграции)
    const columns = [
      'bestSolo INTEGER DEFAULT 0',
      'glicko_rating REAL DEFAULT 1500',
      'glicko_rd REAL DEFAULT 350',
      'glicko_vol REAL DEFAULT 0.06'
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
    
    // В Postgres функции SUM и MAX возвращают большие числа (BigInt или String в Node.js), поэтому кастуем в ::int
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

module.exports = {
  pool,
  initDB,
  getUser,
  createUser,
  updateUserStats,
  getLeaderboard,
  getFilteredLeaderboard,
  recordMatchResult,
  getMatchHistory
};
