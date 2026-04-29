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
      'glicko_vol REAL DEFAULT 0.06',
      'xp INTEGER DEFAULT 0',
      'trophies INTEGER DEFAULT 0'
    ];

    for (const colDef of columns) {
      const colName = colDef.split(' ')[0];
      try {
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${colName} ${colDef.substring(colDef.indexOf(' ')+1)}`);
      } catch (e) {
        console.warn(`[DB] Migration notice (${colName}):`, e.message);
      }
    }
    
    // ── RATING HISTORY TABLE ───────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS rating_history (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        rating REAL NOT NULL,
        mode VARCHAR(50) NOT NULL,
        timestamp BIGINT NOT NULL
      )
    `);
    console.log('[DB] rating_history table initialized');

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
        admin_code  VARCHAR(64),
        is_ranked   BOOLEAN DEFAULT FALSE,
        allowed_grades TEXT DEFAULT '[]',
        start_at    BIGINT,
        winner      VARCHAR(255)
      )
    `);
    // Migrations
    try { await client.query('ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS is_ranked BOOLEAN DEFAULT FALSE'); } catch(e){}
    try { await client.query('ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS allowed_grades TEXT DEFAULT \'[]\''); } catch(e){}
    try { await client.query('ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS start_at BIGINT'); } catch(e){}
    try { await client.query('ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS winner VARCHAR(255)'); } catch(e){}
    try { await client.query('ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS delete_at BIGINT'); } catch(e){}

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
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_challenge_solves (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        grade INTEGER,
        solved_at BIGINT,
        PRIMARY KEY(user_id, grade)
      )
    `);
    console.log('[DB] Daily challenge solves table ready');
    console.log('[DB] Daily challenges table initialized');
    
    // Новая таблица подробной истории (теперь храним в UUID для связи с результатами)
    await client.query(`
      CREATE TABLE IF NOT EXISTS match_turns (
        id             SERIAL PRIMARY KEY,
        match_uuid     VARCHAR(64) NOT NULL,
        turn_num       INTEGER NOT NULL,
        question_text  TEXT,
        p1_username    VARCHAR(255),
        p1_answer      TEXT,
        p2_username    VARCHAR(255),
        p2_answer      TEXT,
        correct_answer TEXT,
        timestamp      BIGINT
      )
    `);
    try { await client.query('ALTER TABLE match_results ADD COLUMN IF NOT EXISTS match_uuid VARCHAR(64)'); } catch(e){}

    // Таблица для турнирного рейтинга (отдельно от дуэльного)
    await client.query(`
      CREATE TABLE IF NOT EXISTS tournament_ratings (
        user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
        grade          INTEGER,
        rating         REAL NOT NULL DEFAULT 1500,
        rd             REAL NOT NULL DEFAULT 350,
        volatility     REAL NOT NULL DEFAULT 0.06,
        matches_played INTEGER DEFAULT 0,
        updated_at     BIGINT,
        PRIMARY KEY(user_id, grade)
      )
    `);
    console.log('[DB] Detailed history and tournament rating tables ready');

  } finally {
    client.release();
  }
}

// ── TOURNAMENT DB FUNCTIONS ──────────────────────────────────────────────

async function createTournament({ name, difficulty = 'easy', isRanked = false, allowed_grades = '[]', start_at = null }) {
  const res = await pool.query(
    `INSERT INTO tournaments (name, type, status, max_players, difficulty, created_at, is_ranked, allowed_grades, start_at)
     VALUES ($1, 'olympic', 'waiting', 8, $2, $3, $4, $5, $6) RETURNING *`,
    [name, difficulty, Date.now(), isRanked, allowed_grades, start_at]
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

async function cancelTournament(tournamentId) {
  await pool.query("UPDATE tournaments SET status = 'cancelled' WHERE id = $1", [tournamentId]);
  await pool.query("UPDATE tournament_matches SET status = 'cancelled' WHERE tournament_id = $1", [tournamentId]);
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
  const players = await getTournamentPlayers(tournamentId);
  const playerCount = players.length;
  if (playerCount < 2) throw new Error('Need at least 2 players');

  // Shuffle players and assign random seeds
  const shuffled = players.sort(() => Math.random() - 0.5);
  for (let i = 0; i < shuffled.length; i++) {
    await pool.query('UPDATE tournament_players SET seed = $1 WHERE id = $2', [i + 1, shuffled[i].id]);
  }
  
  const seedMap = {};
  shuffled.forEach((p, i) => { seedMap[i + 1] = p.username; });
  
  // Dynamic bracket logic for 3-8 players
  // Round 1 size (8 or 4)
  const round1Size = playerCount > 4 ? 8 : (playerCount > 2 ? 4 : 2);
  const matchCount = round1Size / 2;
  
  // Standard seeds for power-of-2 brackets
  const pairs8 = [[1,8],[2,7],[3,6],[4,5]];
  const pairs4 = [[1,4],[2,3]];
  const pairs2 = [[1,2]];
  
  const pairs = round1Size === 8 ? pairs8 : (round1Size === 4 ? pairs4 : pairs2);
  
  for (let i = 0; i < pairs.length; i++) {
    const [s1, s2] = pairs[i];
    const p1 = seedMap[s1] || null;
    const p2 = seedMap[s2] || null;
    let status = 'pending';
    let winner = null;
    
    if (!p1 && !p2) { status = 'finished'; }
    else if (!p1 || !p2) {
      status = 'finished';
      winner = p1 || p2;
    }

    await pool.query(
      `INSERT INTO tournament_matches (tournament_id, round, match_number, player1, player2, status, winner)
       VALUES ($1, 1, $2, $3, $4, $5, $6)`,
      [tournamentId, i + 1, p1, p2, status, winner]
    );
  }
  
  // Create placeholders for next rounds
  if (round1Size >= 4) {
    const r2Matches = round1Size === 8 ? 2 : 1;
    for (let i = 1; i <= r2Matches; i++) {
      await pool.query(`INSERT INTO tournament_matches (tournament_id, round, match_number, status) VALUES ($1, 2, $2, 'waiting')`, [tournamentId, i]);
    }
  }
  if (round1Size === 8) {
    await pool.query(`INSERT INTO tournament_matches (tournament_id, round, match_number, status) VALUES ($1, 3, 1, 'waiting')`, [tournamentId]);
  }

  // Auto-advance byes
  const r1Matches = (await pool.query('SELECT * FROM tournament_matches WHERE tournament_id = $1 AND round = 1', [tournamentId])).rows;
  for (const m of r1Matches) {
    if (m.status === 'finished' && m.winner) {
      await advanceWinner(tournamentId, 1, m.match_number, m.winner);
    }
  }

  await pool.query(`UPDATE tournaments SET status = 'active', started_at = $1 WHERE id = $2`, [Date.now(), tournamentId]);
  return await getTournament(tournamentId);
}

// Helper to advance winner to the next round
async function advanceWinner(tournamentId, currentRound, matchNumber, winner) {
  const matches = await getTournamentMatches(tournamentId);
  const maxRound = Math.max(...matches.map(m => m.round));

  if (currentRound < maxRound) {
    const nextRound = currentRound + 1;
    const nextMatchNumber = Math.ceil(matchNumber / 2);
    const playerSlot = matchNumber % 2 === 1 ? 'player1' : 'player2';
    
    await pool.query(
      `UPDATE tournament_matches SET ${playerSlot} = $1 
       WHERE tournament_id = $2 AND round = $3 AND match_number = $4`,
      [winner, tournamentId, nextRound, nextMatchNumber]
    );

    // Check if next match is now ready
    const res = await pool.query(
      'SELECT player1, player2 FROM tournament_matches WHERE tournament_id = $1 AND round = $2 AND match_number = $3',
      [tournamentId, nextRound, nextMatchNumber]
    );
    const m = res.rows[0];
    if (m && m.player1 && m.player2) {
      await pool.query(
        'UPDATE tournament_matches SET status = \'pending\' WHERE tournament_id = $1 AND round = $2 AND match_number = $3',
        [tournamentId, nextRound, nextMatchNumber]
      );
    }
  } else {
    // Tournament finished!
    await pool.query(
      'UPDATE tournament_players SET status = \'winner\' WHERE tournament_id = $1 AND username = $2',
      [tournamentId, winner]
    );
    await pool.query(
      'UPDATE tournaments SET status = \'finished\', finished_at = $1, winner = $2 WHERE id = $3',
      [Date.now(), winner, tournamentId]
    );
  }
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
  await advanceWinner(match.tournament_id, match.round, match.match_number, winner);
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

async function deleteUser(username) {
  await pool.query('DELETE FROM users WHERE LOWER(username) = LOWER($1)', [username]);
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

async function updateRatingForGrade(userId, grade, newRating, newRd, newVol, isTournament = false) {
  const table = isTournament ? 'tournament_ratings' : 'ratings';
  // Use upsert-like logic or assume row exists (it should be initialized during createUser or getRating)
  await pool.query(
    `UPDATE ${table} SET rating = $1, rd = $2, volatility = $3, matches_played = matches_played + 1, updated_at = $4 WHERE user_id = $5 AND grade = $6`,
    [newRating, newRd, newVol, Date.now(), userId, grade]
  );
}

async function getTournamentRatingForGrade(userId, grade) {
  const res = await pool.query('SELECT * FROM tournament_ratings WHERE user_id = $1 AND grade = $2', [userId, grade]);
  if (res.rows.length > 0) return res.rows[0];
  
  const baseRating = 1000 + ((grade - 5) * 200);
  const rd = 350.0;
  const vol = 0.06;
  const now = Date.now();
  await pool.query(
    'INSERT INTO tournament_ratings (user_id, grade, rating, rd, volatility, matches_played, updated_at) VALUES ($1, $2, $3, $4, $5, 0, $6) ON CONFLICT DO NOTHING',
    [userId, grade, baseRating, rd, vol, now]
  );
  return { user_id: userId, grade, rating: baseRating, rd, volatility: vol, matches_played: 0, updated_at: now };
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
    INSERT INTO daily_challenges_v2 (grade, text, answer, updated_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (grade) DO UPDATE SET text = EXCLUDED.text, answer = EXCLUDED.answer, updated_at = EXCLUDED.updated_at
  `, [grade, text, answer, Date.now()]);
}

async function getDailyChallenge(grade) {
  const res = await pool.query('SELECT text, answer, updated_at FROM daily_challenges_v2 WHERE grade = $1', [grade]);
  return res.rows[0];
}

async function hasUserSolvedChallenge(userId, grade, challengeUpdatedAt) {
  const res = await pool.query(
    'SELECT * FROM daily_challenge_solves WHERE user_id = $1 AND grade = $2 AND solved_at >= $3',
    [userId, grade, challengeUpdatedAt]
  );
  return res.rows.length > 0;
}

async function recordChallengeSolve(userId, grade) {
  await pool.query(`
    INSERT INTO daily_challenge_solves (user_id, grade, solved_at)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, grade) DO UPDATE SET solved_at = EXCLUDED.solved_at
  `, [userId, grade, Date.now()]);
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
  const { username, score, is_win, mode, match_uuid } = data;
  const res = await pool.query(`
    INSERT INTO match_results (username, score, is_win, timestamp, mode, match_uuid)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
  `, [username, score, is_win ? 1 : 0, Date.now(), mode, match_uuid || null]);
  console.log(`[DB] Match result recorded: ${username} (score: ${score}, win: ${is_win}, uuid: ${match_uuid})`);
  return res.rows[0].id;
}

async function recordMatchTurns(matchUuid, turns) {
  if (!turns || !turns.length) return;
  const client = await pool.connect();
  try {
    for (const t of turns) {
      await client.query(`
        INSERT INTO match_turns (match_uuid, turn_num, question_text, p1_username, p1_answer, p2_username, p2_answer, correct_answer, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [matchUuid, t.num, t.question, t.p1User, t.p1Ans, t.p2User, t.p2Ans, t.correctAns, t.ts || Date.now()]);
    }
  } finally { client.release(); }
}

async function getDetailedHistory(username, limit = 100) {
  // Get summaries
  const matchRes = await pool.query(`
    SELECT * FROM match_results 
    WHERE LOWER(username) = LOWER($1) 
    ORDER BY timestamp DESC LIMIT $2
  `, [username, limit]);
  
  const matches = matchRes.rows;
  // For each match with a UUID, fetch turns
  for (const m of matches) {
    if (m.match_uuid) {
      const turnRes = await pool.query(`
        SELECT * FROM match_turns WHERE match_uuid = $1 ORDER BY turn_num ASC
      `, [m.match_uuid]);
      m.turns = turnRes.rows;
    } else {
      m.turns = [];
    }
  }
  return matches;
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

async function recordRatingChange(username, rating, mode) {
  try {
    await pool.query(
      'INSERT INTO rating_history (username, rating, mode, timestamp) VALUES ($1, $2, $3, $4)',
      [username, rating, mode, Date.now()]
    );
  } catch (e) { console.error('[DB] recordRatingChange error:', e.message); }
}

async function getRatingHistory(username, mode = 'duel', limit = 20) {
  try {
    const res = await pool.query(
      'SELECT * FROM rating_history WHERE username = $1 AND mode = $2 ORDER BY timestamp DESC LIMIT $3',
      [username, mode, limit]
    );
    return res.rows.reverse(); // Chronological order
  } catch (e) {
    console.error('[DB] getRatingHistory error:', e.message);
    return [];
  }
}

async function recordRatingChange(username, rating, mode) {
  try {
    await pool.query(
      'INSERT INTO rating_history (username, rating, mode, timestamp) VALUES ($1, $2, $3, $4)',
      [username, rating, mode, Date.now()]
    );
  } catch (e) { console.error('[DB] recordRatingChange error:', e.message); }
}

async function getRatingHistory(username, mode = 'duel', limit = 20) {
  try {
    const res = await pool.query(
      'SELECT * FROM rating_history WHERE username = $1 AND mode = $2 ORDER BY timestamp DESC LIMIT $3',
      [username, mode, limit]
    );
    return res.rows.reverse(); // Chronological order
  } catch (e) {
    console.error('[DB] getRatingHistory error:', e.message);
    return [];
  }
}

module.exports = {
  recordRatingChange,
  getRatingHistory,
  pool,
  initDB,
  createTournament,
  getTournament,
  listTournaments,
  joinTournament,
  getTournamentPlayers,
  startTournament,
  cancelTournament,
  getTournamentMatches,
  recordTournamentMatchResult,
  updateTournamentMatchRoom,
  getAllUsers,
  updateUserRole,
  deleteUser,
  updateGrade,
  createUser,
  getRatingForGrade,
  updateRatingForGrade,
  getLeaderboardByGrade,
  setDailyChallenge,
  getDailyChallenge,
  hasUserSolvedChallenge,
  recordChallengeSolve,
  getUser,
  updateUserStats,
  getLeaderboard,
  recordMatchResult,
  getMatchHistory,
  getBestResultsPerMode,
  recordMatchTurns,
  getDetailedHistory,
  getTournamentRatingForGrade
};
