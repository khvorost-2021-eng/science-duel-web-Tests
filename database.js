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
        role VARCHAR(50) DEFAULT 'user',
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        totalGames INTEGER DEFAULT 0,
        duelGames INTEGER DEFAULT 0,
        soloGames INTEGER DEFAULT 0,
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
      "role VARCHAR(50) DEFAULT 'user'",
      "grade INTEGER DEFAULT 5",
      'bestSolo INTEGER DEFAULT 0',
      'bestResult INTEGER DEFAULT 0',
      'duelGames INTEGER DEFAULT 0',
      'soloGames INTEGER DEFAULT 0',
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
    
    // ── TOURNAMENT TABLES ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        type        VARCHAR(50)  DEFAULT 'olympic',
        status      VARCHAR(50)  DEFAULT 'waiting',
        max_players INTEGER      DEFAULT 8,
        difficulty  VARCHAR(50)  DEFAULT 'easy',
        created_at  BIGINT,
        started_at  BIGINT,
        finished_at BIGINT,
        admin_code  VARCHAR(64)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tournament_players (
        id             SERIAL PRIMARY KEY,
        tournament_id  INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
        username       VARCHAR(255) NOT NULL,
        seed           INTEGER,
        status         VARCHAR(50) DEFAULT 'active',
        wins           INTEGER DEFAULT 0,
        losses         INTEGER DEFAULT 0,
        joined_at      BIGINT,
        UNIQUE(tournament_id, username)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tournament_matches (
        id             SERIAL PRIMARY KEY,
        tournament_id  INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
        round          INTEGER NOT NULL,
        match_number   INTEGER NOT NULL,
        player1        VARCHAR(255),
        player2        VARCHAR(255),
        winner         VARCHAR(255),
        score_p1       INTEGER DEFAULT 0,
        score_p2       INTEGER DEFAULT 0,
        room_code      VARCHAR(10),
        status         VARCHAR(50) DEFAULT 'pending',
        started_at     BIGINT,
        finished_at    BIGINT
      )
    `);
    console.log('[DB] Tournament tables ready');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        grade INTEGER,
        rating REAL NOT NULL,
        rd REAL NOT NULL,
        volatility REAL NOT NULL,
        matches_played INTEGER DEFAULT 0,
        updated_at BIGINT,
        PRIMARY KEY(user_id, grade)
      )
    `);
    console.log('[DB] Ratings table initialized');

    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_challenges (
        grade INTEGER PRIMARY KEY,
        text TEXT,
        answer TEXT,
        updated_at BIGINT
      )
    `);
    console.log('[DB] Daily challenges table initialized');

  } finally {
    client.release();
  }
}

// ── TOURNAMENT DB FUNCTIONS ──────────────────────────────────────────────

async function createTournament({ name, difficulty = 'easy' }) {
  const res = await pool.query(
    `INSERT INTO tournaments (name, type, status, max_players, difficulty, created_at)
     VALUES ($1, 'olympic', 'waiting', 8, $2, $3) RETURNING *`,
    [name, difficulty, Date.now()]
  );
  return res.rows[0];
}

async function getTournament(id) {
  const res = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
  return res.rows[0];
}

async function listTournaments() {
  const res = await pool.query(
    `SELECT * FROM tournaments WHERE status IN ('waiting','active') ORDER BY created_at DESC LIMIT 20`
  );
  return res.rows;
}

async function joinTournament(tournamentId, username) {
  try {
    await pool.query(
      `INSERT INTO tournament_players (tournament_id, username, joined_at)
       VALUES ($1, $2, $3) ON CONFLICT (tournament_id, username) DO NOTHING`,
      [tournamentId, username, Date.now()]
    );
    const res = await pool.query(
      'SELECT COUNT(*)::int as count FROM tournament_players WHERE tournament_id = $1 AND status != $2',
      [tournamentId, 'eliminated']
    );
    return { ok: true, count: res.rows[0].count };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function getTournamentPlayers(tournamentId) {
  const res = await pool.query(
    `SELECT * FROM tournament_players WHERE tournament_id = $1 ORDER BY seed ASC, joined_at ASC`,
    [tournamentId]
  );
  return res.rows;
}

async function startTournament(tournamentId) {
  // Shuffle players and assign seeds 1–8
  const players = await getTournamentPlayers(tournamentId);
  const shuffled = players.sort(() => Math.random() - 0.5);
  for (let i = 0; i < shuffled.length; i++) {
    await pool.query(
      'UPDATE tournament_players SET seed = $1 WHERE id = $2',
      [i + 1, shuffled[i].id]
    );
  }
  // Create quarterfinal match skeleton: seed1 vs seed8, 2v7, 3v6, 4v5
  const seedMap = {};
  shuffled.forEach((p, i) => { seedMap[i + 1] = p.username; });
  const pairs = [[1,8],[2,7],[3,6],[4,5]];
  for (let i = 0; i < pairs.length; i++) {
    const [s1, s2] = pairs[i];
    await pool.query(
      `INSERT INTO tournament_matches (tournament_id, round, match_number, player1, player2, status)
       VALUES ($1, 1, $2, $3, $4, 'pending')`,
      [tournamentId, i + 1, seedMap[s1], seedMap[s2]]
    );
  }
  // Create empty semifinal and final placeholders
  for (let i = 1; i <= 2; i++) {
    await pool.query(
      `INSERT INTO tournament_matches (tournament_id, round, match_number, status)
       VALUES ($1, 2, $2, 'waiting')`,
      [tournamentId, i]
    );
  }
  await pool.query(
    `INSERT INTO tournament_matches (tournament_id, round, match_number, status)
     VALUES ($1, 3, 1, 'waiting')`,
    [tournamentId]
  );

  await pool.query(
    `UPDATE tournaments SET status = 'active', started_at = $1 WHERE id = $2`,
    [Date.now(), tournamentId]
  );
  return await getTournament(tournamentId);
}

async function getTournamentMatches(tournamentId) {
  const res = await pool.query(
    `SELECT * FROM tournament_matches WHERE tournament_id = $1 ORDER BY round ASC, match_number ASC`,
    [tournamentId]
  );
  return res.rows;
}

async function recordTournamentMatchResult({ matchId, winner, score_p1, score_p2, roomCode }) {
  await pool.query(
    `UPDATE tournament_matches SET winner = $1, score_p1 = $2, score_p2 = $3, room_code = $4,
     status = 'finished', finished_at = $5 WHERE id = $6`,
    [winner, score_p1, score_p2, roomCode, Date.now(), matchId]
  );
  // Update player wins/losses
  const match = (await pool.query('SELECT * FROM tournament_matches WHERE id = $1', [matchId])).rows[0];
  const loser = match.player1 === winner ? match.player2 : match.player1;
  await pool.query(
    `UPDATE tournament_players SET wins = wins + 1 WHERE tournament_id = $1 AND username = $2`,
    [match.tournament_id, winner]
  );
  await pool.query(
    `UPDATE tournament_players SET losses = losses + 1, status = 'eliminated' WHERE tournament_id = $1 AND username = $2`,
    [match.tournament_id, loser]
  );

  // Advance winner to next round
  const tournamentId = match.tournament_id;
  const round = match.round;
  const matchNumber = match.match_number;

  if (round === 1) {
    // QF match 1→SF match 1 player1, QF match 2→SF match 1 player2
    // QF match 3→SF match 2 player1, QF match 4→SF match 2 player2
    const sfMatchNumber = matchNumber <= 2 ? 1 : 2;
    const playerSlot = matchNumber % 2 === 1 ? 'player1' : 'player2';
    await pool.query(
      `UPDATE tournament_matches SET ${playerSlot} = $1, status = CASE
         WHEN player1 IS NOT NULL AND player2 IS NOT NULL THEN 'pending' ELSE 'waiting' END
       WHERE tournament_id = $2 AND round = 2 AND match_number = $3`,
      [winner, tournamentId, sfMatchNumber]
    );
  } else if (round === 2) {
    // SF match 1→Final player1, SF match 2→Final player2
    const playerSlot = matchNumber === 1 ? 'player1' : 'player2';
    await pool.query(
      `UPDATE tournament_matches SET ${playerSlot} = $1, status = CASE
         WHEN player1 IS NOT NULL AND player2 IS NOT NULL THEN 'pending' ELSE 'waiting' END
       WHERE tournament_id = $2 AND round = 3 AND match_number = 1`,
      [winner, tournamentId]
    );
  } else if (round === 3) {
    // Tournament finished
    await pool.query(
      `UPDATE tournaments SET status = 'finished', finished_at = $1 WHERE id = $2`,
      [Date.now(), tournamentId]
    );
    await pool.query(
      `UPDATE tournament_players SET status = 'winner' WHERE tournament_id = $1 AND username = $2`,
      [tournamentId, winner]
    );
  }
}

async function updateTournamentMatchRoom(matchId, roomCode) {
  await pool.query(
    `UPDATE tournament_matches SET room_code = $1, status = 'active', started_at = $2 WHERE id = $3`,
    [roomCode, Date.now(), matchId]
  );
}

// ── EXISTING FUNCTIONS ─────────────────────────────────────────────────

async function getAllUsers() {
  const res = await pool.query('SELECT id, username, role, grade, created, wins, duelGames, soloGames FROM users ORDER BY created DESC');
  return res.rows;
}

async function updateUserRole(username, role) {
  const res = await pool.query('UPDATE users SET role = $1 WHERE LOWER(username) = LOWER($2) RETURNING role', [role, username]);
  return res.rows[0];
}

async function updateGrade(username, grade) {
  const res = await pool.query('UPDATE users SET grade = $1 WHERE LOWER(username) = LOWER($2) RETURNING grade', [grade, username]);
  return res.rows[0];
}

async function createUser(user) {
  const res = await pool.query(`
    INSERT INTO users (username, password, grade, created)
    VALUES ($1, $2, $3, $4) RETURNING id
  `, [user.username, user.password, user.grade || 5, Date.now()]);
  console.log(`[DB] User created: ${user.username} (ID: ${res.rows[0].id})`);
  
  // init ratings table
  await getRatingForGrade(res.rows[0].id, user.grade || 5);
  return res.rows[0].id;
}

async function getRatingForGrade(userId, grade) {
  const res = await pool.query('SELECT * FROM ratings WHERE user_id = $1 AND grade = $2', [userId, grade]);
  if (res.rows.length > 0) return res.rows[0];
  
  const baseRating = 1000 + ((grade - 5) * 200);
  const rd = 350.0;
  const vol = 0.06;
  const now = Date.now();
  await pool.query(
    'INSERT INTO ratings (user_id, grade, rating, rd, volatility, matches_played, updated_at) VALUES ($1, $2, $3, $4, $5, 0, $6)',
    [userId, grade, baseRating, rd, vol, now]
  );
  return { user_id: userId, grade, rating: baseRating, rd, volatility: vol, matches_played: 0, updated_at: now };
}

async function updateRatingForGrade(userId, grade, newRating, newRd, newVol) {
  await pool.query(
    'UPDATE ratings SET rating = $1, rd = $2, volatility = $3, matches_played = matches_played + 1, updated_at = $4 WHERE user_id = $5 AND grade = $6',
    [newRating, newRd, newVol, Date.now(), userId, grade]
  );
}

async function getLeaderboardByGrade(grade) {
  const res = await pool.query(`
    SELECT u.username, u.wins, u.duelGames, u.soloGames, r.rating, r.matches_played 
    FROM ratings r 
    JOIN users u ON r.user_id = u.id 
    WHERE r.grade = $1 
    ORDER BY r.rating DESC 
    LIMIT 100
  `, [grade]);
  return res.rows;
}

async function setDailyChallenge(grade, text, answer) {
  await pool.query(`
    INSERT INTO daily_challenges (grade, text, answer, updated_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (grade) DO UPDATE SET text = EXCLUDED.text, answer = EXCLUDED.answer, updated_at = EXCLUDED.updated_at
  `, [grade, text, answer, Date.now()]);
}

async function getDailyChallenge(grade) {
  const res = await pool.query('SELECT text, answer FROM daily_challenges WHERE grade = $1', [grade]);
  return res.rows[0];
}

// Note: createUser is redefined above, I'll export it at the bottom.
async function getUser(username) {
  const res = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  return res.rows[0];
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

async function getBestResultsPerMode(username) {
  const res = await pool.query(`
    SELECT mode, MAX(score)::int as best_score 
    FROM match_results 
    WHERE LOWER(username) = LOWER($1) 
    GROUP BY mode
  `, [username]);
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
  getMatchHistory,
  getBestResultsPerMode,
  getAllUsers,
  updateUserRole,
  getTournaments,
  createTournament,
  updateTournament,
  deleteTournament,
  joinTournament,
  getTournamentLobby,
  generateTournamentMatches,
  getTournamentMatches,
  updateMatchResult,
  getRatingForGrade,
  updateRatingForGrade,
  getLeaderboardByGrade,
  setDailyChallenge,
  getDailyChallenge,
  updateGrade,
  updateTournamentMatchRoom
};
