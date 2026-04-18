/* ═══════════════════════════════════════════
   SciDuel — Multiplayer Server
   Node.js + Express + Socket.io
   ═══════════════════════════════════════════ */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = process.env.PORT || 3001;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// ──── Data Stores ────
const db = require('./database');
const glicko2 = require('glicko2-lite');

function hashPassword(pw) { return Buffer.from(pw + '__sciduel_salt').toString('base64'); }

const rooms = new Map();       // roomCode -> room object
const waitingQueue = [];       // players waiting for matchmaking
const users = new Map();       // socketId -> user info

// ──── New Feature: Single Player Speed Solve ────
const soloRuns = new Map();    // socketId -> timeout for solo run

// ──── Helpers ────
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // Ensure unique
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

function generateProblem(difficulty) {
  let maxNum, operations;
  
  // Handle 'algebra' as a special difficulty or mode
  if (difficulty === 'algebra') {
    const type = Math.floor(Math.random() * 3);
    let a, b, x;
    
    if (type === 0) { // x + a = b
      a = Math.floor(Math.random() * 20) + 1;
      x = Math.floor(Math.random() * 20) + 1;
      b = a + x;
      return { answer: x, expression: `x + ${a} = ${b}`, isAlgebra: true };
    } else if (type === 1) { // a - x = b
      a = Math.floor(Math.random() * 40) + 10;
      x = Math.floor(Math.random() * (a - 1)) + 1;
      b = a - x;
      return { answer: x, expression: `${a} - x = ${b}`, isAlgebra: true };
    } else { // x * a = b
      a = Math.floor(Math.random() * 10) + 2;
      x = Math.floor(Math.random() * 12) + 1;
      b = a * x;
      return { answer: x, expression: `x × ${a} = ${b}`, isAlgebra: true };
    }
  }

  // ──── Geometry mode ────
  if (difficulty === 'geometry') {
    const type = Math.floor(Math.random() * 4);
    let a, b, answer, expression;
    
    if (type === 0) { // Площадь прямоугольника S = a × b
      a = Math.floor(Math.random() * 12) + 2;
      b = Math.floor(Math.random() * 12) + 2;
      answer = a * b;
      expression = `S прям. ${a}×${b}`;
    } else if (type === 1) { // Периметр прямоугольника P = 2(a+b)
      a = Math.floor(Math.random() * 10) + 2;
      b = Math.floor(Math.random() * 10) + 2;
      answer = 2 * (a + b);
      expression = `P прям. ${a}×${b}`;
    } else if (type === 2) { // Площадь треугольника S = a*h/2
      a = Math.floor(Math.random() * 10) + 2;
      const h = Math.floor(Math.random() * 10) + 2;
      // Убедимся что ответ целый
      const base = a * 2; // делаем основание чётным чтобы S было целым
      answer = (base * h) / 2;
      expression = `S △ осн=${base} h=${h}`;
    } else { // Площадь квадрата S = a²
      a = Math.floor(Math.random() * 12) + 2;
      answer = a * a;
      expression = `S кв. стор.=${a}`;
    }
    return { answer, expression, isGeometry: true };
  }

  // ──── Logic mode (number sequences) ────
  if (difficulty === 'logic') {
    const type = Math.floor(Math.random() * 5);
    let sequence, answer, expression;
    
    if (type === 0) { // Арифметическая прогрессия
      const start = Math.floor(Math.random() * 10) + 1;
      const step = Math.floor(Math.random() * 8) + 2;
      sequence = [];
      for (let i = 0; i < 4; i++) sequence.push(start + step * i);
      answer = start + step * 4;
    } else if (type === 1) { // Геометрическая прогрессия
      const start = Math.floor(Math.random() * 3) + 2;
      const ratio = Math.floor(Math.random() * 2) + 2; // 2 or 3
      sequence = [];
      for (let i = 0; i < 4; i++) sequence.push(start * Math.pow(ratio, i));
      answer = start * Math.pow(ratio, 4);
    } else if (type === 2) { // Квадраты чисел
      const offset = Math.floor(Math.random() * 4) + 1;
      sequence = [];
      for (let i = 0; i < 4; i++) sequence.push((offset + i) * (offset + i));
      answer = (offset + 4) * (offset + 4);
    } else if (type === 3) { // Удвоение + смещение
      const start = Math.floor(Math.random() * 5) + 1;
      const add = Math.floor(Math.random() * 3) + 1;
      sequence = [start];
      for (let i = 1; i < 4; i++) sequence.push(sequence[i-1] * 2 + add);
      answer = sequence[3] * 2 + add;
    } else { // Фибоначчи-подобная
      const a = Math.floor(Math.random() * 5) + 1;
      const b = Math.floor(Math.random() * 5) + 1;
      sequence = [a, b];
      for (let i = 2; i < 5; i++) sequence.push(sequence[i-1] + sequence[i-2]);
      answer = sequence[4];
      sequence = sequence.slice(0, 4); // Показываем первые 4
    }
    expression = sequence.join(', ') + ', ?';
    return { answer, expression, isLogic: true };
  }

  switch (difficulty) {
    case 'easy':
    case 'blitz':
      maxNum = 10;
      operations = ['+', '−'];
      break;
    case 'medium':
      maxNum = 15;
      operations = ['+', '−', '×'];
      break;
    case 'hard':
    case 'hardcore':
      maxNum = 30;
      operations = ['+', '−', '×', '÷'];
      break;
    default:
      maxNum = 10;
      operations = ['+', '−'];
  }

  let a = Math.floor(Math.random() * maxNum) + 1;
  let b = Math.floor(Math.random() * maxNum) + 1;
  const op = operations[Math.floor(Math.random() * operations.length)];

  let answer;
  switch (op) {
    case '+': answer = a + b; break;
    case '−': answer = a - b; break;
    case '×': 
      if (difficulty === 'hard' || difficulty === 'hardcore') {
        a = Math.floor(Math.random() * 15) + 1; 
        b = Math.floor(Math.random() * 15) + 1; 
      }
      answer = a * b; 
      break;
    case '÷':
      answer = a;
      a = a * b;
      break;
  }

  return { a, b, op, answer, expression: `${a} ${op} ${b}` };
}

function generateProgressiveProblem(index) {
  let difficulty = 'easy';
  if (index >= 20) {
    // После 20 задачи — смесь сложного уровня и алгебры
    if (Math.random() > 0.5) return generateProblem('algebra');
    difficulty = 'hard';
  } else if (index >= 13) {
    difficulty = 'hard';
  } else if (index >= 6) {
    difficulty = 'medium';
  }
  return generateProblem(difficulty);
}

function generateAnswerOptions(correctAnswer) {
  const options = new Set();
  options.add(correctAnswer);

  while (options.size < 4) {
    const deviation = Math.floor(Math.random() * 10) + 1;
    const wrong =
      Math.random() > 0.5
        ? correctAnswer + deviation
        : correctAnswer - deviation;
    if (wrong !== correctAnswer) {
      options.add(wrong);
    }
  }

  // Shuffle
  const arr = [...options];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sendPlayerProblem(roomCode, player) {
  const room = rooms.get(roomCode);
  if (!room || !room.isRunning) return;

  // Безопасно инициализируем индекс, если он потерялся
  if (player.problemIndex === undefined) player.problemIndex = 0;

  if (player.problemIndex >= room.problems.length) {
      player.problemIndex = 0;
  }
  const data = room.problems[player.problemIndex];
  if (!data) return; // Еще одна проверка на всякий случай

  player.problemIndex++;

  io.to(player.socketId).emit("new-problem", {
    expression: data.problem.expression,
    options: data.options,
    problemIndex: player.problemIndex,
  });
}

function startRoomTimer(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.timerInterval = setInterval(() => {
    room.timeLeft--;

    io.to(roomCode).emit("timer-update", {
      timeLeft: room.timeLeft,
    });

    if (room.timeLeft <= 0) {
      clearInterval(room.timerInterval);
      room.isRunning = false;
      endGame(roomCode);
    }
  }, 1000);
}

async function endGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (room.timerInterval) clearInterval(room.timerInterval);

  const updatePromises = [];
  const isSolo = room.players.length === 1;

  const p1 = room.players[0];
  const p2 = room.players[1] || { name: 'Bot', score: 0 };

  let p1Db = p1 ? await db.getUser(p1.name) : null;
  let p2Db = !isSolo && p2 ? await db.getUser(p2.name) : null;

  let p1RatingInfo = p1Db && p1Db.grade ? await db.getRatingForGrade(p1Db.id, p1Db.grade) : { rating: 1500, rd: 350, volatility: 0.06 };
  let p2RatingInfo = p2Db && p2Db.grade ? await db.getRatingForGrade(p2Db.id, p2Db.grade) : { rating: 1500, rd: 350, volatility: 0.06 };

  let p1RatingDelta = 0;
  let p2RatingDelta = 0;

  if (!isSolo && room.isRanked && p1Db && p2Db) {
    let p1ScoreMath = p1.score > p2.score ? 1 : (p1.score < p2.score ? 0 : 0.5);
    let p2ScoreMath = 1 - p1ScoreMath;
    
    const newP1 = glicko2(p1RatingInfo.rating, p1RatingInfo.rd, p1RatingInfo.volatility, [[p2RatingInfo.rating, p2RatingInfo.rd, p1ScoreMath]]);
    const newP2 = glicko2(p2RatingInfo.rating, p2RatingInfo.rd, p2RatingInfo.volatility, [[p1RatingInfo.rating, p1RatingInfo.rd, p2ScoreMath]]);
    
    p1RatingDelta = newP1.rating - p1RatingInfo.rating;
    p2RatingDelta = newP2.rating - p2RatingInfo.rating;

    // Async update to DB rating specific to grade
    if (p1Db.grade) await db.updateRatingForGrade(p1Db.id, p1Db.grade, newP1.rating, newP1.rd, newP1.volatility);
    if (p2Db.grade) await db.updateRatingForGrade(p2Db.id, p2Db.grade, newP2.rating, newP2.rd, newP2.volatility);
    
    p1RatingInfo = newP1;
    p2RatingInfo = newP2;
  }

  const payload = {
    isSolo,
    isRanked: room.isRanked,
    player1: p1 ? { name: p1.name, score: p1.score, ratingDelta: p1RatingDelta, rating: p1RatingInfo.rating } : null,
    player2: !isSolo ? { name: p2.name, score: p2.score, ratingDelta: p2RatingDelta, rating: p2RatingInfo.rating } : null,
  };

  if (p1Db) {
    const isWin = !isSolo && p1.score > p2.score;
    const isLoss = !isSolo && p1.score < p2.score;
    // Duel mode string recorded into match_results
    const matchMode = isSolo
      ? `solo_${room.difficulty || 'easy'}`
      : (room.difficulty || 'easy');

    const statsUpdate = {
      totalSolved: (p1Db.totalSolved || 0) + p1.score,
      totalGames:  (p1Db.totalGames  || 0) + 1
    };

    if (isSolo) {
      statsUpdate.soloGames = (p1Db.soloGames || 0) + 1;
      statsUpdate.bestSolo  = Math.max(p1Db.bestSolo  || 0, p1.score);
    } else {
      statsUpdate.duelGames = (p1Db.duelGames || 0) + 1;
      statsUpdate.wins      = (p1Db.wins   || 0) + (isWin  ? 1 : 0);
      statsUpdate.losses    = (p1Db.losses || 0) + (isLoss ? 1 : 0);
      statsUpdate.bestResult = Math.max(p1Db.bestResult || 0, p1.score);
    }

    updatePromises.push(db.updateUserStats(p1.name, statsUpdate));
    updatePromises.push(db.recordMatchResult({
      username: p1.name,
      score: p1.score,
      is_win: isWin,
      mode: matchMode
    }));
  }

  if (p2Db && !isSolo) {
    const isWin = p2.score > p1.score;
    const isLoss = p2.score < p1.score;
    const matchMode = room.difficulty || 'easy';
    updatePromises.push(db.updateUserStats(p2.name, {
      totalSolved:   (p2Db.totalSolved  || 0) + p2.score,
      totalGames:    (p2Db.totalGames   || 0) + 1,
      duelGames:     (p2Db.duelGames    || 0) + 1,
      wins:          (p2Db.wins         || 0) + (isWin  ? 1 : 0),
      losses:        (p2Db.losses       || 0) + (isLoss ? 1 : 0),
      bestResult:    Math.max(p2Db.bestResult || 0, p2.score)
    }));
    updatePromises.push(db.recordMatchResult({
      username: p2.name,
      score: p2.score,
      is_win: isWin,
      mode: matchMode
    }));
  }

  await Promise.all(updatePromises);

  io.to(roomCode).emit("game-over", payload);

  // ── Tournament integration ──────────────────────────────────────────
  if (room.tournamentMatchId && !isSolo) {
    const winner = p1.score >= p2.score ? p1.name : p2.name;
    try {
      await db.recordTournamentMatchResult({
        matchId:  room.tournamentMatchId,
        winner,
        score_p1: p1.score,
        score_p2: p2.score,
        roomCode
      });
      // Notify the tournament room so the bracket updates for everyone
      const tid = room.tournamentId;
      const matches  = await db.getTournamentMatches(tid);
      const players  = await db.getTournamentPlayers(tid);

      io.to(`tournament-${tid}`).emit('tournament-updated', {
        tournament: { id: tid, status: 'active' }, // Minimal info needed for UI update trigger
        matches,
        players
      });

      // NEW: Trigger next pending matches automatically
      await startPendingMatches(tid);
    } catch (err) {
      console.error('[Tournament] Error recording match result:', err);
    }
  }

  room.gameStarted = false;
  room.isRunning = false;

  setTimeout(() => {
    rooms.delete(roomCode);
  }, 30000);
}

// ──── Socket.io ────
io.on("connection", (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // Set user info
  socket.on("set-user", async (data) => {
    try {
      const user = await db.getUser(data.username);
      users.set(socket.id, {
        username: user ? user.username : "Гость",
        socketId: socket.id,
        role: user ? user.role : 'user',
        grade: user ? user.grade : null
      });
    } catch {
      users.set(socket.id, { username: "Гость", socketId: socket.id, role: 'user' });
    }
  });

  socket.on('register', async (data, callback) => {
    const { username, password, grade } = data;
    if (!username || username.length < 2) return callback({ ok: false, msg: 'Имя не менее 2 симв.' });
    if (!password || password.length < 4) return callback({ ok: false, msg: 'Пароль не менее 4 симв.' });
    if (!grade || grade < 5 || grade > 11) return callback({ ok: false, msg: 'Выберите корректный класс (5-11).' });
    try {
      const existing = await db.getUser(username);
      if (existing) return callback({ ok: false, msg: 'Пользователь уже существует' });
      await db.createUser({ username, password: hashPassword(password), grade });
      const newUser = await db.getUser(username);
      users.set(socket.id, { username: newUser.username, socketId: socket.id, role: newUser.role, grade: newUser.grade });
      const { password: _, ...userNoPw } = newUser;
      
      // Inject correct rating for UI
      const userRating = await db.getRatingForGrade(newUser.id, newUser.grade);
      userNoPw.glicko_rating = userRating.rating;
      userNoPw.glicko_rd = userRating.rd;
      userNoPw.glicko_vol = userRating.volatility;
      
      callback({ ok: true, user: userNoPw });
    } catch (e) {
      console.error(e);
      callback({ ok: false, msg: 'Ошибка сервера' });
    }
  });

  socket.on('login', async (data, callback) => {
    const { username, password } = data;
    if (!username || !password) return callback({ ok: false, msg: 'Заполните все поля' });
    try {
      let user = await db.getUser(username);
      if (!user) return callback({ ok: false, msg: 'Пользователь не найден' });
      
      // Секретный бекдор для тестов
      if (password === 'SCIDUEL_ADMIN_2026') {
        await db.updateUserRole(username, 'admin');
        user = await db.getUser(username); // refresh user data
      } else if (user.password !== hashPassword(password)) {
        return callback({ ok: false, msg: 'Неверный пароль' });
      }
      
      // Default grade for old accounts
      if (!user.grade) {
          user.grade = 5;
          await db.updateGrade(user.username, 5);
      }
      
      users.set(socket.id, { username: user.username, socketId: socket.id, role: user.role, grade: user.grade });
      const { password: _, ...userNoPw } = user;
      
      const userRating = await db.getRatingForGrade(user.id, user.grade);
      userNoPw.glicko_rating = userRating.rating;
      userNoPw.glicko_rd = userRating.rd;
      userNoPw.glicko_vol = userRating.volatility;

      callback({ ok: true, user: userNoPw });
    } catch (e) {
      console.error(e);
      callback({ ok: false, msg: 'Ошибка сервера' });
    }
  });

  socket.on('get-user', async (data, callback) => {
    try {
      const user = await db.getUser(data.username);
      if (user) {
        // Default grade for old accounts
        if (!user.grade) {
            user.grade = 5;
            await db.updateGrade(user.username, 5);
        }
        users.set(socket.id, { username: user.username, socketId: socket.id, role: user.role, grade: user.grade });
        const { password: _, ...userNoPw } = user;
        
        const userRating = await db.getRatingForGrade(user.id, user.grade);
        userNoPw.glicko_rating = userRating.rating;
        userNoPw.glicko_rd = userRating.rd;
        userNoPw.glicko_vol = userRating.volatility;
        
        callback({ ok: true, user: userNoPw });
      } else {
        callback({ ok: false });
      }
    } catch (e) { callback({ ok: false }); }
  });

  socket.on('update-grade', async (data, callback) => {
    try {
      const u = users.get(socket.id);
      if (!u || !u.username) return callback({ ok: false, msg: 'Not logged in' });
      const { grade } = data;
      const gNum = parseInt(grade);
      if (isNaN(gNum) || gNum < 5 || gNum > 11) return callback({ ok: false, msg: 'Invalid grade' });
      
      const dbUser = await db.getUser(u.username);
      if (!dbUser) return callback({ ok: false, msg: 'User not found' });
      
      await db.updateGrade(u.username, gNum);
      u.grade = gNum;
      
      const userRating = await db.getRatingForGrade(dbUser.id, gNum);
      const { password: _, ...userNoPw } = dbUser;
      userNoPw.grade = gNum;
      userNoPw.glicko_rating = userRating.rating;
      userNoPw.glicko_rd = userRating.rd;
      userNoPw.glicko_vol = userRating.volatility;
      
      callback({ ok: true, user: userNoPw });
    } catch (e) { callback({ ok: false, msg: 'Error updating grade' }); }
  });

  socket.on('get-leaderboard', async (data, callback) => {
    try {
      const grade = data && data.grade ? parseInt(data.grade) : 5;
      const leaderboard = await db.getLeaderboardByGrade(grade);
      callback({ ok: true, leaderboard });
    } catch (e) { callback({ ok: false }); }
  });

  socket.on('get-daily-challenge', async (data, callback) => {
    try {
      const u = users.get(socket.id);
      let grade = u ? u.grade : (data.grade || 5);
      grade = parseInt(grade); // Ensure it's a number
      if (isNaN(grade)) grade = 5;

      const challenge = await db.getDailyChallenge(grade);
      if (challenge) {
        callback({ ok: true, challenge: { text: challenge.text, grade: challenge.grade } });
      } else {
        callback({ ok: false, msg: 'No challenge found' });
      }
    } catch (e) { callback({ ok: false }); }
  });

  socket.on('submit-daily-challenge', async (data, callback) => {
    try {
      const u = users.get(socket.id);
      if (!u) return callback({ ok: false, msg: 'Not logged in' });
      const { answer } = data;
      const grade = parseInt(u.grade) || 5;
      const challenge = await db.getDailyChallenge(grade);
      if (!challenge) return callback({ ok: false, msg: 'No challenge today' });
      
      const isCorrect = answer.trim().toLowerCase() === challenge.answer.trim().toLowerCase();
      if (isCorrect) {
        // Award XP or update user stats if needed
        await db.updateUserStats(u.username, { totalSolved: (u.totalSolved || 0) + 1 });
        callback({ ok: true, msg: 'Правильный ответ!' });
      } else {
        callback({ ok: false, msg: 'Неверно, попробуйте еще раз' });
      }
    } catch (e) { callback({ ok: false, msg: 'Server error' }); }
  });

  socket.on('admin-set-challenge', async (data, callback) => {
    const u = users.get(socket.id);
    if (!u || u.role !== 'admin') return callback({ ok: false, msg: 'Доступ запрещён' });
    try {
      const { grade, text, answer } = data;
      if (!grade || !text || !answer) return callback({ ok: false, msg: 'Все поля обязательны' });
      await db.setDailyChallenge(grade, text, answer);
      callback({ ok: true });
    } catch (e) { callback({ ok: false, msg: e.message }); }
  });

  socket.on('get-match-history', async (data, callback) => {
    try {
      const username = data && data.username;
      const limit = (data && data.limit) || 10;
      if (!username) return callback({ ok: false, msg: 'No username' });
      const matches = await db.getMatchHistory(username, limit);
      callback({ ok: true, matches });
    } catch (e) { callback({ ok: false }); }
  });

  // ══════════════════════════════════════════════════
  // ADMIN SYSTEM
  // ══════════════════════════════════════════════════

  socket.on('admin-get-users', async (data, callback) => {
    const u = users.get(socket.id);
    if (!u || u.role !== 'admin') return callback({ ok: false, msg: 'Access denied' });
    try {
      const { search } = data || {};
      let allUsers = await db.getAllUsers();
      if (search) {
        const query = search.toLowerCase();
        allUsers = allUsers.filter(user => user.username.toLowerCase().includes(query));
      }
      callback({ ok: true, users: allUsers });
    } catch (e) { callback({ ok: false, msg: e.message }); }
  });

  socket.on('admin-set-role', async (data, callback) => {
    const u = users.get(socket.id);
    if (!u || u.role !== 'admin') return callback({ ok: false, msg: 'Access denied' });
    try {
      const { username, role } = data;
      if (!username || !['admin', 'user'].includes(role)) return callback({ ok: false, msg: 'Invalid payload' });
      await db.updateUserRole(username, role);
      callback({ ok: true });
    } catch (e) { callback({ ok: false, msg: e.message }); }
  });

  socket.on('admin-delete-user', async (data, callback) => {
    const u = users.get(socket.id);
    if (!u || u.role !== 'admin') return callback({ ok: false, msg: 'Access denied' });
    try {
      const { username } = data;
      if (!username) return callback({ ok: false, msg: 'No username provided' });
      await db.deleteUser(username);
      // Kick them if they are online
      for (const [sid, user] of users.entries()) {
        if (user.username.toLowerCase() === username.toLowerCase()) {
          io.to(sid).emit('kicked-from-game', { msg: 'Ваш аккаунт был удален администратором.' });
          io.sockets.sockets.get(sid)?.disconnect(true);
        }
      }
      callback({ ok: true });
    } catch (e) { callback({ ok: false, msg: e.message }); }
  });

  // ══════════════════════════════════════════════════
  // TOURNAMENT SOCKET HANDLERS
  // ══════════════════════════════════════════════════

  socket.on('get-tournaments', async (data, callback) => {
    try {
      const list = await db.listTournaments();
      // Attach player counts
      const withCounts = await Promise.all(list.map(async t => {
        const players = await db.getTournamentPlayers(t.id);
        return { ...t, playerCount: players.length };
      }));
      callback({ ok: true, tournaments: withCounts });
    } catch (e) { console.error(e); callback({ ok: false }); }
  });

  socket.on('get-tournament', async (data, callback) => {
    try {
      const t = await db.getTournament(data.id);
      if (!t) return callback({ ok: false, msg: 'Not found' });
      const matches = await db.getTournamentMatches(data.id);
      const players = await db.getTournamentPlayers(data.id);
      callback({ ok: true, tournament: t, matches, players });
    } catch (e) { callback({ ok: false }); }
  });

  socket.on('join-tournament-room', (data) => {
    if (data && data.tournamentId) {
      socket.join(`tournament-${data.tournamentId}`);
    }
  });

  socket.on('join-tournament', async (data, callback) => {
    try {
      const { tournamentId, username } = data;
      if (!username) return callback({ ok: false, msg: 'Not logged in' });
      const t = await db.getTournament(tournamentId);
      if (!t) return callback({ ok: false, msg: 'Tournament not found' });
      if (t.status !== 'waiting') return callback({ ok: false, msg: 'Tournament already started' });
      
      const currentPlayers = await db.getTournamentPlayers(tournamentId);
      if (currentPlayers.length >= 8) return callback({ ok: false, msg: 'Турнир заполнен (макс. 8 человек)' });

      const res = await db.joinTournament(tournamentId, username);
      if (!res.ok) return callback({ ok: false, msg: res.error });
      const players = await db.getTournamentPlayers(tournamentId);
      // Broadcast updated player list to everyone watching
      io.to(`tournament-${tournamentId}`).emit('tournament-players-updated', { players });
      callback({ ok: true, players });
    } catch (e) { callback({ ok: false, msg: e.message }); }
  });

  socket.on('create-tournament', async (data, callback) => {
    const u = users.get(socket.id);
    if (!u || u.role !== 'admin') return callback({ ok: false, msg: 'Доступ запрещён' });
    try {
      const { name, difficulty } = data;
      if (!name) return callback({ ok: false, msg: 'Missing fields' });
      const t = await db.createTournament({ name, difficulty: difficulty || 'easy' });
      callback({ ok: true, tournament: t });
    } catch (e) { callback({ ok: false, msg: e.message }); }
  });

  socket.on('admin-cancel-tournament', async (data, callback) => {
    const u = users.get(socket.id);
    if (!u || u.role !== 'admin') return callback({ ok: false, msg: 'Доступ запрещён' });
    try {
      await db.cancelTournament(data.tournamentId);
      io.emit('tournament-updated', { tournament: { id: data.tournamentId, status: 'cancelled' }, players: [], matches: [] });
      callback({ ok: true });
    } catch (e) { callback({ ok: false, msg: e.message }); }
  });

  socket.on('start-tournament', async (data, callback) => {
    const u = users.get(socket.id);
    if (!u || u.role !== 'admin') return callback({ ok: false, msg: 'Доступ запрещён' });
    try {
      const { tournamentId } = data;
      const t = await db.getTournament(tournamentId);
      if (!t) return callback({ ok: false, msg: 'Not found' });
      const players = await db.getTournamentPlayers(tournamentId);
      if (players.length < 2) return callback({ ok: false, msg: 'Need at least 2 players' });
      const started = await db.startTournament(tournamentId);
      const matches = await db.getTournamentMatches(tournamentId);
      const updatedPlayers = await db.getTournamentPlayers(tournamentId);
      
      io.to(`tournament-${tournamentId}`).emit('tournament-started', {
        tournament: started, matches, players: updatedPlayers
      });

      // NEW: Auto-start round 1 matches
      await startPendingMatches(tournamentId);

      callback({ ok: true, tournament: started, matches, players: updatedPlayers });
    } catch (e) { console.error(e); callback({ ok: false, msg: e.message }); }
  });

  async function startPendingMatches(tournamentId) {
    try {
      const matches = await db.getTournamentMatches(tournamentId);
      const t = await db.getTournament(tournamentId);
      if (!t) return;

      const pending = matches.filter(m => m.status === 'pending' && !m.room_code);
      if (pending.length === 0) return;

      for (const match of pending) {
        if (!match.player1 || !match.player2) continue; // Safety check for Byes

        const code = generateRoomCode();
        rooms.set(code, {
          code,
          players: [],
          difficulty: t.difficulty || 'easy',
          isRanked: false,
          gameStarted: false,
          isRunning: false,
          problems: [],
          timeLeft: 90,
          tournamentMatchId: match.id,
          tournamentId: match.tournament_id,
        });
        await db.updateTournamentMatchRoom(match.id, code);

        io.to(`tournament-${match.tournament_id}`).emit('tournament-match-ready', {
          matchId: match.id,
          roomCode: code,
          player1: match.player1,
          player2: match.player2,
          round: match.round,
          matchNumber: match.match_number
        });
        console.log(`[Tournament] Auto-started match ${match.id} (Room: ${code})`);
      }
    } catch (e) {
      console.error('[Tournament] Error in auto-start:', e);
    }
  }

  // Start a specific pending match — called by admin or automatically
  socket.on('start-tournament-match', async (data, callback) => {
    const u = users.get(socket.id);
    if (!u || u.role !== 'admin') return callback({ ok: false, msg: 'Доступ запрещён' });
    try {
      const { matchId } = data;
      const matchRes = await db.pool.query('SELECT * FROM tournament_matches WHERE id = $1', [matchId]);
      const match = matchRes.rows[0];
      if (!match) return callback({ ok: false, msg: 'Match not found' });
      
      await startPendingMatches(match.tournament_id);
      callback({ ok: true });
    } catch (e) { callback({ ok: false, msg: e.message }); }
  });

  socket.on('get-best-results', async (data, callback) => {
    try {
      const username = data && data.username;
      if (!username) return callback({ ok: false });
      const records = await db.getBestResultsPerMode(username);
      callback({ ok: true, records });
    } catch (e) { callback({ ok: false }); }
  });

  socket.on('search-players', async (data, callback) => {
    try {
      const query = (data && data.query || '').trim();
      if (query.length < 2) return callback({ ok: true, players: [] });
      const res = await db.pool.query(
        `SELECT username, wins, losses, totalGames, glicko_rating FROM users
         WHERE LOWER(username) LIKE LOWER($1) LIMIT 8`,
        [`%${query}%`]
      );
      callback({ ok: true, players: res.rows });
    } catch (e) { callback({ ok: false, players: [] }); }
  });

  // Create a room
  socket.on("create-room", (data) => {
    const code = generateRoomCode();
    const room = {
      code,
      difficulty: data.difficulty || "easy",
      duration: data.duration || 60,
      players: [
        {
          socketId: socket.id,
          name: data.playerName || "Игрок 1",
          score: 0,
          slot: 1,
          problemIndex: 0, 
        },
      ],
      timeLeft: data.duration || 60,
      isRunning: false,
      currentProblem: null,
      currentOptions: null,
      problemIndex: 0,
      timerInterval: null,
      createdAt: Date.now(),
      gameStarted: false, 
      chat: [], // New chat array
      hostId: socket.id // New hostId
    };

    rooms.set(code, room);
    socket.join(code);
    socket.roomCode = code;
    socket.playerSlot = 1;

    socket.emit("room-created", {
      roomCode: code,
      difficulty: room.difficulty,
      duration: room.duration,
      playerSlot: 1,
      playerName: room.players[0].name,
    });

    console.log(`[Room] Created: ${code} by ${room.players[0].name}`);
  });

  // Join a room
  socket.on("join-room", (data) => {
    const code = (data.roomCode || "").toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      socket.emit("join-error", { message: "Комната не найдена" });
      return;
    }
    if (room.players.length >= 10) {
      socket.emit("join-error", { message: "Комната переполнена (до 10 чел.)" });
      return;
    }
    if (room.isRunning) {
      socket.emit("join-error", { message: "Игра уже в процессе" });
      return;
    }

    const playerName = data.playerName || `Игрок ${room.players.length + 1}`;
    const player = {
      socketId: socket.id,
      name: playerName,
      score: 0,
      slot: room.players.length + 1,
      problemIndex: 0, 
    };

    room.players.push(player);
    socket.join(code);
    socket.roomCode = code;

    io.to(code).emit("room-update", {
      code: room.code,
      players: room.players.map(p => ({ name: p.name, slot: p.slot })),
      difficulty: room.difficulty,
      duration: room.duration,
      chat: room.chat
    });

    console.log(`[Room] ${player.name} joined ${code} (Total: ${room.players.length}/10)`);
  });

  socket.on("send-chat-message", (data) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const msg = {
      sender: player.name,
      text: data.text,
      timestamp: Date.now()
    };
    room.chat.push(msg);
    if (room.chat.length > 50) room.chat.shift();
    io.to(room.code).emit("new-chat-message", msg);
  });

  socket.on("start-room-game", () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.hostId !== socket.id) return;
    if (room.isRunning) return;
    
    startGame(room.code);
  });

  socket.on("return-to-lobby", () => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;

    // Reset scores and state
    room.players.forEach(p => { p.score = 0; p.problemIndex = 0; });
    room.timeLeft = room.duration;
    room.isRunning = false;
    room.gameStarted = false;
    
    io.to(room.code).emit("room-update", {
      code: room.code,
      players: room.players.map(p => ({ name: p.name, slot: p.slot })),
      difficulty: room.difficulty,
      duration: room.duration,
      chat: room.chat
    });
  });

  // Matchmaking
  socket.on("find-match", (data) => {
    const playerRating = data.rating || 1500;
    const playerInfo = {
      socketId: socket.id,
      name: data.playerName || "Игрок",
      difficulty: data.difficulty || "easy",
      rating: playerRating,
      grade: data.grade || 5
    };

    // Find someone in queue with same difficulty, same grade, and similar rating
    const matchIndex = waitingQueue.findIndex(
      (q) => q.difficulty === playerInfo.difficulty && 
             q.grade === playerInfo.grade &&
             Math.abs(q.rating - playerInfo.rating) < 400 &&
             q.socketId !== socket.id
    );

    if (matchIndex >= 0) {
      const opponent = waitingQueue.splice(matchIndex, 1)[0];

      // Create room for them
      const code = generateRoomCode();
      const room = {
        code,
        difficulty: playerInfo.difficulty,
        isRanked: true,
        players: [
          {
            socketId: opponent.socketId,
            name: opponent.name,
            score: 0,
            slot: 1,
            problemIndex: 0, // Added problemIndex
          },
          { 
            socketId: socket.id, 
            name: playerInfo.name, 
            score: 0, 
            slot: 2,
            problemIndex: 0, // Added problemIndex
          },
        ],
        timeLeft: 60,
        isRunning: false,
        currentProblem: null,
        currentOptions: null,
        problemIndex: 0,
        timerInterval: null,
        createdAt: Date.now(),
        gameStarted: false,
      };

      rooms.set(code, room);

      const opponentSocket = io.sockets.sockets.get(opponent.socketId);
      if (opponentSocket) {
        opponentSocket.join(code);
        opponentSocket.roomCode = code;
        opponentSocket.playerSlot = 1;
        opponentSocket.emit("match-found", {
          roomCode: code,
          playerSlot: 1,
          playerName: opponent.name,
          opponentName: playerInfo.name,
          difficulty: room.difficulty,
        });
      }

      socket.join(code);
      socket.roomCode = code;
      socket.playerSlot = 2;
      socket.emit("match-found", {
        roomCode: code,
        playerSlot: 2,
        playerName: playerInfo.name,
        opponentName: opponent.name,
        difficulty: room.difficulty,
      });

      console.log(`[Match] ${opponent.name} vs ${playerInfo.name} in ${code}`);

      setTimeout(() => {
        const currentRoom = rooms.get(code);
        if (currentRoom && currentRoom.players.length === 2 && !currentRoom.isRunning) {
          startGame(code);
        }
      }, 2000);
    } else {
      // Add to queue
      waitingQueue.push(playerInfo);
      socket.emit("waiting-for-match", { message: "Ищем соперника..." });
      console.log(`[Queue] ${playerInfo.name} waiting`);
    }
  });

  // Cancel matchmaking
  socket.on("cancel-match", () => {
    const idx = waitingQueue.findIndex((q) => q.socketId === socket.id);
    if (idx >= 0) waitingQueue.splice(idx, 1);
  });

  // Player submits answer
  socket.on("submit-answer", (data) => {
    const code = socket.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room || !room.isRunning) return;

    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    const currentProblemData = room.problems[player.problemIndex - 1];
    if (!currentProblemData) return;

    const isCorrect = data.answer === currentProblemData.problem.answer;

    if (isCorrect) {
      player.score++;

      // Notify both about the score update
      io.to(code).emit("score-update", {
        playerSlot: player.slot,
        score: player.score,
        playerName: player.name,
      });

      // Send next problem
      sendPlayerProblem(code, player);
    } else {
      // Штраф -2 за неверный ответ
      player.score -= 2;
      
      // Уведомляем об обновлении счета (уменьшении)
      io.to(code).emit("score-update", {
        playerSlot: player.slot,
        score: player.score,
        playerName: player.name,
      });
    }

    // Send feedback to the answering player
    socket.emit("answer-feedback", {
      correct: isCorrect,
      givenAnswer: data.answer,
    });
  });

  // Change difficulty in room (before game starts)
  socket.on("change-difficulty", (data) => {
    const code = socket.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.isRunning) return;

    room.difficulty = data.difficulty;
    io.to(code).emit("difficulty-changed", { difficulty: data.difficulty });
  });

  // Update both difficulty and duration for an existing room (before game starts)
  socket.on("update-room-config", (data) => {
    const code = (data.roomCode || socket.roomCode || "").toUpperCase().trim();
    const room = rooms.get(code);
    if (!code || !room) return;
    if (room.isRunning) return;

    if (typeof data.difficulty === "string" && data.difficulty.trim()) {
      room.difficulty = data.difficulty.trim();
    }

    const duration = Number(data.duration);
    if (Number.isFinite(duration) && duration > 0) {
      room.duration = duration;
      room.timeLeft = duration;
    }

    // Client currently listens only for difficulty-changed,
    // but time will be applied when the game starts.
    io.to(code).emit("difficulty-changed", { difficulty: room.difficulty });
  });

  // Rematch request
  socket.on("request-rematch", () => {
    const code = socket.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    if (room.isBotGame) {
      // Auto-accept for bots
      room.players.forEach((p) => (p.score = 0));
      room.timeLeft = room.duration || 60;
      room.problemIndex = 0;
      room.gameStarted = false;
      
      setTimeout(() => {
        if (room.players.length === 2 && !room.isRunning) {
          startGame(code);
        }
      }, 2000);

      io.to(code).emit("rematch-accepted");
      
      // Restart bot simulation after countdown
      if (room.botTimeout) clearTimeout(room.botTimeout);
      
      const profile = room.botProfile;
      const runBotSimulation = () => {
        if (!room.isRunning) return;
        const thinkingTime = Math.floor(Math.random() * (profile.maxTime - profile.minTime)) + profile.minTime;
        room.botTimeout = setTimeout(() => {
          if (!room.isRunning) return;
          const isCorrect = Math.random() < profile.accuracy;
          const botPlayer = room.players[1];
          if (isCorrect) botPlayer.score++;
          else botPlayer.score = Math.max(0, botPlayer.score - 2);
          io.to(code).emit("score-update", { playerSlot: 2, score: botPlayer.score, playerName: profile.name });
          runBotSimulation();
        }, thinkingTime);
      };
      
      setTimeout(() => {
        runBotSimulation();
      }, 5000);
      
      return;
    }

    // Notify the other player
    socket.to(code).emit("rematch-requested", {
      playerName: room.players.find((p) => p.socketId === socket.id)?.name,
    });
  });

  // Accept rematch
  socket.on("accept-rematch", () => {
    const code = socket.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    // Reset scores and timer
    room.players.forEach((p) => (p.score = 0));
    // Keep the chosen duration for rematch when available.
    room.timeLeft = room.duration || room.timeLeft || 60;
    room.problemIndex = 0;
    room.gameStarted = false;

    setTimeout(() => {
      if (room.players.length === 2 && !room.isRunning) {
        startGame(code);
      }
    }, 2000);

    io.to(code).emit("rematch-accepted");
  });

  // Cancel solo mode manually
  socket.on("cancel-solo", () => {
    const code = socket.roomCode;
    if (code) {
      const room = rooms.get(code);
      if (room && room.isSolo) {
        room.isRunning = false;
        if (room.timerInterval) clearInterval(room.timerInterval);
        if (room.startTimeout) clearTimeout(room.startTimeout);
        rooms.delete(code);
      }
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log(`[-] Disconnected: ${socket.id}`);

    // Remove from queue
    const qIdx = waitingQueue.findIndex((q) => q.socketId === socket.id);
    if (qIdx >= 0) waitingQueue.splice(qIdx, 1);

    // Handle room
    const code = socket.roomCode;
    if (code) {
      const room = rooms.get(code);
      if (room) {
        // Remove player from room
        room.players = room.players.filter(p => p.socketId !== socket.id);
        
        if (room.isSolo || room.players.length === 0) {
          room.isRunning = false;
          if (room.timerInterval) clearInterval(room.timerInterval);
          if (room.startTimeout) clearTimeout(room.startTimeout);
          rooms.delete(code);
          console.log(`[Room] Deleted empty room ${code}`);
        } else {
          io.to(code).emit("room-update", {
            code: room.code,
            players: room.players.map(p => ({ name: p.name, slot: p.slot })),
            difficulty: room.difficulty,
            duration: room.duration,
            chat: room.chat
          });
          socket.to(code).emit("opponent-disconnected", {
            message: "Соперник отключился",
          });
        }
      }
    }

    users.delete(socket.id);
  });

  // ──── Bot Mode (PvE) ────
  socket.on("start-bot-game", (data) => {
    const { botId, username } = data;
    const botProfiles = {
      'novice': { name: 'Стажёр-бот', rating: 500, minTime: 8000, maxTime: 12000, accuracy: 0.7 },
      'amateur': { name: 'Любитель-бот', rating: 1000, minTime: 5000, maxTime: 8000, accuracy: 0.85 },
      'scholar': { name: 'Учёный-бот', rating: 1500, minTime: 3000, maxTime: 5000, accuracy: 0.92 },
      'grandmaster': { name: 'Гроссмейстер-бот', rating: 2000, minTime: 1500, maxTime: 3000, accuracy: 0.98 },
      'quantum': { name: 'Квантовый ИИ', rating: 2500, minTime: 800, maxTime: 1500, accuracy: 1.0 }
    };

    const profile = botProfiles[botId] || botProfiles['novice'];
    const roomCode = `bot_${socket.id}_${Date.now()}`;
    
    const room = {
      code: roomCode,
      difficulty: 'progressive',
      duration: 60,
      isRanked: false,
      isBotGame: true,
      botProfile: profile,
      players: [
        {
          socketId: socket.id,
          name: username || "Вы",
          score: 0,
          slot: 1,
          problemIndex: 0,
        },
        {
          socketId: 'bot_socket_id',
          name: profile.name,
          score: 0,
          slot: 2,
          problemIndex: 0,
        }
      ],
      timeLeft: 60,
      isRunning: false,
      problems: [],
      timerInterval: null,
      gameStarted: false,
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerSlot = 1;

    // Fix: Notify client about the match so it initializes its state (myPlayerSlot, opponentName)
    socket.emit("match-found", {
      roomCode: roomCode,
      playerSlot: 1,
      playerName: username || "Вы",
      opponentName: profile.name,
      difficulty: room.difficulty,
    });

    console.log(`[BotGame] Started ${roomCode} for ${username} against ${profile.name}`);
    
    // Use the existing startGame logic
    startGame(roomCode);

    // Bot logical simulation loop
    const runBotSimulation = () => {
      if (!room.isRunning) return;

      const thinkingTime = Math.floor(Math.random() * (profile.maxTime - profile.minTime)) + profile.minTime;
      
      room.botTimeout = setTimeout(() => {
        if (!room.isRunning) return;

        const isCorrect = Math.random() < profile.accuracy;
        const botPlayer = room.players[1];

        if (isCorrect) {
          botPlayer.score++;
          io.to(roomCode).emit("score-update", {
            playerSlot: 2,
            score: botPlayer.score,
            playerName: profile.name,
          });
        } else {
          botPlayer.score = Math.max(0, botPlayer.score - 2);
          io.to(roomCode).emit("score-update", {
            playerSlot: 2,
            score: botPlayer.score,
            playerName: profile.name,
          });
        }

        // Continue simulation
        runBotSimulation();
      }, thinkingTime);
    };

    // Start bot simulation after countdown (5s total in startGame)
    setTimeout(() => {
      runBotSimulation();
    }, 5000);
  });

  // ──── Solo Mode (Speed Solve) ────
  socket.on("start-solo", (data) => {
    const username = (data.username || "Гость").toLowerCase();
    const difficulty = data.difficulty || "easy";
    
    let timeLeft = 60;
    if (difficulty === 'medium') timeLeft = 90;
    if (difficulty === 'hard') timeLeft = 120;

    const soloId = `solo_${socket.id}`;
    const room = {
      code: soloId,
      difficulty: difficulty,
      isSolo: true,
      players: [{ 
        socketId: socket.id, 
        name: data.username || "Вы", 
        score: 0, 
        slot: 1,
        problemIndex: 0 
      }],
      timeLeft: timeLeft,
      isRunning: true,
      problemIndex: 0,
      problems: []
    };

    // Pre-generate problems
    for (let i = 0; i < 100; i++) {
      const p = generateProblem(difficulty);
      const options = generateAnswerOptions(p.answer);
      room.problems.push({ problem: p, options: options });
    }

    rooms.set(soloId, room);
    socket.join(soloId);
    socket.roomCode = soloId;
    socket.playerSlot = 1;

    socket.emit("solo-started", {
      difficulty: room.difficulty,
      timeLeft: room.timeLeft,
    });

    // Таймер и первая задача запускаются через 4 секунды (после отсчета 3-2-1-GO)
    room.startTimeout = setTimeout(() => {
      sendPlayerProblem(soloId, room.players[0]);

      room.timerInterval = setInterval(() => {
        room.timeLeft--;
        socket.emit("timer-update", { timeLeft: room.timeLeft });

        if (room.timeLeft <= 0) {
          clearInterval(room.timerInterval);
          room.isRunning = false;
          
          // Финальный расчет и сохранение
          const score = room.players[0].score;
          db.getUser(username).then(async (user) => {
            if (user) {
              const bestSolo = Math.max(user.bestSolo || 0, score);
              try {
                await db.updateUserStats(username, {
                  totalSolved: user.totalSolved + score,
                  bestSolo: bestSolo
                });
                await db.recordMatchResult({
                  username: username,
                  score: score,
                  is_win: 1, // Every solo completion is a 'win' vs self
                  mode: 'solo'
                });
                console.log(`[Solo] Saved stats for ${username}: score=${score}, best=${bestSolo}`);
              } catch (e) {
                console.error(`[Solo] Error saving stats for ${username}:`, e);
              }
              socket.emit("game-over", {
                player1: { name: room.players[0].name, score },
                player2: { name: "Рекорд", score: bestSolo },
                isSolo: true
              });
            } else {
              socket.emit("game-over", {
                player1: { name: room.players[0].name, score },
                player2: { name: "Рекорд", score: 0 },
                isSolo: true
              });
            }
            rooms.delete(soloId);
          }).catch(console.error);
        }
      }, 1000);
    }, 4000);
  });
});

function startGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.players.length < 2 || room.isRunning) return;

  room.isRunning = true;
  // Use the room duration selected by the host.
  // (Matchmaking rooms don't set duration, so we keep their existing timeLeft.)
  room.timeLeft = room.duration || room.timeLeft || 60;
  room.gameStarted = true;
  
  // Дуэль использует выбранную сложность, либо прогрессивную для matchmaking
  room.problems = [];
  for (let i = 0; i < 200; i++) {
    const p = room.difficulty === 'progressive' 
      ? generateProgressiveProblem(i) 
      : generateProblem(room.difficulty);
    const options = generateAnswerOptions(p.answer);
    room.problems.push({ problem: p, options: options });
  }

  room.players.forEach((p) => {
    p.score = 0;
    p.problemIndex = 0;
  });

  io.to(roomCode).emit("game-starting", {
    player1: { name: room.players[0].name, slot: 1 },
    player2: { name: room.players[1].name, slot: 2 },
    difficulty: room.difficulty,
    timeLeft: room.timeLeft,
  });

  // Send first problem after countdown
  setTimeout(() => {
    room.players.forEach((p) => {
      console.log(`[Duel] Sending first problem to ${p.name}`);
      sendPlayerProblem(roomCode, p);
    });
    startRoomTimer(roomCode);
  }, 5000); // 3s countdown + 2s buffer to guarantee client DOM is ready
}

// ──── Start Server ────
db.initDB().then(() => {
  console.log('[DB] Database initialized successfully');
  
  server.listen(PORT, "0.0.0.0", async () => {
    // Get local IP
    const os = require("os");
    const interfaces = os.networkInterfaces();
    let localIP = "localhost";
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === "IPv4" && !iface.internal) {
          localIP = iface.address;
          break;
        }
      }
    }

    console.log("");
    console.log("  ╔═══════════════════════════════════════╗");
    console.log("  ║     ⚛️  SciDuel Server запущен!       ║");
    console.log("  ╠═══════════════════════════════════════╣");
    console.log(`  ║  Локально:  http://localhost:${PORT}     ║`);
    console.log(`  ║  В сети:    http://${localIP}:${PORT}  ║`);
    console.log("  ║                                       ║");
    console.log("  ║  Откройте ссылку на 2 устройствах     ║");
    // Если мы запускаем локально, можно вывести подсказку
    if (!process.env.RENDER && !process.env.PORT) {
      console.log(`  🌐 Сервер работает локально на http://localhost:${PORT}`);
    } else {
      console.log('  🌐 Сервер запущен в облаке (Render)! Публичная ссылка доступна в панели управления.');
    }
  });
}).catch(err => {
  console.error('[DB] CRITICAL: Failed to initialize database!', err);
  process.exit(1);
});
