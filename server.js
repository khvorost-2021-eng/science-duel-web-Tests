require('dotenv').config();
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

// Serve specific static files from root securely, avoiding exposure of .env or users.db
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));

// Fallback to public directory just in case
app.use(express.static(path.join(__dirname, "public")));

// ──── Data Stores ────
const db = require('./database');
const glicko2 = require('glicko2-lite');

function hashPassword(pw) { 
  const salt = process.env.PASSWORD_SALT || '__sciduel_salt';
  return Buffer.from(pw + salt).toString('base64'); 
}

const rooms = new Map();       // roomCode -> room object
const waitingQueue = [];       // players waiting for matchmaking
const users = new Map();       // socketId -> user info

// ──── New Feature: Achievements ────
const ACHIEVEMENTS = {
  'first_win': { id: 'first_win', name: 'Боевое крещение', description: 'Первая победа в дуэли', icon: '⚔️', xp: 200 },
  'solo_10': { id: 'solo_10', name: 'Скороход', description: 'Набрать 10 очков в штурме', icon: '⚡', xp: 150 },
  'solo_20': { id: 'solo_20', name: 'Гроза примеров', description: 'Набрать 20 очков в штурме', icon: '🔥', xp: 300 },
  'daily_king': { id: 'daily_king', name: 'Постоянство', description: 'Решить ежедневную задачу', icon: '⚛️', xp: 500 },
  'marathon_10': { id: 'marathon_10', name: 'Марафонец', description: 'Решить 10 задач подряд в марафоне', icon: '🏆', xp: 400 },
  'scholar_100': { id: 'scholar_100', name: 'Эрудит', description: 'Решить 100 задач суммарно', icon: '📚', xp: 1000 },
  'streak_5': { id: 'streak_5', name: 'Неудержимый', description: '5 побед подряд в дуэлях', icon: '🔥', xp: 500 }
};

// Global activity feed (in-memory for speed, last 20 events)
const activityFeed = [];
function addActivity(item) {
  activityFeed.unshift({ ...item, timestamp: Date.now() });
  if (activityFeed.length > 20) activityFeed.pop();
  io.emit('new-activity', item);
}

async function checkAchievements(username) {
  const user = await db.getUser(username);
  if (!user) return;

  const earned = (await db.getUserAchievements(username)).map(a => a.achievement_id);
  const newUnlocks = [];

  const check = async (id) => {
    if (!earned.includes(id)) {
      await db.addAchievement(username, id);
      newUnlocks.push(ACHIEVEMENTS[id]);
    }
  };

  // Logic for different achievements
  if (user.wins >= 1) await check('first_win');
  if ((user.totalSolved || user.totalsolved || 0) >= 100) await check('scholar_100');
  if ((user.bestSolo || user.bestsolo || 0) >= 30) await check('storm_pro');

  // Multi-win streak logic (would need a column, but let's use match history)
  try {
    const history = await db.getFilteredLeaderboard('all', 100); // Dummy, better use match_history
    // Real check:
    const matches = await db.getMatchHistory(username, 5);
    if (matches && matches.length >= 5 && matches.every(m => m.is_win)) {
      await check('streak_5');
    }
  } catch(e) {}

  return newUnlocks;
}

// ──── New Feature: Daily Challenge ────
async function getOrGenerateDailyChallenge() {
  const today = new Date().toISOString().split('T')[0];
  let challenge = await db.getDailyChallenge(today);
  
  if (!challenge) {
    // Generate a special hard problem for the day
    const level = 'hard';
    const p = generateProblem(level);
    const options = generateAnswerOptions(p.answer);
    
    challenge = {
      date: today,
      question: p.expression,
      correct: String(p.answer),
      options: options,
      type: level
    };
    
    await db.setDailyChallenge(challenge);
  } else {
    // Parse options from stringified JSON in DB
    if (typeof challenge.options === 'string') {
      try { challenge.options = JSON.parse(challenge.options); } catch(e) {}
    }
  }
  
  return challenge;
}
// ──── New Feature: Community ────
let communityTasks = []; // In-memory cache for speed, but persisted to DB
let nextCommunityTaskId = 1;

async function loadCommunityTasks() {
  try {
    const tasks = await db.getCommunityTasks();
    communityTasks = tasks.map(t => ({
      id: t.id,
      author: t.author,
      title: t.title || 'Задача',
      topic: t.topic || 'Общее',
      grade: t.grade,
      content: t.content,
      createdAt: t.timestamp,
      comments: [] // Comments will be loaded on demand or cached
    }));
    if (communityTasks.length > 0) {
      nextCommunityTaskId = Math.max(...communityTasks.map(t => t.id)) + 1;
    }
    console.log(`[Community] Loaded ${communityTasks.length} tasks from DB.`);
  } catch (err) {
    console.error('[Community] Error loading tasks:', err.message);
  }
}

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

  if (room.timerInterval) {
    clearInterval(room.timerInterval);
  }

  const results = [];
  const updatePromises = [];

  const isBotGame = room.isBotGame;
  const p1 = room.players[0];
  const p2 = room.players[1];

  for (const player of room.players) {
    if (player.socketId === 'bot_socket_id') continue;

    let playerDb = await db.getUser(player.name);
    if (playerDb) {
      let resultXp = 15; // Base participation XP
      const isWin = p2 ? (player.score > (room.players.find(p => p !== player).score)) : false;
      const isDraw = p2 ? (player.score === (room.players.find(p => p !== player).score)) : false;
      
      if (isWin) resultXp = 50;
      else if (isDraw) resultXp = 30;

      const solvedXp = player.score * 2;
      const totalXpGain = resultXp + solvedXp;

      updatePromises.push(db.updateUserStats(player.name, {
        totalSolved: (playerDb.totalSolved || playerDb.totalsolved || 0) + player.score,
        totalGames: (playerDb.totalGames || playerDb.totalgames || 0) + 1,
        bestResult: Math.max(playerDb.bestResult || playerDb.bestresult || 0, player.score),
        wins: (playerDb.wins || 0) + (isWin ? 1 : 0),
        xp: (playerDb.xp || 0) + totalXpGain
      }));

      if (isWin && !isBotGame) {
        addActivity({ type: 'win', user: player.name, score: player.score, mode: 'Duel' });
      }

      updatePromises.push(db.recordMatchResult({
        username: player.name,
        score: player.score,
        is_win: isWin ? 1 : 0, 
        mode: isBotGame ? 'bot' : 'duel'
      }));

      results.push({
        name: player.name,
        score: player.score,
        ratingDelta: 0,
        xpGain: totalXpGain
      });

      // Check achievements
      setTimeout(async () => {
        const unlocks = await checkAchievements(player.name);
        if (unlocks && unlocks.length > 0) {
          io.to(player.socketId).emit('achievements-unlocked', { achievements: unlocks });
          // Add XP for achievement
          const achXp = unlocks.reduce((acc, a) => acc + (a.xp || 0), 0);
          const currentU = await db.getUser(player.name);
          await db.updateUserStats(player.name, { xp: currentU.xp + achXp });
          unlocks.forEach(a => addActivity({ type: 'achievement', user: player.name, ach: a.title, icon: a.icon }));
        }
      }, 2000);
    }
  }

  await Promise.all(updatePromises);

  io.to(roomCode).emit("game-over", {
    results,
    isRanked: room.isRanked,
    isPersistent: true // New flag
  });

  room.gameStarted = false;
  room.isRunning = false;

  // Убрали принудительное удаление комнаты через 30 сек.
  // Теперь комната удаляется только когда последний игрок покидает её (в обработчике disconnect).
}

// ──── Socket.io ────
io.on("connection", (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // Set user info
  socket.on("set-user", (data) => {
    users.set(socket.id, {
      username: data.username || "Гость",
      socketId: socket.id,
    });
  });

  socket.on('register', async (data, callback) => {
    const { username, password } = data;
    if (!username || username.length < 2) return callback({ ok: false, msg: 'Имя не менее 2 симв.' });
    if (!password || password.length < 4) return callback({ ok: false, msg: 'Пароль не менее 4 симв.' });
    try {
      const existing = await db.getUser(username);
      if (existing) return callback({ ok: false, msg: 'Пользователь уже существует' });
      await db.createUser({ username, password: hashPassword(password) });
      const newUser = await db.getUser(username);
      users.set(socket.id, { username: newUser.username, socketId: socket.id });
      const { password: _, ...userNoPw } = newUser;
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
      const user = await db.getUser(username);
      if (!user) return callback({ ok: false, msg: 'Пользователь не найден' });
      if (user.password !== hashPassword(password)) return callback({ ok: false, msg: 'Неверный пароль' });
      
      // Update last_login
      await db.updateUserStats(user.username, { last_login: Date.now() });

      users.set(socket.id, { username: user.username, socketId: socket.id });
      const { password: _, ...userNoPw } = user;
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
        users.set(socket.id, { username: user.username, socketId: socket.id });
        const { password: _, ...userNoPw } = user;
        // Include solo records
        const soloRecords = await db.getUserSoloRecords(data.username);
        userNoPw.soloRecords = soloRecords;
        callback({ ok: true, user: userNoPw });
      } else {
        callback({ ok: false });
      }
    } catch (e) { callback({ ok: false }); }
  });

  socket.on('search-users', async (data, callback) => {
    try {
      if (!data || !data.prefix || data.prefix.trim().length === 0) {
        return callback({ ok: true, users: [] });
      }
      const results = await db.searchUsers(data.prefix.trim(), 5);
      callback({ ok: true, users: results });
    } catch (e) {
      console.error(e);
      callback({ ok: false });
    }
  });

  socket.on('get-leaderboard', async (data, callback) => {
    try {
      const filter = data && data.filter ? data.filter : 'all';
      const leaderboard = await db.getFilteredLeaderboard(filter, 20);
      callback({ ok: true, leaderboard });
    } catch (e) { callback({ ok: false }); }
  });

  socket.on('get-user-achievements', async (data, callback) => {
    const user = users.get(socket.id);
    const username = data.username || (user ? user.username : null);
    if (!username) return callback({ ok: false });
    
    try {
      const earned = await db.getUserAchievements(username);
      const list = earned.map(a => ACHIEVEMENTS[a.achievement_id]).filter(Boolean);
      callback({ ok: true, achievements: list, all: Object.values(ACHIEVEMENTS) });
    } catch (e) { callback({ ok: false }); }
  });

  socket.on('get-daily-challenge', async (data, callback) => {
    const user = users.get(socket.id);
    try {
      const challenge = await getOrGenerateDailyChallenge();
      let solved = false;
      if (user && user.username && user.username !== 'Гость') {
        solved = await db.hasSolvedDaily(user.username, challenge.date);
      }
      callback({ ok: true, challenge, solved });
    } catch (e) { callback({ ok: false }); }
  });

  socket.on('submit-daily-answer', async (data, callback) => {
    const user = users.get(socket.id);
    if (!user || !user.username || user.username === 'Гость') {
      return callback({ ok: false, msg: 'Только для героев SciDuel' });
    }
    
    try {
      const challenge = await getOrGenerateDailyChallenge();
      const isCorrect = String(data.answer).toLowerCase().trim() === String(challenge.correct).toLowerCase().trim();
      
      if (isCorrect) {
        const xpGain = 100;
        await db.markDailySolved(user.username, challenge.date);
        const currentU = await db.getUser(user.username);
        await db.updateUserStats(user.username, { xp: (currentU.xp || 0) + xpGain });
        
        addActivity({ type: 'daily', user: user.username, question: challenge.question });
        
        const unlocks = await checkAchievements(user.username);
        if (unlocks.length > 0) {
          socket.emit('achievements-unlocked', { achievements: unlocks });
          const achXp = unlocks.reduce((acc, a) => acc + (a.xp || 0), 0);
          await db.updateUserStats(user.username, { xp: (currentU.xp || 0) + xpGain + achXp });
        }
        
        callback({ ok: true, correct: true, xpGain });
      } else {
        callback({ ok: true, correct: false });
      }
    } catch (e) { callback({ ok: false }); }
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

  // ──── COMMUNITY HUB ────
  socket.on('get-community-tasks', async (data, callback) => {
    try {
      const dbTasks = await db.getCommunityTasks();
      const list = await Promise.all(dbTasks.map(async (t) => {
        const comments = await db.getCommunityComments(t.id);
        return {
          id: t.id,
          grade: t.grade,
          title: t.title || 'Задача',
          topic: t.topic || 'Общее',
          content: t.content,
          author: t.author,
          createdAt: t.timestamp,
          commentCount: comments.length
        };
      }));
      if (callback) callback({ ok: true, tasks: list });
    } catch (err) {
      console.error('[Community] Error fetching tasks:', err.message);
      if (callback) callback({ ok: false });
    }
  });

  socket.on('get-community-task', async (taskId, callback) => {
    const id = Number(taskId);
    const task = communityTasks.find(t => t.id === id);
    if (task) {
      const comments = await db.getCommunityComments(id);
      callback({ 
        ok: true, 
        task: { 
          ...task, 
          comments: comments.map(c => ({
            id: c.id,
            author: c.author,
            text: c.content,
            createdAt: c.timestamp
          }))
        } 
      });
    } else {
      callback({ ok: false, msg: 'Задача не найдена' });
    }
  });

  socket.on('get-activity-feed', (data, callback) => {
    if (callback) callback({ ok: true, feed: activityFeed });
  });

  socket.on('create-community-task', async (data, callback) => {
    const user = users.get(socket.id);
    const authorName = user ? user.username : 'Аноним';
    
    if (!data.text || !data.grade) {
      if (callback) callback({ ok: false, msg: 'Заполните все поля' });
      return;
    }

    try {
      const newTaskData = {
        author: authorName,
        title: data.title || 'Задача',
        topic: data.topic || 'Общее',
        grade: data.grade,
        content: data.text,
        timestamp: Date.now()
      };
      
      const insertedId = await db.createCommunityTask(newTaskData);
      
      // Reward XP for community contribution
      const currentU = await db.getUser(authorName);
      if (currentU) {
        await db.updateUserStats(authorName, { xp: (currentU.xp || 0) + 150 });
      }

      const newTask = {
        id: insertedId,
        author: authorName,
        title: newTaskData.title,
        topic: newTaskData.topic,
        grade: data.grade,
        content: data.text,
        createdAt: newTaskData.timestamp,
        comments: []
      };
      
      addActivity({ type: 'community', user: authorName, title: newTask.title });
      
      communityTasks.unshift(newTask);
      nextCommunityTaskId = insertedId + 1;
      
      if (callback) callback({ ok: true, task: newTask });
      
      io.emit('new-community-task', {
        id: newTask.id,
        grade: newTask.grade,
        title: newTask.title,
        topic: newTask.topic,
        content: newTask.content,
        author: newTask.author,
        createdAt: newTask.createdAt,
        commentCount: 0
      });
    } catch (err) {
      console.error('[Community] Error creating task:', err.message);
      if (callback) callback({ ok: false });
    }
  });

  socket.on('join-community-task', (taskId) => {
    // Leave other task rooms to prevent multiple streams
    for (const room of socket.rooms) {
      if (room.startsWith('community-task-')) {
        socket.leave(room);
      }
    }
    socket.join(`community-task-${taskId}`);
  });

  socket.on('send-community-comment', async (data) => {
    const taskId = Number(data.taskId);
    const text = data.text;
    if (!text || !text.trim()) return;

    const user = users.get(socket.id);
    const authorName = user ? user.username : 'Аноним';

    try {
      const commentData = {
        taskId: taskId,
        author: authorName,
        content: text.trim()
      };
      const commentId = await db.addCommunityComment(commentData);
      
      const comment = {
        id: commentId,
        author: authorName,
        text: text.trim(),
        createdAt: Date.now()
      };

      io.to(`community-task-${taskId}`).emit('new-community-comment', {
        taskId: taskId,
        comment: comment
      });
      
      // Notify update for comment count
      const updatedComments = await db.getCommunityComments(taskId);
      io.emit('community-task-updated', {
        taskId: taskId,
        commentCount: updatedComments.length
      });
    } catch (err) {
      console.error('[Community] Error adding comment:', err.message);
    }
  });

  socket.on('get-community-comments', async (taskId, callback) => {
    try {
      const comments = await db.getCommunityComments(taskId);
      callback(comments.map(c => ({
        id: c.id,
        author: c.author,
        text: c.content,
        createdAt: c.timestamp
      })));
    } catch (err) {
       console.error('[Community] Error getting comments:', err.message);
       callback([]);
    }
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
      rating: playerRating
    };

    // Find someone in queue with same difficulty and similar rating (within 250)
    const matchIndex = waitingQueue.findIndex(
      (q) => q.difficulty === playerInfo.difficulty && 
             Math.abs(q.rating - playerInfo.rating) < 250 &&
             q.socketId !== socket.id,
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
          // Если ушел хост — назначаем первого оставшегося игрока новым хостом
          if (room.hostId === socket.id) {
            room.hostId = room.players[0].socketId;
            console.log(`[Room] Host migrated to ${room.players[0].name} in ${code}`);
            io.to(code).emit('host-changed', { newHost: room.players[0].name });
          }

          io.to(code).emit("room-update", {
            code: room.code,
            players: room.players.map(p => ({ name: p.name, slot: p.slot })),
            difficulty: room.difficulty,
            duration: room.duration,
            chat: room.chat,
            hostId: room.hostId // Передаем ID хоста
          });
          
          socket.to(code).emit("opponent-disconnected", {
            message: "Игрок отключился",
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
    socket.join(roomCode, () => {
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
    });

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
              const bestSolo = Math.max((user.bestSolo || user.bestsolo || 0), score);
              const xpGain = score * 5;
              try {
                await db.updateSoloRecord(username, difficulty, score);
                await db.updateUserStats(username, {
                  totalSolved: (user.totalSolved || user.totalsolved || 0) + score,
                  bestSolo: bestSolo,
                  xp: (user.xp || 0) + xpGain
                });
                await db.recordMatchResult({
                  username: username,
                  score: score,
                  is_win: 1,
                  mode: 'solo'
                });
                
                if (score >= 15) {
                   addActivity({ type: 'solo', user: username, score: score, mode: difficulty });
                }

              } catch (e) {
                console.error(`[Solo] Error saving stats for ${username}:`, e);
              }
              
              const updatedRecords = await db.getUserSoloRecords(username);
              const myRecord = updatedRecords.find(r => r.mode === difficulty)?.score || 0;

              socket.emit("game-over", {
                player1: { name: room.players[0].name, score, xpGain },
                player2: { name: "Ваш рекорд", score: myRecord },
                isSolo: true,
                mode: difficulty
              });
              
              setTimeout(async () => {
                const unlocks = await checkAchievements(username);
                if (unlocks && unlocks.length > 0) {
                  socket.emit('achievements-unlocked', { achievements: unlocks });
                  const currentU = await db.getUser(username);
                  const achXp = unlocks.reduce((acc, a) => acc + (a.xp || 0), 0);
                  await db.updateUserStats(username, { xp: currentU.xp + achXp });
                }
              }, 1000);
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
  loadCommunityTasks();
  
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
