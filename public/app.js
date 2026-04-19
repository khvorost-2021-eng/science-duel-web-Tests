/* ═══════════════════════════════════════════
   SciDuel — Multiplayer Client
   Socket.io based real-time duel
   ═══════════════════════════════════════════ */

(function () {
  'use strict';

  console.log('🚀 SciDuel Client Initializing...');

  // ──── Socket.io connection ────
  const socket = io();

  socket.on('connect', () => {
    console.log('✅ Connected to server! ID:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.error('❌ Connection error:', err.message);
  });

  socket.on('room-update', (data) => {
    renderLobby(data);
    // Don't pull out of the results screen automatically
    if (state.currentScreen !== 'results') {
      navigateTo('lobby');
    }
  });

  socket.on('new-chat-message', (msg) => {
    const list = $('#chat-messages');
    if (!list) return;
    const div = document.createElement('div');
    div.className = `chat-msg ${msg.sender === state.myName ? 'chat-msg-self' : 'chat-msg-other'}`;
    div.innerHTML = `<span class="chat-name">${msg.sender}</span>${msg.text}`;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
  });

  socket.on('room-created', (data) => {
    state.roomCode = data.roomCode;
    state.difficulty = data.difficulty;
    state.duration = data.duration;
    renderLobby({
      code: data.roomCode,
      players: [{ name: data.playerName, slot: data.playerSlot }],
      difficulty: data.difficulty,
      duration: data.duration,
      chat: []
    });
    navigateTo('lobby');
  });

  // ──── State ────
  const state = {
    currentUser: null,
    currentScreen: 'home',
    myPlayerSlot: null,    // 1 or 2
    myName: '',
    opponentName: '',
    roomCode: null,
    difficulty: null,
    myScore: 0,
    opponentScore: 0,
    timeLeft: 60,
    timeTotal: 60,
    isRunning: false,
    quoteIndex: 0,
    theme: localStorage.getItem('sciduel_theme') || 'default',
    animSpeed: parseFloat(localStorage.getItem('sciduel_anim_speed')) || 1.0,
    isSound: localStorage.getItem('sciduel_sound') !== 'false',
    isSolo: false,
    streak: 0,
    practice: {
      filter: 'all',
      solved: 0,
      correct: 0,
      currentTask: null
    },
    marathon: {
      active: false,
      streak: 0,
      currentTask: null,
      history: []
    },
    bots: [
      { id: 'novice', name: 'Стажёр-бот', rating: 500, avatar: '🐣', desc: 'Только учится основам математики. Часто ошибается и долго думает.', time: '8-12 сек', accuracy: '70%', role: 'Новичок' },
      { id: 'amateur', name: 'Любитель-бот', rating: 1000, avatar: '👨‍🎓', desc: 'Уже уверенно решает базовые примеры. Неплохой соперник для разминки.', time: '5-8 сек', accuracy: '85%', role: 'Ученик' },
      { id: 'scholar', name: 'Учёный-бот', rating: 1500, avatar: '🧠', desc: 'Быстрый и точный. Ошибки случаются редко. Крепкий орешек для большинства.', time: '3-5 сек', accuracy: '92%', role: 'Исследователь' },
      { id: 'grandmaster', name: 'Гроссмейстер-бот', rating: 2000, avatar: '🏆', desc: 'Почти не совершает ошибок. Решает задачи с молниеносной скоростью.', time: '1.5-3 сек', accuracy: '98%', role: 'Профессор' },
      { id: 'quantum', name: 'Квантовый ИИ', rating: 2500, avatar: '⚛️', desc: 'Вершина математической мысли. Ошибки невозможны. Скорость — за гранью.', time: '0.8-1.5 сек', accuracy: '100%', role: 'Академик' },
    ]
  };

  // ──── Quotes ────
  const quotes = [
    { text: 'Воображение важнее знания. Знание ограничено, тогда как воображение охватывает целый мир', author: 'Альберт Эйнштейн' },
    { text: 'В жизни нет ничего, чего нужно бояться. Есть лишь то, что нужно понять', author: 'Мария Кюри' },
    { text: 'Если я видел дальше других, то потому, что стоял на плечах гигантов', author: 'Исаак Ньютон' },
    { text: 'Наука — это организованное знание. Мудрость — это организованная жизнь', author: 'Иммануил Кант' },
    { text: 'Математика — это музыка разума', author: 'Джеймс Джозеф Сильвестр' },
    { text: 'Самое непостижимое в мире — это то, что он постижим', author: 'Альберт Эйнштейн' },
    { text: 'Учитесь так, словно вы будете жить вечно; живите так, словно умрёте завтра', author: 'Махатма Ганди' },
    { text: 'Наука — это великая красота. Учёный в своей лаборатории — не просто техник: он стоит перед законами природы как ребёнок перед сказкой', author: 'Мария Кюри' },
    { text: 'Чистая математика — это такой предмет, где мы не знаем, о чём мы говорим, и не знаем, истинно ли то, что мы говорим', author: 'Бертран Рассел' },
    { text: 'Стремись не к тому, чтобы добиться успеха, а к тому, чтобы твоя жизнь имела смысл', author: 'Альберт Эйнштейн' },
  ];

  // ──── Utility helpers ────
  function $(sel, parent = document) { return parent.querySelector(sel); }
  function $$(sel, parent = document) { return [...parent.querySelectorAll(sel)]; }

  function showToast(message, type = 'info') {
    const container = $('.toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(60px)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function getRank(rating) {
    const r = Math.round(rating || 1500);
    if (r < 1000) return { title: 'Новичок', icon: '🥉', class: 'rank-novice' };
    if (r < 1300) return { title: 'Ученик', icon: '🥈', class: 'rank-apprentice' };
    if (r < 1600) return { title: 'Исследователь', icon: '🥇', class: 'rank-researcher' };
    if (r < 1900) return { title: 'Магистр наук', icon: '💠', class: 'rank-master' };
    if (r < 2200) return { title: 'Профессор', icon: '⚛️', class: 'rank-professor' };
    if (r < 2500) return { title: 'Академик', icon: '👑', class: 'rank-academic' };
    return { title: 'Легенда SciDuel', icon: '🌌', class: 'rank-legend' };
  }

  // ──── Audio Controller (Web Audio API) ────
  let audioCtx;
  function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  const playSound = (type) => {
    if (!state.isSound || !audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    const t = audioCtx.currentTime;
    if (type === 'correct') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
      gainNode.gain.setValueAtTime(0.3, t);
      gainNode.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    } else if (type === 'wrong') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(100, t + 0.2);
      gainNode.gain.setValueAtTime(0.3, t);
      gainNode.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      osc.start(t);
      osc.stop(t + 0.2);
      osc.frequency.setValueAtTime(660, t + 0.1);
      gainNode.gain.setValueAtTime(0.1, t);
      gainNode.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    } else if (type === 'win') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.setValueAtTime(500, t + 0.1);
      osc.frequency.setValueAtTime(600, t + 0.2);
      osc.frequency.setValueAtTime(800, t + 0.3);
      gainNode.gain.setValueAtTime(0.3, t);
      gainNode.gain.linearRampToValueAtTime(0.01, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.6);
    } else if (type === 'loss') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.setValueAtTime(250, t + 0.2);
      osc.frequency.setValueAtTime(200, t + 0.4);
      gainNode.gain.setValueAtTime(0.3, t);
      gainNode.gain.linearRampToValueAtTime(0.01, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.6);
    }
  };

  function setCurrentUser(user) {
    state.currentUser = user;
    if (user) {
      // ── Bug 1.1 fix: always sync myName so tournament-match-ready works for admin too ──
      state.myName = user.username;
      localStorage.setItem('sciduel_current', user.username);
      socket.emit('set-user', { username: user.username });
      fetchDailyChallenge();
    } else {
      state.myName = '';
      localStorage.removeItem('sciduel_current');
      // ── Bug 1.2 fix: show challenge for default grade when logged out ──
      fetchDailyChallenge();
      const resEl = $('#daily-challenge-result');
      if (resEl) resEl.style.display = 'none';
    }
    updateNavbar();
  }

  // ── Bug 1.2: fetch daily challenge for any visitor (auth or not) ──
  function fetchDailyChallenge() {
    const grade = (state.currentUser && state.currentUser.grade) ? state.currentUser.grade : 5;
    const isLoggedIn = !!state.currentUser;

    console.log(`[DailyChallenge] Fetching for grade=${grade}, loggedIn=${isLoggedIn}`);

    socket.emit('get-daily-challenge', { grade }, (res) => {
      if (res.ok && res.challenge && res.challenge.text) {
        $('#daily-challenge-text').textContent = res.challenge.text;

        if (res.alreadySolved) {
          $('#daily-challenge-form').style.display = 'none';
          const resultEl = $('#daily-challenge-result');
          resultEl.textContent = '✅ Вы уже решили задачу дня! Возвращайтесь завтра.';
          resultEl.style.color = 'var(--accent-green)';
          resultEl.style.display = 'block';
          return;
        }

        if (isLoggedIn) {
          // Logged-in users see the form and can submit
          $('#daily-challenge-form').style.display = 'flex';
          const submitBtn = $('#daily-challenge-submit');
          submitBtn.disabled = false;
          submitBtn.title = '';

          submitBtn.onclick = () => {
            const answer = $('#daily-challenge-input').value.trim();
            if (!answer) return;
            submitBtn.disabled = true;

            socket.emit('submit-daily-challenge', { answer }, (subRes) => {
              if (subRes.ok) {
                 $('#daily-challenge-result').textContent = '✅ Правильно! Вы заработали +1 в статистику!';
                 $('#daily-challenge-result').style.color = 'var(--accent-green)';
                 $('#daily-challenge-result').style.display = 'block';
                 $('#daily-challenge-form').style.display = 'none';
                 showToast('Верный ответ!', 'success');
                 loadCurrentUser();
              } else {
                 $('#daily-challenge-result').textContent = '❌ ' + (subRes.msg || 'Неверный ответ. Попробуйте ещё раз!');
                 $('#daily-challenge-result').style.color = 'var(--accent-pink)';
                 $('#daily-challenge-result').style.display = 'block';
                 submitBtn.disabled = false;
                 setTimeout(() => { if (!subRes.ok) $('#daily-challenge-result').style.display = 'none'; }, 4000);
              }
            });
          };
        } else {
          // Guest users can see the task but can't submit — button redirects to login
          $('#daily-challenge-form').style.display = 'flex';
          const submitBtn = $('#daily-challenge-submit');
          submitBtn.disabled = false;
          submitBtn.title = 'Войдите, чтобы отправить ответ';
          submitBtn.onclick = () => {
            showToast('Войдите, чтобы ответить на задачу!', 'info');
            openModal('login');
          };
        }
      } else {
        if (isLoggedIn) {
          $('#daily-challenge-text').textContent = `К сожалению, для ${grade} класса пока нет новой задачи.`;
        } else {
          $('#daily-challenge-text').textContent = 'Задача дня скоро появится. Следите за обновлениями!';
        }
        $('#daily-challenge-form').style.display = 'none';
      }
    });
  }

  function loadCurrentUser() {
    const name = localStorage.getItem('sciduel_current');
    if (!name) return;
    socket.emit('get-user', { username: name }, (result) => {
      if (result && result.ok) {
        state.currentUser = result.user;
        state.myName = result.user.username;
        updateNavbar();
        fetchDailyChallenge(); // Added: fetch challenge for logged in user on refresh
      } else {
        localStorage.removeItem('sciduel_current');
      }
    });

    // Load settings
    applyTheme(state.theme);
    applyAnimSpeed(state.animSpeed);
  }

  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    state.theme = theme;
    localStorage.setItem('sciduel_theme', theme);
    $$('.theme-btn').forEach(btn => {
      btn.style.border = btn.dataset.theme === theme ? '3px solid #fff' : 'none';
    });
  }

  function applyAnimSpeed(speed) {
    document.documentElement.style.setProperty('--anim-speed', speed);
    state.animSpeed = speed;
    localStorage.setItem('sciduel_anim_speed', speed);
    const range = $('#anim-speed-range');
    const val = $('#anim-speed-value');
    if (range) range.value = speed;
    if (val) val.textContent = speed.toFixed(1) + 'x';
  }

  // ──── Navigation ────
  function navigateTo(screen) {
    state.currentScreen = screen;
    $$('.screen').forEach(s => s.classList.remove('active'));
    const target = $(`#screen-${screen}`);
    if (target) target.classList.add('active');
    
    if (screen !== 'practice') {
      if (typeof MathKeyboard !== 'undefined' && MathKeyboard.hide) {
        MathKeyboard.hide();
      }
    }

    if (screen === 'game' || screen === 'duel' || screen === 'solo' || screen === 'bot-game') {
      document.body.classList.add('in-game');
    } else {
      document.body.classList.remove('in-game');
    }

    const nav = $('.navbar');
    if (nav) nav.classList.remove('nav-open');

    updateNavbar();
    window.scrollTo(0, 0);
    updateNavHeightVar();
  }

  function updateNavHeightVar() {
    const nav = $('.navbar');
    if (!nav) return;
    const h = Math.ceil(nav.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty('--nav-h', `${h}px`);
  }

  // ──── Inline Navbar Player Search (Lichess-style) ────
  function initNavSearch() {
    const input = document.getElementById('nav-search-input');
    const dropdown = document.getElementById('nav-search-dropdown');
    if (!input || !dropdown) return;

    let searchTimeout;

    function hideDropdown() {
      dropdown.classList.remove('open');
      dropdown.innerHTML = '';
    }

    function showResults(players) {
      if (!players || players.length === 0) {
        dropdown.innerHTML = '<div class="nsd-empty">Игроки не найдены</div>';
        dropdown.classList.add('open');
        return;
      }
      dropdown.innerHTML = players.map(p => {
        const rank = getRank(p.glicko_rating || 1500);
        const initial = p.username.charAt(0).toUpperCase();
        return `
          <div class="nsd-row" data-username="${p.username}">
            <div class="nsd-avatar ${rank.class}">${initial}</div>
            <div class="nsd-info">
              <span class="nsd-name">${p.username}</span>
              <span class="nsd-meta">${rank.icon} ${rank.title} · ${Math.round(p.glicko_rating || 1500)}</span>
            </div>
            <span class="nsd-wr">${p.wins || 0}W / ${p.losses || 0}L</span>
          </div>
        `;
      }).join('');
      dropdown.classList.add('open');

      dropdown.querySelectorAll('.nsd-row').forEach(row => {
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const uname = row.dataset.username;
          input.value = '';
          hideDropdown();
          showUserProfile(uname);
        });
      });
    }

    input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const q = input.value.trim();
      if (q.length < 2) { hideDropdown(); return; }
      dropdown.innerHTML = '<div class="nsd-empty">Поиск...</div>';
      dropdown.classList.add('open');
      searchTimeout = setTimeout(() => {
        socket.emit('search-players', { query: q }, (res) => {
          showResults(res && res.ok ? res.players : []);
        });
      }, 350);
    });

    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 2) dropdown.classList.add('open');
    });

    input.addEventListener('blur', () => {
      setTimeout(hideDropdown, 180);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.value = ''; hideDropdown(); }
    });
  }

  function updateNavbar() {
    const actionsEl = $('.navbar-actions');
    if (!actionsEl) return;

    if (state.currentUser) {
      const initial = state.currentUser.username.charAt(0).toUpperCase();
      actionsEl.innerHTML = `
        <div class="navbar-menu">
          <div class="nav-dropdown">
            <button class="nav-dropdown-btn">🎯 Игра</button>
            <div class="nav-dropdown-content">
              <button class="nav-dropdown-item" id="nav-practice-btn">📝 Практика штурма</button>
              <button class="nav-dropdown-item" id="nav-bots-btn">🤖 Игра с ботами</button>
              <button class="nav-dropdown-item" id="nav-tournaments-btn">🏅 Турниры</button>
            </div>
          </div>
          
          <div class="nav-dropdown">
            <button class="nav-dropdown-btn">📚 База знаний</button>
            <div class="nav-dropdown-content">
              <button class="nav-dropdown-item" id="nav-theory-btn">📖 Теория</button>
              <button class="nav-dropdown-item" id="nav-rules-btn">📋 Правила</button>
            </div>
          </div>
          
          <div class="nav-dropdown">
            <button class="nav-dropdown-btn">🌐 Сообщество</button>
            <div class="nav-dropdown-content">
              <button class="nav-dropdown-item" id="nav-leaderboard-btn">🏆 Рейтинг игроков</button>
              <button class="nav-dropdown-item" id="nav-community-btn">🔵 Телеграм-канал</button>
            </div>
          </div>
        </div>
        
        <div class="navbar-right">
          <div class="nav-search-wrap" id="nav-search-wrap">
            <input class="nav-search-input" id="nav-search-input" type="text" placeholder="🔍 Искать игрока..." autocomplete="off" />
            <div class="nav-search-dropdown" id="nav-search-dropdown"></div>
          </div>

          <div class="nav-dropdown">
            <div class="navbar-user nav-dropdown-btn" style="cursor:pointer;padding:6px 12px">
              <div class="user-avatar">${initial}</div>
              <span class="user-name-text" style="font-weight:600">${state.currentUser.username}</span>
            </div>
            <div class="nav-dropdown-content" style="right:0;left:auto;min-width:180px">
              <button class="nav-dropdown-item" id="nav-profile-btn">👤 Мой профиль</button>
              <button class="nav-dropdown-item" id="nav-settings-btn">⚙️ Настройки</button>
              ${state.currentUser.role === 'admin' ? '<button class="nav-dropdown-item" id="nav-admin-btn" style="color:#ef4444">🔧 Админ-панель</button>' : ''}
              <div style="height:1px;background:var(--border-glass);margin:4px 0"></div>
              <button class="nav-dropdown-item" id="nav-logout-btn" style="color:#ef4444">🚪 Выйти</button>
            </div>
          </div>
        </div>
      `;
      $('#nav-settings-btn').addEventListener('click', () => { initSettings(); navigateTo('settings'); });
      $('#nav-theory-btn').addEventListener('click', () => { renderTheory(); navigateTo('theory'); });
      $('#nav-practice-btn').addEventListener('click', () => { renderPracticeMode(); navigateTo('practice'); });
      $('#nav-bots-btn').addEventListener('click', () => { renderBots(); navigateTo('bots'); });
      $('#nav-community-btn').addEventListener('click', () => window.open('https://t.me/sciduel', '_blank'));
      $('#nav-rules-btn').addEventListener('click', () => navigateTo('rules'));
      $('#nav-leaderboard-btn').addEventListener('click', () => { renderLeaderboard(); navigateTo('leaderboard'); });
      $('#nav-tournaments-btn').addEventListener('click', () => { renderTournaments(); navigateTo('tournaments'); });
      
      const adminBtn = $('#nav-admin-btn');
      if (adminBtn) {
        adminBtn.addEventListener('click', () => {
          renderAdminPanelUI();
          navigateTo('admin');
        });
      }

      $('#nav-profile-btn').addEventListener('click', () => {
        renderProfile();
        navigateTo('profile');
      });
      $('#nav-logout-btn').addEventListener('click', () => {
        setCurrentUser(null);
        navigateTo('home');
        showToast('Вы вышли из аккаунта', 'info');
      });
      initNavSearch();
    } else {
      actionsEl.innerHTML = `
        <div class="nav-dropdown">
          <button class="nav-dropdown-btn">🎯 Игра</button>
          <div class="nav-dropdown-content">
            <button class="nav-dropdown-item" id="nav-practice-btn">📝 Практика штурма</button>
            <button class="nav-dropdown-item" id="nav-bots-btn">🤖 Игра с ботами</button>
            <button class="nav-dropdown-item" id="nav-tournaments-btn">🏅 Турниры</button>
          </div>
        </div>
        
        <div class="nav-dropdown">
          <button class="nav-dropdown-btn">📚 База знаний</button>
          <div class="nav-dropdown-content">
            <button class="nav-dropdown-item" id="nav-theory-btn">📖 Теория</button>
            <button class="nav-dropdown-item" id="nav-rules-btn">📋 Правила</button>
          </div>
        </div>
        
        <div class="nav-dropdown">
          <button class="nav-dropdown-btn">🌐 Сообщество</button>
          <div class="nav-dropdown-content">
            <button class="nav-dropdown-item" id="nav-leaderboard-btn">🏆 Рейтинг игроков</button>
            <button class="nav-dropdown-item" id="nav-community-btn">🔵 Телеграм-канал</button>
          </div>
        </div>
        
        <div class="nav-search-wrap" id="nav-search-wrap">
          <input class="nav-search-input" id="nav-search-input" type="text" placeholder="🔍 Искать игрока..." autocomplete="off" />
          <div class="nav-search-dropdown" id="nav-search-dropdown"></div>
        </div>

        <button class="btn btn-ghost" id="nav-settings-btn" title="Настройки">⚙️</button>
        <button class="btn btn-secondary" id="nav-login-btn">Войти</button>
        <button class="btn btn-primary" id="nav-register-btn">Регистрация</button>
      `;
      $('#nav-settings-btn').addEventListener('click', () => { initSettings(); navigateTo('settings'); });
      $('#nav-theory-btn').addEventListener('click', () => { renderTheory(); navigateTo('theory'); });
      $('#nav-practice-btn').addEventListener('click', () => { renderPracticeMode(); navigateTo('practice'); });
      $('#nav-bots-btn').addEventListener('click', () => { renderBots(); navigateTo('bots'); });
      $('#nav-community-btn').addEventListener('click', () => window.open('https://t.me/sciduel', '_blank'));
      $('#nav-rules-btn').addEventListener('click', () => navigateTo('rules'));
      $('#nav-leaderboard-btn').addEventListener('click', () => { renderLeaderboard(); navigateTo('leaderboard'); });
      $('#nav-tournaments-btn').addEventListener('click', () => { renderTournaments(); navigateTo('tournaments'); });
      $('#nav-login-btn').addEventListener('click', () => openModal('login'));
      $('#nav-register-btn').addEventListener('click', () => openModal('register'));
      initNavSearch();
    }
  }

  function renderTheory() {
    const el = $('#theory-container');
    if (!el) return;

    const theory = [
      {
        grade: '5 КЛАСС',
        intro: 'Погружение в мир больших чисел, секреты быстрых вычислений и первые шаги в геометрии.',
        sections: [
          {
            title: '1. Числа-гиганты и их правила',
            points: [
              { 
                topic: 'Натуральные числа и наша система счисления', 
                theory: 'Всё, что мы используем для счета предметов — это натуральные числа (1, 2, 3...). Наша система называется десятичной позиционной. "Десятичная" — потому что цифр всего десять (0-9), а "позиционная" — потому что значение цифры зависит от её места (разряда). Например, в числе 555 первая пятёрка — это сотни, вторая — десятки, третья — единицы. Если мы добавим 0 в конец — число вырастет в 10 раз. Это гениальное изобретение человечества, позволяющее записывать любые огромные числа всего десятью знаками.', 
                example: 'Число 1 204: 1 тысяча, 2 сотни, 0 десятков, 4 единицы. Читается: одна тысяча двести четыре.' 
              },
              { 
                topic: 'Сравнение и Округление: искусство примерности', 
                theory: 'Сравнивать числа легко: сначала смотрим на количество знаков (где больше цифр, то и больше). Если знаков поровну — сравниваем по разрядам слева направо. Округление — это способ сделать число "проще". Если нам не важен каждый рубль, мы говорим "около 100". Правило: если отбрасываемая цифра меньше 5 (0,1,2,3,4) — предыдущую не меняем. Если 5 и больше (5,6,7,8,9) — увеличиваем на 1. Это база для быстрой оценки ситуации без точных расчетов.', 
                example: 'Округлим 127 до десятков: смотрим на единицы (7), 7 > 5, значит десятки увеличиваем на 1. Ответ: ≈ 130.' 
              },
              { 
                topic: 'Римские цифры: наследие предков', 
                theory: 'Римляне использовали буквы вместо цифр. Главные: I(1), V(5), X(10), L(50), C(100), D(500), M(1000). Тут хитрое правило: если маленькое число стоит справа от большого — прибавляем (VI = 5 + 1 = 6), если слева — вычитаем (IV = 5 - 1 = 4). Больше трёх одинаковых букв подряд не ставят. Сегодня мы видим их на часах или в номерах томов книг.', 
                example: 'Запишем 29: это 10 + 10 + (10 - 1), то есть XX + IX = XXIX.' 
              }
            ]
          },
          {
            title: '2. Магия операций и порядок действий',
            points: [
              { 
                topic: 'Умножение и его свойства', 
                theory: 'Умножение — это просто сложение одинаковых слагаемых. "5 раз по 4". Главные свойства: переместительное (от перемены мест множителей произведение не меняется — 5 * 4 = 4 * 5) и распределительное (позволяет раскрывать скобки). Например, 5 * (10 + 2) = 5 * 10 + 5 * 2. Это свойство — секрет того, как считать в уме быстрее калькулятора.', 
                example: 'Вычислим 102 * 8 в уме: (100 + 2) * 8 = 100 * 8 + 2 * 8 = 800 + 16 = 816.' 
              },
              { 
                topic: 'Степень числа: взрывной рост', 
                theory: 'Степень — это когда мы число умножаем само на себя несколько раз. Квадрат (a²) — это a * a. Куб (a³) — это a * a * a. Почему квадрат? Потому что так ищется площадь квадрата. Почему куб? Потому что так ищется объем куба. Это очень быстрая операция: 2 в 10-й степени — это уже больше тысячи!', 
                example: '5² = 25, а 10³ = 1000.' 
              },
              { 
                topic: 'Деление с остатком', 
                theory: 'Не всегда можно поровну разделить конфеты между друзьями. Если у нас 10 конфет и 3 друга, каждый получит по 3, а 1 конфета останется. Это и есть остаток. Важно: остаток всегда должен быть меньше делителя. Проверить деление можно так: (частное * делитель) + остаток = делимое.', 
                example: '25 : 7 = 3 (остаток 4). Проверка: 3 * 7 + 4 = 21 + 4 = 25. Всё верно!' 
              }
            ]
          },
          {
            title: '3. Дроби: когда целого мало',
            points: [
              { 
                topic: 'Что такое обыкновенная дробь', 
                theory: 'Представьте пиццу, разрезанную на 8 частей. Если вы съели 3 куска, вы съели 3/8 пиццы. Верхнее число (числитель) говорит, сколько частей мы взяли. Нижнее (знаменатель) — на сколько всего частей разрезали целое. Если числитель меньше знаменателя — дробь правильная (меньше 1). Если больше или равен — неправильная (в ней спрятано целое число).', 
                example: '7/3 — это неправильная дробь. В ней 2 целых и еще 1/3. Записывается как 2 1/3.' 
              },
              { 
                topic: 'Десятичные дроби: запятая решает всё', 
                theory: 'Это особый вид дробей, где знаменатель — 10, 100, 1000 и так далее. Вместо записи в два этажа мы ставим запятую. 0,1 — это одна десятая. 0,01 — одна сотая. При сложении десятичных дробей самое главное — ставить запятую строго под запятой, как будто это кнопка, соединяющая две части.', 
                example: '1,5 + 0,25. Добавим невидимый нолик: 1,50 + 0,25 = 1,75.' 
              }
            ]
          },
          {
            title: '4. Основы геометрии: фигуры и пространство',
            points: [
              { 
                topic: 'Периметр и Площадь', 
                theory: 'Периметр — это длина забора вокруг участка. Мы просто складываем длины всех сторон. Площадь — это сколько плитки нужно, чтобы выложить этот участок. Для прямоугольника площадь — это длина умноженная на ширину. Запомните: периметр измеряется в простых метрах, а площадь — в квадратных (м²).', 
                example: 'Прямоугольник 5 на 4 см. Периметр = 5+5+4+4 = 18 см. Площадь = 5*4 = 20 см².' 
              },
              { 
                topic: 'Объем и его измерение', 
                theory: 'Объем — это сколько воды поместится в коробку или бассейн. Мы берем площадь дна и умножаем на высоту. Для коробки (параллелепипеда) это произведение трех измерений: длина * ширина * высота. Измеряется в кубических единицах (см³, м³).', 
                example: 'Аквариум 50 см в длину, 30 в ширину и 40 в высоту. Объем = 50 * 30 * 40 = 60 000 см³ (это 60 литров).' 
              }
            ]
          }
        ]
      },
      {
        grade: '6 КЛАСС',
        intro: 'Время отрицательных чисел, пропорций и глубокого изучения делимости.',
        sections: [
          {
            title: '1. Делимость натуральных чисел',
            points: [
              { 
                topic: 'Признаки делимости: считаем без деления', 
                theory: 'Как узнать, делится ли число, не считая? На 2: если число четное. На 5: если в конце 0 или 5. На 10: если в конце 0. Самое интересное — на 3 и 9: сложите все цифры числа, и если сумма делится на 3 или 9, то и всё число делится. Теперь вы — человек-калькулятор!', 
                example: 'Число 123. Сумма 1+2+3=6. 6 делится на 3, значит 123 делится на 3. Но 6 не делится на 9, значит 123 на 9 не делится.' 
              },
              { 
                topic: 'НОД и НОК: общие интересы чисел', 
                theory: 'НОД (Наибольший Общий Делитель) — это самое большое число, на которое оба заданных числа делятся без остатка. Нужно, чтобы сокращать дроби. НОК (Наименьшее Общее Кратное) — это самое маленькое число, которое само делится на оба заданных числа. Нужно, чтобы приводить дроби к общему знаменателю. Это как искать общие точки соприкосновения у разных людей.', 
                example: 'НОД(12 и 18). 12 делится на 1,2,3,4,6,12. 18 на 1,2,3,6,9,18. Общий максимум — 6. НОК(4 и 6) — это 12, так как 12 делится и на 4, и на 6.' 
              }
            ]
          },
          {
            title: '2. Отношения и Пропорции',
            points: [
              { 
                topic: 'Пропорция: баланс равенства', 
                theory: 'Пропорция — это когда два отношения равны. a/b = c/d. Главный секрет — "правило креста": произведение крайних членов равно произведению средних (a * d = b * c). Если вы знаете три числа в пропорции, вы всегда найдете четвертое, просто перемножив известные по диагонали и разделив на оставшееся.', 
                example: 'x / 10 = 4 / 5. По правилу креста: 5 * x = 10 * 4. 5x = 40. x = 8.' 
              },
              { 
                topic: 'Масштаб: мир на ладони', 
                theory: 'Масштаб 1 : 100 000 означает, что всё в реальности в 100 000 раз больше, чем на карте. В 1 см на карте спрятан 1 км на земле (потому что в 1 км — 100 000 см). Это позволяет нам рисовать целые страны на маленьком листе бумаги, сохраняя все пропорции.', 
                example: 'На карте масштаб 1:5000. Расстояние между домами 2 см. Реальность: 2 * 5000 = 10 000 см = 100 метров.' 
              }
            ]
          },
          {
            title: '3. Отрицательные числа: ниже нуля',
            points: [
              { 
                topic: 'Положительные и Отрицательные числа', 
                theory: 'Представьте термометр или лифт. Отрицательные числа — это то, что ниже нуля. Модуль числа — это его "вес" без учета знака, или расстояние до него от нуля. У -5 модуль равен 5. Сложение чисел с разными знаками — это как битва: побеждает тот, чьё число больше по модулю, и его знак остается, а сами числа вычитаются (из большего меньшее).', 
                example: '-10 + 4. Кто сильнее? 10 больше 4, значит знак будет МИНУС. 10 - 4 = 6. Ответ: -6.' 
              },
              { 
                topic: 'Координатная плоскость: карта из чисел', 
                theory: 'Здесь работают две оси: X (вправо-влево) и Y (вверх-вниз). Каждая точка — это адрес из двух чисел (x; y). Первое число всегда говорит, куда идти по горизонтали, второе — куда по вертикали. Это как игра "Морской бой", только бесконечная и математически точная.', 
                example: 'Точка (-2; 3): Идем на 2 шага влево и на 3 шага вверх от центра.' 
              }
            ]
          }
        ]
      },
      {
        grade: '7 КЛАСС',
        intro: 'Рождение настоящей Алгебры и классической Геометрии.',
        sections: [
          {
            title: '1. Алгебра: выражения и формулы',
            points: [
              { 
                topic: 'Степень с натуральным показателем', 
                theory: 'Когда мы перемножаем степени с одинаковым основанием (a² * a³), мы просто складываем показатели (a⁵). При делении — вычитаем. При возведении степени в степень — перемножаем. Главное помнить: любое число (кроме нуля) в нулевой степени — это всегда 1! Это одно из самых странных, но полезных правил в математике.', 
                example: ' (2³)² = 2⁶ = 64. А 125⁰ = 1.' 
              },
              { 
                topic: 'Многочлены: конструктор из букв', 
                theory: 'Многочлен — это сумма одночленов (чисел с буквами, например 2x). Мы можем их складывать (приводя подобные слагаемые — это как считать отдельно яблоки и груши) и перемножать. Умножить многочлен на многочлен — значит каждый член одного умножить на каждый член другого. Главное — не потерять знаки!', 
                example: '(x + 2)(x - 3) = x² - 3x + 2x - 6 = x² - x - 6.' 
              },
              { 
                topic: 'ФСУ — формулы быстрого счета', 
                theory: 'Формулы Сокращенного Умножения — это чит-коды алгебры. (a+b)² = a² + 2ab + b². Это избавляет от долгого перемножения скобок. Другая важная формула: a² - b² = (a-b)(a+b). Разность квадратов — это ключ к решению тысяч сложных задач. Выучите их как таблицу умножения, и алгебра станет в три раза легче.', 
                example: '99² = (100 - 1)² = 100² - 2*100*1 + 1² = 10000 - 200 + 1 = 9801. Проверьте на калькуляторе — магия работает!' 
              }
            ]
          },
          {
            title: '2. Линейные уравнения и функции',
            points: [
              { 
                topic: 'Линейное уравнение: поиск неизвестного', 
                theory: 'ax + b = c. Ваша цель — оставить "x" в гордом одиночестве на одной стороне равенства. Переносим слагаемые через знак "=", меняя их знак на противоположный. Умножение превращается в деление. Уравнение — это весы: что сделали слева, то обязаны сделать и справа.', 
                example: '2x + 5 = 11. Переносим 5: 2x = 11 - 5 => 2x = 6. Делим на 2: x = 3.' 
              },
              { 
                topic: 'Линейная функция и её график', 
                theory: 'y = kx + b. График такой функции — всегда прямая линия. Число "k" отвечает за наклон (чем больше k, тем круче подъем). Число "b" показывает, где прямая пересекает вертикальную ось Y. Чтобы построить прямую, достаточно найти всего две точки. Прямая — это визуализация того, как одна величина стабильно зависит от другой.', 
                example: 'y = 2x + 1. Если x=0, то y=1. Если x=1, то y=3. Соединяем точки (0;1) и (1;3) — прямая готова.' 
              }
            ]
          },
          {
            title: '3. Геометрия: Треугольники',
            points: [
              { 
                topic: 'Признаки равенства треугольников', 
                theory: 'Нам не обязательно замерять всё. Треугольники равны, если: 1) У них равны две стороны и угол между ними. 2) У них равна сторона и два прилежащих угла. 3) У них равны все три стороны. Зная это, мы можем доказывать равенство сложных фигур, изучив всего пару элементов.', 
                example: 'Если вы построили два треугольника со сторонами 3см, 4см и углом 30° между ними — они будут идентичны.' 
              },
              { 
                topic: 'Сумма углов и Параллельность', 
                theory: 'Запомните навсегда: сумма всех трех углов в любом треугольнике — ровно 180 градусов. Ни больше, ни меньше. Если прямые параллельны и их пересекает третья прямая — образуются пары равных углов (накрест лежащие и соответственные). Это база для проектирования всего: от дорог до звездных карт.', 
                example: 'В треугольнике два угла по 60°. Третий угол = 180 - 60 - 60 = 60°. Этот треугольник правильный.' 
              }
            ]
          }
        ]
      },
      {
        grade: '8 КЛАСС',
        intro: 'Освоение квадратных корней, уравнений и секретов площадей фигур.',
        sections: [
          {
            title: '1. Алгебра: Корни и Квадраты',
            points: [
              { 
                topic: 'Квадратные корни: действие наоборот', 
                theory: 'Извлечение корня — это поиск числа, которое при умножении на само себя даст подкоренное число. √25 = 5. Корень из отрицательного числа среди обычных чисел извлечь нельзя — это "запрещенная территория". Важное свойство: корень из произведения равен произведению корней. Это позволяет упрощать очень страшные выражения.', 
                example: '√50 = √(25 * 2) = √25 * √2 = 5√2.' 
              },
              { 
                topic: 'Квадратные уравнения: Дискриминант', 
                theory: 'ax² + bx + c = 0. Чтобы найти корни, мы вычисляем Дискриминант (D = b² - 4ac). Если D > 0 — два корня. Если D = 0 — один корень. Если D < 0 — корней нет. Формула корней: x = (-b ± √D) / 2a. Это универсальный ключ к решению большинства задач в физике и инженерии.', 
                example: 'x² - 5x + 6 = 0. a=1, b=-5, c=6. D = 25 - 4*1*6 = 1. x = (5 ± 1)/2. Ответ: 3 и 2.' 
              },
              { 
                topic: 'Теорема Виета: магия коэффициентов', 
                theory: 'Для приведенного уравнения (где перед x² стоит единица) сумма корней равна второму коэффициенту с противоположным знаком, а произведение — свободному члену. x₁ + x₂ = -b, x₁ * x₂ = c. Это позволяет угадывать корни за две секунды, не считая дискриминант.', 
                example: 'x² - 7x + 10 = 0. Сумма 7, произведение 10. Числа 2 и 5. Готово!' 
              },
              { 
                topic: 'Неравенства и Метод интервалов', 
                theory: 'Для решения квадратных и рациональных неравенств используется метод интервалов. Приравниваем выражение к нулю, находим корни (точки смены знака), отмечаем их на оси и определяем знаки на получившихся интервалах. Точки знаменателя всегда "выколоты". Если знак неравенства < 0, берем интервалы с минусом.', 
                example: '(x - 3)(x + 2) < 0. Корни: 3 и -2. Ось разбита: (-∞; -2), (-2; 3), (3; +∞). На среднем интервале знак минус. Ответ: (-2; 3).' 
              }
            ]
          },
          {
            title: '2. Геометрия: Фигуры и Площади',
            points: [
              { 
                topic: 'Четырехугольники: семья параллелограммов', 
                theory: 'Параллелограмм — это когда противоположные стороны параллельны. Прямоугольник — это "правильный" параллелограмм с углами 90°. Ромб — параллелограмм, у которого все стороны равны (его диагонали пересекаются под прямым углом — это важно!). Квадрат — это идеальный гибрид: и сторон, и углов у него поровну и они правильные.', 
                example: 'В ромбе со стороной 5 одна диагональ 6, другая 8. Его площадь = (6*8)/2 = 24.' 
              },
              { 
                topic: 'Теорема Пифагора: фундамент геометрии', 
                theory: 'Работает только в прямоугольном треугольнике. Квадрат гипотенузы (самой длинной стороны) равен сумме квадратов катетов: c² = a² + b². Это самая знаменитая теорема в мире. Она позволяет найти любое расстояние, если вы знаете две стороны прямоугольного треугольника.', 
                example: 'Катеты 3 и 4. Гипотенуза² = 3² + 4² = 9 + 16 = 25. Сама гипотенуза = 5.' 
              }
            ]
          }
        ]
      },
      {
        grade: '9 КЛАСС',
        intro: 'Подготовка к экзаменам, прогрессии и тригонометрия треугольника.',
        sections: [
          {
            title: '1. Алгебра: Функции и Прогрессии',
            points: [
              { 
                topic: 'Квадратичная функция и Парабола', 
                theory: 'y = ax² + bx + c. График — парабола. Если a > 0 — ветви смотрят вверх (улыбка), если a < 0 — вниз. Вершина параболы находится по формуле x = -b/2a. Парабола — это траектория брошенного мяча или полета ракеты. Знать её свойства — значит понимать законы движения в нашем мире.', 
                example: 'y = x² - 2x + 1. Вершина в x = 2/2 = 1. При x=1, y=0. Это парабола, касающаяся оси X одной точкой.' 
              },
              { 
                topic: 'Арифметическая прогрессия: шаг за шагом', 
                theory: 'Это последовательность чисел, где каждое следующее получается из предыдущего прибавлением одного и того же числа "d" (разность). Формула любого члена: aₙ = a₁ + d(n-1). Это как лестница с одинаковыми ступенями. Сумма всех членов ищется через полусумму первого и последнего, умноженную на их количество.', 
                example: '1, 3, 5, 7... a₁=1, d=2. Десятый член: 1 + 2*(10-1) = 19.' 
              },
              { 
                topic: 'Геометрическая прогрессия: взрывной рост', 
                theory: 'Здесь каждое число умножается на одно и то же число "q" (знаменатель). 1, 2, 4, 8, 16... Это происходит при распространении вирусов, делении клеток или в сложных процентах в банке. Геометрическая прогрессия растет невероятно быстро.', 
                example: 'b₁=2, q=3. Четвертый член: 2 * 3³ = 2 * 27 = 54.' 
              },
              { 
                topic: 'Системы нелинейных уравнений', 
                theory: 'Система из двух уравнений, где поневоле встречаются квадраты или умножение переменных (xy). Решаются методом подстановки: выражаем x из более простого линейного уравнения и вставляем в сложное. Геометрически это означает поиск точек пересечения, например, прямой и параболы или окружности.', 
                example: 'Система: y - x = 2 и y = x². Подставляем y: x² - x - 2 = 0. Корни x=2 и x=-1. Две точки пересечения.' 
              }
            ]
          },
          {
            title: '2. Геометрия: Тригонометрия и Векторы',
            points: [
              { 
                topic: 'Теоремы синусов и косинусов', 
                theory: 'Это расширение теоремы Пифагора на ЛЮБЫЕ треугольники. Теорема косинусов: a² = b² + c² - 2bc*cos(A). Она позволяет найти сторону, если известны две другие и угол между ними. Теорема синусов говорит: стороны треугольника пропорциональны синусам противолежащих углов. С этими двумя инструментами вы можете "разгадать" любой треугольник во Вселенной.', 
                example: 'Две стороны 3 и 4, угол между ними 60°. Третья сторона² = 9 + 16 - 2*3*4*cos(60°) = 25 - 12 = 13. Сторона = √13.' 
              },
              { 
                topic: 'Векторы: величина и направление', 
                theory: 'Вектор — это не просто число, а стрелка. У него есть длина и направление. Мы можем их складывать по правилу треугольника или параллелограмма. Скалярное произведение векторов позволяет узнать угол между ними. Векторы — это основной язык физики: сила, скорость, ускорение — всё это векторы.', 
                example: 'Вектор a(3;4) имеет длину √(3²+4²) = 5.' 
              }
            ]
          }
        ]
      },
      {
        grade: '10 КЛАСС',
        intro: 'Мир тригонометрических функций, логарифмов и начало стереометрии.',
        sections: [
          {
            title: '1. Анализ: Тригонометрия и Степени',
            points: [
              { 
                topic: 'Тригонометрический круг и функции', 
                theory: 'Забудьте о треугольниках, теперь тригонометрия — это движение по кругу. Синус — это координата Y на круге, косинус — координата X. Функции периодичны: они повторяются через каждые 360 градусов (2π). Это описывает все волны в мире: от звука в наушниках до света звезд. Главное тождество: sin²x + cos²x = 1.', 
                example: 'sin(30°) = 1/2. Это значит на высоте половины радиуса мы находимся в этой точке круга.' 
              },
              { 
                topic: 'Логарифмы: поиск степени', 
                theory: 'Логарифм logₐ(b) — это ответ на вопрос: "в какую степень надо возвести число a, чтобы получить b?". log₂(8) = 3, потому что 2 в кубе — это 8. Логарифмы были созданы, чтобы превращать сложное умножение в простое сложение (log(xy) = log x + log y). Без логарифмов невозможна современная навигация или расчет радиоактивного распада.', 
                example: 'log₅(25) = 2. log₁₀(1000) = 3.' 
              }
            ]
          },
          {
            title: '2. Стереометрия: Фигуры в пространстве',
            points: [
              { 
                topic: 'Аксиомы и Параллельность', 
                theory: 'В пространстве через три точки, не лежащие на одной прямой, проходит ровно одна плоскость (поэтому табуретка на 3 ножках никогда не качается!). Появляются скрещивающиеся прямые — это те, что не параллельны, но и никогда не встретятся (как дороги на разных уровнях развязки). Понимать это — значит уметь мыслить в 3D.', 
                example: 'В кубе ребра из разных граней часто являются скрещивающимися.' 
              },
              { 
                topic: 'Перпендикулярность в 3D', 
                theory: 'Самое важное здесь — Теорема о трех перпендикулярах. Она связывает перпендикуляры к плоскости, наклонные и их проекции. Это мост между плоской и объемной геометрией. Если вы её понимаете, значит, вы "видите" пространство как настоящий инженер.', 
                example: 'Фонарный столб стоит перпендикулярно земле (плоскости). Его тень — это проекция.' 
              }
            ]
          }
        ]
      },
      {
        grade: '11 КЛАСС',
        intro: 'Высшая математика в школе: производные, интегралы и тела вращения.',
        sections: [
          {
            title: '1. Основы мат. анализа',
            points: [
              { 
                topic: 'Производная: скорость перемен', 
                theory: 'Производная f\'(x) — это скорость изменения функции. Если функция — это расстояние, то производная — это скорость. Если функция — это прибыль, то производная показывает, как быстро эта прибыль растет или падает. В точках, где производная равна нулю, функция достигает своих пиков или дна (экстремумы). Это основа всей современной экономики и техники.', 
                example: 'f(x) = x². Производная f\'(x) = 2x. В точке x=5 скорость роста равна 10.' 
              },
              { 
                topic: 'Интеграл: сумма бесконечно малых', 
                theory: 'Интеграл — это действие, обратное производной. Он позволяет найти площадь любой криволинейной фигуры или объем сложного тела. Формула Ньютона-Лейбница связывает интеграл и первообразную. Красиво говоря: производная дробит мир на мелкие мгновения, а интеграл собирает его воедино.', 
                example: 'Интеграл от функции f(x)=x — это x²/2 + C. Мы вернулись от скорости к пройденному пути.' 
              }
            ]
          },
          {
            title: '2. Стереометрия: Тела вращения',
            points: [
              { 
                topic: 'Цилиндр, Конус, Шар', 
                theory: 'Это фигуры, полученные вращением плоских фигур в пространстве. Цилиндр — крути прямоугольник. Конус — крути треугольник. Шар — крути круг. У каждой фигуры есть магические формулы объема. Например, в шар вписанный в цилиндр помещается ровно 2/3 его объема. Это открыл ещё Архимед и просил высечь этот чертеж на своей могиле.', 
                example: 'Объем шара V = (4/3)πR³. Если радиус 3, объем = 36π.' 
              },
              { 
                topic: 'Комплексные числа: воображаемая реальность', 
                theory: 'Числа, где i² = -1. Звучит безумно? Но без этих "воображаемых" чисел не работала бы ни одна электростанция, ни один смартфон и ни один квантовый компьютер. Они добавляют математике второе измерение, превращая обычную числовую прямую в огромную плоскость возможностей.', 
                example: '(3 + 2i) + (1 - i) = 4 + i. Считаем отдельно "земное" и отдельно "воображаемое".' 
              }
            ]
          }
        ]
      }
    ];


    el.innerHTML = `
      <h1>📚 Теория по математике (5–11 классы)</h1>
      <p class="theory-subtitle">Объяснения в формате учебника: по каждой теме + пример решения</p>
      <div class="theory-list">
        ${theory.map((g, idx) => `
          <details class="theory-grade">
            <summary>
              <span>${g.grade}</span>
              <small>${g.intro}</small>
            </summary>
            <div class="theory-sections">
              ${g.sections.map(s => `
                <article class="theory-topic">
                  <h3>${s.title}</h3>
                  <div class="theory-points">
                    ${s.points.map(p => `
                      <button
                        class="theory-topic-link"
                        data-grade="${g.grade}"
                        data-section="${s.title}"
                        data-topic="${p.topic}"
                        data-theory="${p.theory.replace(/"/g, '&quot;')}"
                        data-example="${p.example.replace(/"/g, '&quot;')}"
                      >
                        <span>${p.topic}</span>
                        <small>Открыть отдельную страницу темы →</small>
                      </button>
                    `).join('')}
                  </div>
                </article>
              `).join('')}
            </div>
          </details>
        `).join('')}
      </div>
      <div class="theory-actions">
        <button class="btn btn-primary btn-lg" id="theory-back-btn">← На главную</button>
      </div>
    `;

    $$('.theory-topic-link', el).forEach(btn => {
      btn.addEventListener('click', () => {
        renderTheoryTopicPage({
          grade: btn.dataset.grade,
          section: btn.dataset.section,
          topic: btn.dataset.topic,
          theory: btn.dataset.theory,
          example: btn.dataset.example
        });
        navigateTo('theory-topic');
      });
    });

    $('#theory-back-btn')?.addEventListener('click', () => navigateTo('home'));
  }

  function getGeometryDiagramSvg(topic, section) {
    const text = `${topic} ${section}`.toLowerCase();
    
    // 1. Алгебра: Метод интервалов
    if (text.includes('интервал') || text.includes('неравенств')) {
      return `
        <svg viewBox="0 0 400 100" class="geom-svg">
          <!-- Main coordinate line -->
          <line x1="20" y1="60" x2="380" y2="60" stroke="white" stroke-width="2"/>
          <!-- Arrow head for x-axis -->
          <polygon points="380,55 390,60 380,65" fill="white" />
          <text x="385" y="45" fill="white" font-size="14" font-weight="bold">x</text>

          <!-- Wave for intervals -->
          <path d="M60 60 Q110 10 160 60 Q210 110 260 60 Q310 10 360 60" stroke="var(--accent-blue)" fill="none" stroke-width="2" stroke-dasharray="4"/>
          
          <!-- Points -->
          <circle cx="160" cy="60" r="5" fill="white" stroke="white"/>
          <circle cx="260" cy="60" r="5" fill="none" stroke="white" stroke-width="2"/>
          
          <!-- Coordinates below the line -->
          <text x="155" y="85" fill="white" font-size="14">-2</text>
          <text x="255" y="85" fill="white" font-size="14">5</text>
          
          <!-- Signs above the line -->
          <text x="100" y="30" fill="var(--success)" font-size="20" font-weight="bold">+</text>
          <text x="205" y="85" fill="var(--danger)" font-size="20" font-weight="bold">-</text>
          <text x="310" y="30" fill="var(--success)" font-size="20" font-weight="bold">+</text>
          
          <text x="140" y="15" fill="rgba(255,255,255,0.7)" font-size="12">Пример: (x+2)(x-5) > 0</text>
        </svg>
      `;
    }

    // 2. Алгебра: Координатная плоскость и графики
    if (text.includes('координат') || text.includes('график') || text.includes('функция')) {
      return `
        <svg viewBox="0 0 200 200" class="geom-svg">
          <!-- X Axis -->
          <line x1="10" y1="100" x2="190" y2="100" stroke="white" stroke-width="1"/>
          <polygon points="190,95 200,100 190,105" fill="white" />
          
          <!-- Y Axis -->
          <line x1="100" y1="190" x2="100" y2="10" stroke="white" stroke-width="1"/>
          <polygon points="95,10 100,0 105,10" fill="white" />
          
          <!-- Labels -->
          <text x="185" y="115" fill="white" font-size="12">x</text>
          <text x="85" y="15" fill="white" font-size="12">y</text>
          
          <!-- Ticks -->
          <line x1="150" y1="98" x2="150" y2="102" stroke="white" stroke-width="1"/>
          <line x1="98" y1="50" x2="102" y2="50" stroke="white" stroke-width="1"/>

          <!-- Origin -->
          <circle cx="100" cy="100" r="2" fill="white"/>
          
          ${text.includes('парабол') ? '<path d="M60 40 Q100 180 140 40" stroke="var(--accent-blue)" fill="none" stroke-width="2"/>' : ''}
          ${text.includes('линейн') || text.includes('прямая') ? '<line x1="40" y1="160" x2="160" y2="40" stroke="var(--accent-blue)" stroke-width="2"/>' : ''}
        </svg>
      `;
    }

    // 3. Геометрия: Углы
    if (text.includes('угол')) {
      return `
        <svg viewBox="0 0 200 150" class="geom-svg">
          <line x1="40" y1="120" x2="180" y2="120" stroke="white" stroke-width="2"/>
          <line x1="40" y1="120" x2="150" y2="40" stroke="white" stroke-width="2"/>
          <path d="M80 120 A40 40 0 0 0 70 95" fill="none" stroke="var(--accent-blue)" stroke-width="2"/>
          <text x="85" y="110" fill="white">α</text>
        </svg>
      `;
    }

    // 4. Геометрия: Треугольники
    if (text.includes('треуг') || text.includes('пифагор')) {
      if (text.includes('прямоуг') || text.includes('пифагор')) {
        return `
          <svg viewBox="0 0 200 150" class="geom-svg">
            <polygon points="50,120 50,40 160,120" fill="none" stroke="white" stroke-width="2"/>
            <rect x="50" y="105" width="15" height="15" fill="none" stroke="var(--accent-blue)" stroke-width="1"/>
            <text x="35" y="85" fill="white">a</text>
            <text x="100" y="135" fill="white">b</text>
            <text x="110" y="75" fill="white">c</text>
          </svg>
        `;
      }
      return `
        <svg viewBox="0 0 200 150" class="geom-svg">
          <polygon points="100,30 40,120 160,120" fill="none" stroke="white" stroke-width="2"/>
          <line x1="100" y1="30" x2="100" y2="120" stroke="var(--accent-blue)" stroke-dasharray="4"/>
          <text x="105" y="80" fill="var(--accent-blue)">h</text>
          <text x="95" y="135" fill="white">a</text>
        </svg>
      `;
    }

    // 5. Геометрия: Четырехугольники
    if (text.includes('параллелограмм') || text.includes('ромб')) {
      return `
        <svg viewBox="0 0 200 150" class="geom-svg">
          <polygon points="60,40 180,40 140,120 20,120" fill="none" stroke="white" stroke-width="2"/>
          <line x1="60" y1="40" x2="60" y2="120" stroke="var(--accent-blue)" stroke-dasharray="4"/>
          <text x="65" y="85" fill="var(--accent-blue)">h</text>
          <text x="80" y="135" fill="white">a</text>
        </svg>
      `;
    }
    if (text.includes('трапеция')) {
      return `
        <svg viewBox="0 0 200 150" class="geom-svg">
          <polygon points="70,40 150,40 180,120 40,120" fill="none" stroke="white" stroke-width="2"/>
          <text x="105" y="30" fill="white">a</text>
          <text x="105" y="135" fill="white">b</text>
        </svg>
      `;
    }
    if (text.includes('прямоуг') || text.includes('квадрат')) {
      return `
        <svg viewBox="0 0 200 150" class="geom-svg">
          <rect x="40" y="40" width="120" height="80" fill="none" stroke="white" stroke-width="2"/>
          <text x="100" y="30" fill="white">a</text>
          <text x="170" y="85" fill="white">b</text>
        </svg>
      `;
    }

    // 6. Геометрия: Окружность
    if (text.includes('окруж') || text.includes('круг') || text.includes('шар') || text.includes('сфера')) {
      return `
        <svg viewBox="0 0 200 200" class="geom-svg">
          <circle cx="100" cy="100" r="60" fill="none" stroke="white" stroke-width="2"/>
          <line x1="100" y1="100" x2="160" y2="100" stroke="var(--accent-blue)" stroke-width="2"/>
          <circle cx="100" cy="100" r="3" fill="white"/>
          <text x="125" y="95" fill="white">r</text>
        </svg>
      `;
    }

    // 7. Стереометрия: Объемные фигуры
    if (text.includes('призма') || text.includes('куб') || text.includes('параллелепипед')) {
      return `
        <svg viewBox="0 0 200 200" class="geom-svg">
          <path d="M40 160 L140 160 L140 60 L40 60 Z" fill="none" stroke="white" stroke-width="2"/>
          <path d="M140 160 L180 130 L180 30 L140 60 M180 30 L80 30 L40 60" fill="none" stroke="white" stroke-width="2" stroke-opacity="0.6"/>
          <text x="90" y="180" fill="white">V = a * b * c</text>
        </svg>
      `;
    }
    if (text.includes('пирамида')) {
      return `
        <svg viewBox="0 0 200 200" class="geom-svg">
          <path d="M40 140 L120 140 L160 110 L80 110 Z" fill="none" stroke="white" stroke-opacity="0.5"/>
          <path d="M40 140 L100 30 L120 140 M100 30 L160 110" fill="none" stroke="white" stroke-width="2"/>
          <line x1="100" y1="30" x2="100" y2="125" stroke="var(--accent-blue)" stroke-dasharray="4"/>
          <text x="50" y="160" fill="white">V = (1/3) S_осн * h</text>
        </svg>
      `;
    }
    if (text.includes('конус')) {
      return `
        <svg viewBox="0 0 200 200" class="geom-svg">
          <ellipse cx="100" cy="150" rx="60" ry="20" fill="none" stroke="white" stroke-opacity="0.5"/>
          <path d="M40 150 L100 30 L160 150" fill="none" stroke="white" stroke-width="2"/>
          <line x1="100" y1="30" x2="100" y2="150" stroke="var(--accent-blue)" stroke-dasharray="4"/>
        </svg>
      `;
    }
    if (text.includes('цилиндр')) {
      return `
        <svg viewBox="0 0 200 200" class="geom-svg">
          <ellipse cx="100" cy="40" rx="60" ry="20" fill="none" stroke="white" stroke-width="2"/>
          <ellipse cx="100" cy="160" rx="60" ry="20" fill="none" stroke="white" stroke-opacity="0.5"/>
          <line x1="40" y1="40" x2="40" y2="160" stroke="white" stroke-width="2"/>
          <line x1="160" y1="40" x2="160" y2="160" stroke="white" stroke-width="2"/>
        </svg>
      `;
    }

    // 8. Векторы
    if (text.includes('вектор')) {
      return `
        <svg viewBox="0 0 200 150" class="geom-svg">
          <line x1="40" y1="120" x2="150" y2="50" stroke="var(--accent-blue)" stroke-width="3" marker-end="url(#arrowhead)"/>
          <text x="100" y="80" fill="white">ā</text>
        </svg>
      `;
    }

    // По умолчанию: простая сетка
    return `
      <svg viewBox="0 0 200 150" class="geom-svg">
        <rect x="20" y="20" width="160" height="110" fill="none" stroke="white" stroke-opacity="0.2" stroke-dasharray="2"/>
        <text x="60" y="80" fill="rgba(255,255,255,0.3)" font-size="10">Математическая модель</text>
      </svg>
    `;
  }

  function autoMathWrap(text) {
    if (!text) return '';
    const src = String(text);
    const tokens = src.split(/(\s+)/);
    return tokens.map(token => {
      if (!token.trim()) return token;
      const hasMathChars = /[=^√∫π±/*()+\-<>₀-₉]/.test(token);
      const hasLatinVar = /[a-z]/i.test(token);
      const hasDigit = /\d/.test(token);
      if (hasMathChars || (hasLatinVar && hasDigit)) {
        return `<span class="math-text">${token}</span>`;
      }
      return token;
    }).join('');
  }

  function renderTheoryTopicPage(topicData) {
    const el = $('#theory-topic-page');
    if (!el) return;
    const isGeometry = /геометр|угол|треуг|окруж|круг|пифагор|прямая|параллел|перпендик|вектор|призма|пирамида|объем|площад|сфера|шар|конус|цилиндр|интервал|координат|график/i.test(`${topicData.topic} ${topicData.section}`);
    const diagram = getGeometryDiagramSvg(topicData.topic, topicData.section);
    const advanced = getAdvancedTopicContent(topicData);
    const practiceExamples = getTopicPracticeExamples(topicData);
    const proofBlock = getProofOrDerivation(topicData);
    const controlQuestions = getControlQuestions(topicData);

    el.innerHTML = `
      <div class="theory-topic-wrap">
        <div class="theory-topic-breadcrumb">
          <button class="btn btn-ghost" id="topic-back-btn">← К списку тем</button>
          <span>${topicData.grade} • ${topicData.section}</span>
        </div>
        <h1>${topicData.topic}</h1>

        <div style="display:flex; flex-wrap:wrap; gap:20px; align-items:flex-start;">
          <div style="flex:1; min-width:300px; width: 100%;">
            <section class="theory-topic-card">
              <h2>Подробное объяснение</h2>
              <p>${autoMathWrap(topicData.theory)} В заданиях важно сначала определить тип задачи, затем выбрать нужное правило и только после этого переходить к вычислениям. Такой порядок снижает количество ошибок и делает решение понятным.</p>
              <p>Для закрепления темы полезно решить 3-5 задач одного типа: сначала по образцу, затем самостоятельно, а в конце — с самопроверкой по обратному действию или подстановке.</p>
            </section>
          </div>
          
          ${isGeometry ? `
          <div style="flex:0 1 400px; min-width:280px; position: sticky; top: 80px;">
            <section class="theory-topic-card">
              <h2>Иллюстрация к теме</h2>
              <div class="geom-diagram" style="background: rgba(0,0,0,0.2); padding: 5px; border-radius: 8px;">${diagram}</div>
            </section>
          </div>
          ` : ''}
        </div>

        ${advanced}

        <section class="theory-topic-card">
          <h2>Алгоритм решения</h2>
          <ol>
            <li>Выпишите из условия все известные данные и то, что нужно найти.</li>
            <li>Определите правило, формулу или признак, который относится к теме.</li>
            <li>Подставьте данные в формулу и выполните вычисления по шагам.</li>
            <li>Сделайте проверку: оценка, подстановка или обратное действие.</li>
          </ol>
        </section>

        <section class="theory-topic-card">
          <h2>Разбор примера</h2>
          <ol>
            <li><strong>Задача:</strong> ${autoMathWrap(topicData.example)}</li>
            <li><strong>Шаг 1:</strong> Определяем тему и правило, которое нужно применить.</li>
            <li><strong>Шаг 2:</strong> Выполняем вычисления последовательно, без пропуска промежуточных действий.</li>
            <li><strong>Шаг 3:</strong> Формулируем ответ и проверяем его на соответствие условию.</li>
          </ol>
        </section>

        <section class="theory-topic-card">
          <h2>Доказательство / вывод формулы</h2>
          <div class="theory-points">
            ${proofBlock.map(p => `<p>${p}</p>`).join('')}
          </div>
        </section>

        <section class="theory-topic-card">
          <h2>Мини-задачник: 3 примера с разбором</h2>
          <div class="theory-points">
            ${practiceExamples.map(ex => `
              <div class="theory-point">
                <h4>${ex.level}</h4>
                <p><strong>Задача:</strong> <span class="math-text">${ex.task}</span></p>
                <p><strong>Решение:</strong> <span class="math-text">${ex.solution}</span></p>
                <p><strong>Ответ:</strong> <span class="math-text">${ex.answer}</span></p>
              </div>
            `).join('')}
          </div>
        </section>

        <section class="theory-topic-card">
          <h2>Контрольные вопросы</h2>
          <ol>
            ${controlQuestions.map(q => `<li>${q}</li>`).join('')}
          </ol>
        </section>
      </div>
    `;

    $('#topic-back-btn')?.addEventListener('click', () => {
      renderTheory();
      navigateTo('theory');
    });
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function makeOptions(correct, variants = 4) {
    const opts = new Set([String(correct)]);
    while (opts.size < variants) {
      const dev = randomInt(1, 8);
      const val = Number(correct);
      if (!Number.isFinite(val)) break;
      const cand = Math.random() > 0.5 ? val + dev : val - dev;
      opts.add(String(cand));
    }
    return shuffle([...opts]);
  }

  function getPracticeBank() {
    return [
      // 5 КЛАСС
      { grade: '5', topic: 'topic-arith', label: 'Натуральные числа и дроби', gen: () => {
          const types = [
            () => { const a = randomInt(15, 30), b = randomInt(5, 12); return { question: `В магазине ${a} коробок по ${b} карандашей. Сколько всего карандашей?`, correct: String(a*b), type: 'math' }; },
            () => { const a = randomInt(2, 6), b = randomInt(3, 8)*10; return { question: `Поезд едет со скоростью ${b} км/ч. Какое расстояние он проедет за ${a} часа?`, correct: String(a*b), type: 'math' }; },
            () => { const num = randomInt(3, 9); return { question: `Возведите число ${num} в куб.`, correct: String(num**3), type: 'math' }; }
          ];
          return types[randomInt(0, types.length-1)]();
      }},
      { grade: '5', topic: 'topic-geom5', label: 'Наглядная геометрия', gen: () => {
          const types = [
            () => { const a = randomInt(3, 8), b = randomInt(4, 10); return { question: `Найдите объем прямоугольного параллелепипеда с измерениями ${a}, ${b} и 5.`, correct: String(a*b*5), type: 'geometry', draw: 'rect', dims: [a, b] }; },
            () => { const a = randomInt(3, 8), b = randomInt(4, 10); return { question: `Площадь прямоугольника равна ${a*b}, а одна из сторон ${a}. Найдите периметр.`, correct: String(2*(a+b)), type: 'geometry', draw: 'rect', dims: [a, '?'] }; }
          ];
          return types[randomInt(0, types.length-1)]();
      }},
      
      // 6 КЛАСС
      { grade: '6', topic: 'topic-frac6', label: 'Отношения и пропорции', gen: () => {
          const a = randomInt(2, 5), b = randomInt(6, 15), factor = randomInt(2, 5);
          return { question: `Из ${a} кг муки получается ${b} кг хлеба. Сколько кг хлеба получится из ${a * factor} кг муки?`, correct: String(b * factor), type: 'math' };
      }},
      { grade: '6', topic: 'topic-neg', label: 'Отрицательные числа', gen: () => {
          const a = randomInt(-15, -5), b = randomInt(5, 15);
          return { question: `Найдите расстояние (модуль разности) между точками A(${a}) и B(${b}) на координатной прямой.`, correct: String(b - a), type: 'math' };
      }},
      { grade: '6', topic: 'topic-geom6', label: 'Геометрия и логика', gen: () => {
          const r = randomInt(2, 8);
          return { question: `Длина окружности равна ${2*r}π. Найдите площадь круга, разделенную на π (ответ должен быть просто числом).`, correct: String(r*r), type: 'geometry', draw: 'circle' };
      }},

      // 7 КЛАСС
      { grade: '7', topic: 'topic-alg7', label: 'Алгебра (Формулы, Функции)', gen: (level = 'medium') => {
          const types = {
            basic: [
              () => { const x = randomInt(1, 5); return { question: `Вычислите значение выражения: 2x + 5 при x = ${x}.`, correct: String(2*x+5), type: 'math' }; },
              () => { const x = randomInt(1, 5); return { question: `Решите уравнение: x + ${x} = ${x*2}.`, correct: String(x), type: 'math' }; }
            ],
            medium: [
              () => { const n = randomInt(3, 9); return { question: `Вычислите значение выражения: (${n}² - 1) / (${n} - 1)`, correct: String(n + 1), type: 'math' }; },
              () => { const a = randomInt(2, 5), b = randomInt(1, 3); return { question: `Раскройте скобки: (${a}x + ${b})² и найдите коэффициент при x².`, correct: String(a*a), type: 'math' }; }
            ],
            hard: [
              () => { const a = randomInt(2, 4), b = randomInt(1, 3); return { question: `Решите уравнение: ${a}x + ${b} = ${a*5 + b}.`, correct: String(5), type: 'math' }; },
              () => { const a = randomInt(2, 4), b = randomInt(1, 3); return { question: `Разложите на множители: ${a*a}x² - ${b*b}.`, correct: `(${a}x-${b})(${a}x+${b})`, type: 'math' }; }
            ],
            olympiad: [
              () => { const a = randomInt(2, 3); return { question: `Найдите значение выражения: (x - 1)(x + 1)(x² + 1) при x = ${a}.`, correct: String(a**4 - 1), type: 'math' }; }
            ]
          };
          const selectedTypes = types[level] || types.medium;
          return selectedTypes[randomInt(0, selectedTypes.length-1)]();
      }},
      { grade: '7', topic: 'topic-geom7', label: 'Начала планиметрии (Треугольники)', gen: (level = 'medium') => {
          const types = {
            basic: [
              () => { const a = randomInt(30, 50), b = randomInt(40, 70); return { question: `В треугольнике два угла равны ${a}° и ${b}°. Найдите третий угол (в градусах).`, correct: String(180 - a - b), type: 'geometry', draw: 'angles', val: a }; },
              () => { const a = randomInt(30, 60); return { question: `В равнобедренном треугольнике угол при основании равен ${a}°. Найдите угол при вершине.`, correct: String(180 - 2*a), type: 'geometry', draw: 'tri', sides: ['?', '?', '?'] }; }
            ],
            medium: [
              () => { const a = randomInt(30, 50), b = randomInt(40, 70); return { question: `В треугольнике два угла равны ${a}° и ${b}°. Найдите внешний угол при третьей вершине (в градусах).`, correct: String(a + b), type: 'geometry', draw: 'angles', val: a }; },
              () => { const angle = randomInt(100, 140); const base = (180 - angle) / 2; return { question: `В равнобедренном треугольнике угол при вершине равен ${angle}°. Найдите угол при основании.`, correct: String(base), type: 'geometry', draw: 'tri', sides: ['?', '?', '?'] }; }
            ],
            hard: [
              () => { const a = randomInt(20, 40); return { question: `В прямоугольном треугольнике один из острых углов равен ${a}°. Найдите другой острый угол.`, correct: String(90 - a), type: 'geometry', draw: 'tri', sides: ['?', '?', '?'] }; },
              () => { const a = randomInt(5, 10); return { question: `В равнобедренном треугольнике боковая сторона равна ${a}, а основание ${a-2}. Найдите периметр.`, correct: String(2*a + (a-2)), type: 'geometry', draw: 'tri', sides: [a, a, a-2] }; }
            ],
            olympiad: [
              () => { const a = randomInt(60, 80); return { question: `В треугольнике ABC угол A равен ${a}°. Биссектрисы углов B и C пересекаются в точке I. Найдите угол BIC.`, correct: String(90 + a/2), type: 'geometry', draw: 'angles', val: a }; }
            ]
          };
          const selectedTypes = types[level] || types.medium;
          return selectedTypes[randomInt(0, selectedTypes.length-1)]();
      }},

      { grade: '8', topic: 'topic-alg8', label: 'Корни, Уравнения, Неравенства', gen: (level = 'medium') => {
          const types = {
            basic: [
              () => { const x = randomInt(4, 9); return { question: `Вычислите: √${x*x} + √16.`, correct: String(x + 4), type: 'math' }; },
              () => { const x1 = randomInt(1, 4), x2 = randomInt(5, 9); return { question: `Решите уравнение: (x - ${x1})(x - ${x2}) = 0. Найдите сумму корней.`, correct: String(x1 + x2), type: 'math' }; }
            ],
            medium: [
              () => { const x1 = randomInt(1, 4), x2 = randomInt(5, 9); return { question: `Решите неравенство методом интервалов: (x - ${x1})(x - ${x2}) < 0. В ответ запишите количество целых решений.`, correct: String(x2 - x1 - 1), type: 'intervals', roots: [x1, x2], targetSign: '<' }; },
              () => { const sum = randomInt(5, 15), prod = randomInt(4, 30); const arr = Array.from({length: sum}, (_, i) => i).filter(x => x * (sum - x) === prod); const max_r = arr.length ? Math.max(...arr) : sum; return { question: `По теореме Виета сумма корней равна ${sum}, а произведение ${prod}. Найдите больший корень.`, correct: String(max_r), type: 'math' }; }
            ],
            hard: [
              () => { const a = randomInt(2, 4); return { question: `Упростите выражение $$\\sqrt{${a*a * 2}} - ${a}\\sqrt{2}$$`, correct: '0', type: 'math' }; },
              () => { const x1 = -randomInt(1, 5), x2 = randomInt(1, 5); return { question: `Неравенство $x^2 + ${-(x1+x2)}x + ${x1*x2} \\le 0$. Найдите сумму наибольшего и наименьшего целого решения.`, correct: String(x1 + x2), type: 'math' }; }
            ],
            olympiad: [
              () => { const x = randomInt(2, 5); return { question: `Решите иррациональное уравнение: $$\\sqrt{x + ${x*x - x}} = ${x}$$.`, correct: String(x), type: 'math' }; }
            ]
          };
          const selectedTypes = types[level] || types.medium;
          return selectedTypes[randomInt(0, selectedTypes.length-1)]();
      }},

      { grade: '8', topic: 'topic-geom8', label: 'Четырехугольники и Подобие', gen: (level = 'medium') => {
          const types = {
            basic: [
              () => { const a = randomInt(4, 10), b = randomInt(5, 15); return { question: `В параллелограмме соседние стороны равны ${a} и ${b}. Найдите его периметр.`, correct: String((a + b) * 2), type: 'geometry', draw: 'rect', dims: [a, b] }; }
            ],
            medium: [
              () => { const a = randomInt(4, 10) * 2, b = randomInt(5, 15) * 2, h = randomInt(3, 8); return { question: `В трапеции основания равны ${a} и ${b}, а высота ${h}. Проведена средняя линия. Найдите площадь трапеции.`, correct: String((a + b) / 2 * h), type: 'geometry' }; },
              () => { const diag1 = randomInt(3, 6)*2, diag2 = randomInt(4, 8)*2; const squareSide = (diag1/2)**2 + (diag2/2)**2; return { question: `В ромбе диагонали равны ${diag1} и ${diag2}. Найдите квадрат стороны ромба. (Диагонали ромба пересекаются под прямым углом и делятся пополам).`, correct: String(squareSide), type: 'geometry' }; }
            ],
            hard: [
              () => { const k = randomInt(2, 4); const sum = randomInt(2, 5) * 10; return { question: `Биссектриса угла параллелограмма отсекает от него равнобедренный треугольник. Периметр параллелограмма равен ${sum}. Одна сторона больше другой в ${k} раза. Найдите бóльшую сторону.`, correct: String(sum / (2 * (k + 1)) * k), type: 'geometry' }; }
            ],
            olympiad: [
              () => { 
                const k = randomInt(2, 4); // QR = k * PQ
                const x = randomInt(2, 6); // PQ
                const ab = (2 * k - 1) * x;
                return { question: `В параллелограмме PQRS известно, что QR = ${k}PQ. Биссектрисы углов P и Q пересекают прямую RS в точках A и B соответственно. Найдите бóльшую сторону параллелограмма, если AB = ${ab}.`, correct: String(k * x), type: 'geometry' }; 
              }
            ]
          };
          const selectedTypes = types[level] || types.medium;
          return selectedTypes[randomInt(0, selectedTypes.length-1)]();
      }},

      // 9 КЛАСС
      { grade: '9', topic: 'topic-alg9', label: 'Прогрессии и Системы', gen: () => {
          const a1 = randomInt(2, 5), d = randomInt(2, 4);
          return { question: `Арифм. прогрессия: a₁=${a1}, разность d=${d}. Найдите a₅.`, correct: String(a1 + 4*d), type: 'math' };
      }},
      { grade: '9', topic: 'topic-geom9', label: 'Углы и Площади', gen: () => {
          const sides = [3, 4, 5].map(x => x * randomInt(2, 4));
          return { question: `Стороны прямоугольного треугольника равны ${sides[0]}, ${sides[1]} и гипотенуза ${sides[2]}. Найдите площадь.`, correct: String(sides[0] * sides[1] / 2), type: 'geometry', draw: 'tri', sides: sides };
      }},

      // 10 КЛАСС
      { grade: '10', topic: 'topic-alg10', label: 'Тригонометрия и функции', gen: () => {
          return { question: `Если sin(α) = 0.6, α - острый угол прямоугольного треугольника, найдите cos(α). Запишите в виде десятичной дроби (пример: 0,5).`, correct: '0.8', type: 'math' };
      }},
      { grade: '10', topic: 'topic-geom10', label: 'Стереометрия (Многогранники)', gen: () => {
          const a = randomInt(4, 9);
          return { question: `Ребро правильного тетраэдра (пирамида, у которой все 4 грани - правильные треугольники) равно ${a}. Найдите сумму длин всех его ребер.`, correct: String(a * 6), type: 'math' };
      }},

      // 11 КЛАСС
      { grade: '11', topic: 'topic-alg11', label: 'Логарифмы, Производная, Интеграл', gen: () => {
          const base = randomInt(2, 5), pow = randomInt(2, 4);
          return { question: `Вычислите log_${base}(${base**pow}) + 1.`, correct: String(pow + 1), type: 'math' };
      }},
      { grade: '11', topic: 'topic-geom11', label: 'Тела вращения и Векторы', gen: () => {
          const r = randomInt(2, 6), h = randomInt(3, 8);
          return { question: `Высота цилиндра ${h}, радиус основания ${r}. Найдите объем, деленный на π.`, correct: String(r * r * h), type: 'geometry', draw: 'cube' };
      }},
      { grade: '11', topic: 'topic-complex', label: 'Комплексные числа', gen: () => {
          const re = randomInt(1, 8), im = randomInt(1, 6);
          return { question: `Дано z = ${re} + ${im}i. Вычислите произведение Re(z) на Im(z).`, correct: String(re * im), type: 'math' };
      }}
    ];
  }

  function pickPracticeTask(filter, level = 'medium') {
    const bank = getPracticeBank();
    let pool = bank;
    
    // Кумулятивная логика: если выбрана тема, включаем её и случайно 20% шанса на любую ПРОШЛУЮ тему
    if (filter !== 'all') {
      const topicIndex = bank.findIndex(t => t.topic === filter);
      if (topicIndex >= 0) {
        // 70% chance to pick the current topic, 30% chance to pick from an older topic
        if (Math.random() < 0.3 && topicIndex > 0) {
          const oldIndex = randomInt(0, topicIndex - 1);
          pool = [bank[oldIndex]];
        } else {
          pool = [bank[topicIndex]];
        }
      } else if (filter.startsWith('grade-')) {
        const g = filter.split('-')[1];
        pool = bank.filter(t => parseInt(t.grade) <= parseInt(g)); // Cumulative grade
      }
    }
    if (!pool.length) pool = bank;

    // Fix repeating bug: maintain history
    if (!state.practice.history) state.practice.history = [];
    
    let iterations = 0;
    let selected;
    let taskGen;
    
    do {
      taskGen = pool[randomInt(0, pool.length - 1)];
      selected = taskGen.gen(level);
      iterations++;
    } while (state.practice.history.includes(selected.question) && iterations < 10);

    state.practice.history.push(selected.question);
    if (state.practice.history.length > 20) state.practice.history.shift();
    
    return selected;
  }

  const MathKeyboard = {
    input: '',
    targetElement: null,
    displayElement: null,
    
    init() {
      $$('.key').forEach(key => {
        key.addEventListener('click', () => this.handleKey(key.dataset.val));
      });
      $('#keyboard-submit')?.addEventListener('click', () => this.submit());
      window.addEventListener('keydown', (e) => {
        const kb = $('#math-keyboard');
        if (!kb || kb.classList.contains('hidden')) return;
        if (e.key >= '0' && e.key <= '9') this.handleKey(e.key);
        if (e.key === 'x' || e.key === 'y') this.handleKey(e.key);
        if (['+', '-', '*', '/', '^', '(', ')', '.', ',', '<', '>'].includes(e.key)) this.handleKey(e.key);
        if (e.key === 'Backspace') this.handleKey('back');
        if (e.key === 'Enter') this.submit();
      });
    },
    
    show(target, display) {
      this.input = '';
      this.targetElement = target;
      this.displayElement = display;
      this.updateDisplay();
      const kb = $('#math-keyboard');
      if (kb) {
        kb.classList.add('visible');
        kb.classList.remove('hidden');
      }
    },
    
    hide() {
      const kb = $('#math-keyboard');
      if (kb) {
        kb.classList.remove('visible');
        kb.classList.add('hidden');
      }
    },
    
    handleKey(val) {
      if (!val) return;
      if (val === 'back') {
        this.input = this.input.slice(0, -1);
      } else if (val === 'clear') {
        this.input = '';
      } else {
        let p = val;
        if (val === 'sqrt') p = '√(';
        if (val === 'log') p = 'log(';
        this.input += p;
      }
      this.updateDisplay();
      playSound('correct');
    },
    
    updateDisplay() {
      if (this.displayElement) {
        this.displayElement.textContent = this.input || '|';
      }
    },
    
    submit() {
      if (this.targetElement) {
        this.targetElement(this.input);
      }
    }
  };

  function renderPracticeTask() {
    const mount = $('#practice-task');
    const task = state.practice.currentTask;
    if (!mount || !task) return;
    
    mount.innerHTML = `
      <div class="practice-header-actions" style="display:flex;justify-content:flex-end;margin-bottom:12px">
           <button class="btn btn-ghost btn-sm" id="kb-toggle-btn" style="border:1px solid rgba(255,255,255,0.1)">⌨️ Переключить клавиатуру</button>
      </div>
      <div class="practice-problem-container">
        <div class="practice-q" style="font-size:1.2rem; margin-bottom:15px; line-height:1.5">${task.question}</div>
        ${task.type === 'intervals' ? renderIntervalSVG(task.roots, task.targetSign) : ''}
        ${task.type === 'geometry' ? renderPracticeGeomSVG(task) : ''}
        <div class="math-input-display" id="math-input-view" style="font-size:1.4rem; padding:15px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:10px; margin:20px 0">|</div>
      </div>
      <div class="practice-feedback" id="practice-feedback" style="min-height:24px; margin-bottom:15px; font-weight:bold"></div>
      <div class="practice-actions-row">
        <button class="btn btn-primary" id="practice-next-btn" disabled>Следующая задача</button>
      </div>
    `;

    $('#kb-toggle-btn').addEventListener('click', () => {
       const kb = $('#math-keyboard');
       if (kb) {
         if (kb.classList.contains('hidden')) {
           kb.classList.remove('hidden'); kb.classList.add('visible');
         } else {
           kb.classList.add('hidden'); kb.classList.remove('visible');
         }
       }
    });

    MathKeyboard.show((val) => {
      checkPracticeAnswer(val);
    }, $('#math-input-view'));

    $('#practice-next-btn').addEventListener('click', () => {
      state.practice.currentTask = pickPracticeTask(state.practice.filter);
      renderPracticeTask();
    });
  }

  function renderIntervalSVG(roots, sign) {
    const sorted = [...roots].sort((a, b) => a - b);
    const min = sorted[0], max = sorted[1];
    return `
      <svg class="interval-svg" viewBox="0 0 500 120" style="margin: 20px auto; display: block; max-width: 100%;">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="white" />
          </marker>
        </defs>
        <line x1="50" y1="80" x2="450" y2="80" stroke="white" stroke-width="2" marker-end="url(#arrowhead)"/>
        <path d="M100 80 Q175 20 250 80 Q325 20 400 80" stroke="var(--accent-blue)" fill="none" stroke-width="2" stroke-dasharray="4"/>
        <circle cx="150" cy="80" r="6" fill="${sign === '>' ? 'none' : 'white'}" stroke="white" stroke-width="2"/>
        <circle cx="350" cy="80" r="6" fill="${sign === '>' ? 'none' : 'white'}" stroke="white" stroke-width="2"/>
        <text x="145" y="110" fill="white" font-size="14">${min}</text>
        <text x="345" y="110" fill="white" font-size="14">${max}</text>
        <text x="80" y="50" fill="var(--success)" font-weight="bold">+</text>
        <text x="245" y="50" fill="var(--danger)" font-weight="bold">-</text>
        <text x="410" y="50" fill="var(--success)" font-weight="bold">+</text>
      </svg>
    `;
  }

  function renderPracticeGeomSVG(task) {
    if (task.draw === 'angles') {
      return `
        <svg viewBox="0 0 300 150" class="geom-svg-practice" style="display:block;margin:10px auto;max-width:100%">
          <line x1="50" y1="120" x2="250" y2="120" stroke="white" stroke-width="2"/>
          <line x1="50" y1="120" x2="180" y2="40" stroke="white" stroke-width="2"/>
          <path d="M90 120 A40 40 0 0 0 80 100" fill="none" stroke="var(--accent-blue)" stroke-width="2"/>
          <text x="95" y="110" fill="white">${task.val || '?'}</text>
          <text x="130" y="140" fill="rgba(255,255,255,0.7)">Найти смежный угол</text>
        </svg>
      `;
    }
    if (task.draw === 'tri') {
      return `
        <svg viewBox="0 0 300 200" class="geom-svg-practice" style="display:block;margin:10px auto;max-width:100%">
          <polygon points="60,150 60,50 240,150" fill="none" stroke="white" stroke-width="2"/>
          <rect x="60" y="135" width="15" height="15" fill="none" stroke="var(--accent-blue)"/>
          <text x="35" y="105" fill="white">${task.sides[0]}</text>
          <text x="140" y="170" fill="white">${task.sides[1]}</text>
          <text x="160" y="95" fill="white">${task.sides[2]}</text>
        </svg>
      `;
    }
    if (task.draw === 'cube') {
      return `
        <svg viewBox="0 0 300 200" class="geom-svg-practice" style="display:block;margin:10px auto;max-width:100%">
          <path d="M80 150 L180 150 L180 50 L80 50 Z" fill="none" stroke="white" stroke-width="2"/>
          <path d="M180 150 L220 120 L220 20 L180 50 M220 20 L120 20 L80 50" fill="none" stroke="white" stroke-width="2" stroke-opacity="0.6"/>
          <text x="130" y="170" fill="white">a = ${task.side}</text>
          <text x="140" y="110" fill="rgba(255,255,255,0.5)">Найти объем V</text>
        </svg>
      `;
    }
    if (task.draw === 'rect') {
      return `
        <svg viewBox="0 0 300 150" class="geom-svg-practice" style="display:block;margin:10px auto;max-width:100%">
          <rect x="50" y="30" width="200" height="100" fill="none" stroke="white" stroke-width="2"/>
          <text x="150" y="20" fill="white">${task.dims[0]}</text>
          <text x="260" y="85" fill="white">${task.dims[1]}</text>
          <text x="130" y="85" fill="rgba(255,255,255,0.5)">Найти S</text>
        </svg>
      `;
    }
    return '';
  }

  function checkPracticeAnswer(chosen) {
    const task = state.practice.currentTask;
    
    // Smart math comparison
    const norm = (s) => String(s)
      .toLowerCase()
      .replace(/\s+/g, '')              // Remove spaces
      .replace(/,/g, ';')               // Use ; as standard separator for intervals
      .replace(/\|/g, ';')              // Handle | pipe as separator
      .replace(/или/g, ';')             // Handle Russian 'or'
      .replace(/\./g, ',')              // For consistency, normalize decimals
      .trim();

    const inputNorm = norm(chosen);
    const targetNorm = norm(task.correct);
    
    // Basic structural match
    let ok = inputNorm === targetNorm;

    // Advanced algebraic match (basic heuristic)
    if (!ok && task.type === 'formula') {
      const x = 2.71; // Test point
      const evalExpr = (expr) => {
        try {
          return eval(expr.replace(/x/g, `(${x})`).replace(/\^/g, '**'));
        } catch(e) { return NaN; }
      };
      
      const vInput = evalExpr(inputNorm);
      const vTarget = evalExpr(targetNorm);
      
      if (!isNaN(vInput) && !isNaN(vTarget) && Math.abs(vInput - vTarget) < 0.0001) {
        ok = true;
      }
    }

    state.practice.solved += 1;
    if (ok) state.practice.correct += 1;
    
    $('#practice-counters').textContent = `Решено: ${state.practice.solved} • Верно: ${state.practice.correct}`;
    const fb = $('#practice-feedback');
    fb.innerHTML = ok ? 
      `<span style="color:var(--success)">✅ Верно! Ответ: ${task.correct}</span>` : 
      `<span style="color:var(--danger)">❌ Неверно. Правильный ответ: ${task.correct}</span>`;
    
    $('#practice-next-btn').disabled = false;
    MathKeyboard.hide();
    playSound(ok ? 'win' : 'loss');
  }

  function renderPracticeMode() {
    const el = $('#screen-practice');
    if (!el) return;
    const bank = getPracticeBank();
    const topicOptions = [...new Map(bank.map(item => [item.topic, item.label || item.topic])).entries()];

    el.innerHTML = `
      <div class="theory-container" style="max-height: 100vh; overflow-y: auto;">
        <h1>📝 Практика (Все уровни)</h1>
        <p class="theory-subtitle">Задачи формируются кумулятивно: выбранная тема + пройденный материал.</p>
        <div class="theory-topic-card" style="max-width:760px;margin:0 auto 14px; display:flex; gap:16px; flex-wrap:wrap;">
          
          <div style="flex:1; min-width:200px;">
            <label style="display:block;margin-bottom:8px;color:var(--text-secondary)">Тема задач</label>
            <select id="practice-filter" class="form-input">
              <option value="all">Все темы вперемешку</option>
              <optgroup label="5 КЛАСС">
                <option value="topic-arith">Натуральные числа и дроби</option>
                <option value="topic-geom5">Наглядная геометрия</option>
              </optgroup>
              <optgroup label="6 КЛАСС">
                <option value="topic-frac6">Отношения и пропорции</option>
                <option value="topic-neg">Отрицательные числа</option>
                <option value="topic-geom6">Геометрия и логика</option>
              </optgroup>
            <optgroup label="7 КЛАСС">
              <option value="topic-alg7">Алгебра (Формулы, Функции)</option>
              <option value="topic-geom7">Начала планиметрии (Треугольники)</option>
            </optgroup>
            <optgroup label="8 КЛАСС">
              <option value="topic-alg8">Корни, Уравнения, Неравенства</option>
              <option value="topic-geom8">Четырехугольники и Подобие</option>
            </optgroup>
            <optgroup label="9 КЛАСС">
              <option value="topic-alg9">Прогрессии и Системы</option>
              <option value="topic-geom9">Углы и Площади</option>
            </optgroup>
            <optgroup label="10 КЛАСС">
              <option value="topic-alg10">Тригонометрия и функции</option>
              <option value="topic-geom10">Стереометрия (Многогранники)</option>
            </optgroup>
            <optgroup label="11 КЛАСС">
              <option value="topic-alg11">Логарифмы, Производная, Интеграл</option>
              <option value="topic-geom11">Тела вращения и Векторы</option>
              <option value="topic-complex">Комплексные числа</option>
            </optgroup>
          </select>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
            <button class="btn btn-primary" id="practice-start-btn">Начать</button>
            <button class="btn btn-ghost" id="practice-home-btn">← На главную</button>
          </div>
        </div>
        <div class="theory-topic-card" style="max-width:760px;margin:0 auto;">
          <div id="practice-counters">Решено: 0 • Верно: 0</div>
          <div id="practice-task" style="margin-top:12px;color:var(--text-secondary)">Нажмите «Начать»</div>
        </div>
      </div>
    `;

    $('#practice-filter').value = state.practice.filter;
    $('#practice-filter').addEventListener('change', (e) => {
      state.practice.filter = e.target.value;
    });
    $('#practice-start-btn').addEventListener('click', () => {
      state.practice.solved = 0;
      state.practice.correct = 0;
      $('#practice-counters').textContent = `Решено: 0 • Верно: 0`;
      state.practice.currentTask = pickPracticeTask(state.practice.filter);
      renderPracticeTask();
    });
    $('#practice-home-btn').addEventListener('click', () => navigateTo('home'));
  }

  function getProofOrDerivation(topicData) {
    const text = `${topicData.topic} ${topicData.section}`.toLowerCase();

    if (text.includes('квадратные уравнения')) {
      return [
        'Начинаем с общего вида: <span class="math-text">ax²+bx+c=0, a≠0</span>.',
        'Делим уравнение на <span class="math-text">a</span>: <span class="math-text">x²+(b/a)x+c/a=0</span>.',
        'Переносим свободный член и дополняем до квадрата: <span class="math-text">x²+(b/a)x+(b/2a)²=(b/2a)²-c/a</span>.',
        'Получаем <span class="math-text">(x+b/2a)²=(b²-4ac)/4a²</span>, где <span class="math-text">D=b²-4ac</span>.',
        'Извлекая корень, выводим формулу: <span class="math-text">x₁,₂=(-b±√D)/(2a)</span>.'
      ];
    }

    if (text.includes('теорема виета')) {
      return [
        'Пусть корни приведённого уравнения <span class="math-text">x²+px+q=0</span> равны <span class="math-text">x₁, x₂</span>.',
        'Тогда многочлен раскладывается: <span class="math-text">(x-x₁)(x-x₂)=x²-(x₁+x₂)x+x₁x₂</span>.',
        'Сравниваем коэффициенты с <span class="math-text">x²+px+q</span>.',
        'Получаем: <span class="math-text">x₁+x₂=-p</span>, <span class="math-text">x₁x₂=q</span>.',
        'Для <span class="math-text">ax²+bx+c=0</span> делим на <span class="math-text">a</span>: <span class="math-text">x₁+x₂=-b/a</span>, <span class="math-text">x₁x₂=c/a</span>.'
      ];
    }

    if (text.includes('метод интервалов') || text.includes('неравенства')) {
      return [
        'Знак произведения/дроби меняется только в корнях множителей нечётной кратности.',
        'На каждом интервале между критическими точками знак постоянен.',
        'Поэтому достаточно проверить одну тестовую точку на каждом интервале.',
        'Точки, где знаменатель равен нулю, исключаются из области определения.',
        'Это и обосновывает корректность метода интервалов.'
      ];
    }

    if (text.includes('теорема пифагора')) {
      return [
        'Рассмотрим квадрат со стороной <span class="math-text">a+b</span>, внутри которого размещены 4 равных прямоугольных треугольника.',
        'Площадь большого квадрата: <span class="math-text">(a+b)²</span>.',
        'Та же площадь: сумма площадей 4 треугольников и центрального квадрата со стороной <span class="math-text">c</span>: <span class="math-text">4*(ab/2)+c²</span>.',
        'Приравниваем: <span class="math-text">(a+b)²=2ab+c²</span>.',
        'После упрощения получаем: <span class="math-text">a²+b²=c²</span>.'
      ];
    }

    if (text.includes('формулы сокращенного умножения')) {
      return [
        'Квадрат суммы выводится через распределительное свойство:',
        '<span class="math-text">(a+b)²=(a+b)(a+b)=a²+ab+ba+b²=a²+2ab+b²</span>.',
        'Квадрат разности аналогично: <span class="math-text">(a-b)²=a²-2ab+b²</span>.',
        'Разность квадратов: <span class="math-text">(a-b)(a+b)=a²-b²</span>.',
        'Кубические формулы выводятся повторным умножением (или через биномиальные коэффициенты).'
      ];
    }

    return [
      'Для этой темы используем схему вывода: определение -> преобразование -> формула.',
      'Каждый шаг должен быть обоснован изученным свойством или теоремой.',
      'После вывода формулы проверяем её на простом числовом примере.',
      'Только после этого применяем формулу в задачах повышенного уровня.'
    ];
  }

  function getControlQuestions(topicData) {
    const text = `${topicData.topic} ${topicData.section}`.toLowerCase();

    if (text.includes('квадратные уравнения')) {
      return [
        'Что называется квадратным уравнением и чем оно отличается от линейного?',
        'Как выводится дискриминант и что он показывает?',
        'Как записывается формула корней через дискриминант?',
        'Как меняется формула при чётном коэффициенте b?',
        'Как проверить найденные корни через теорему Виета?'
      ];
    }

    if (text.includes('неравенства') || text.includes('метод интервалов')) {
      return [
        'Какие точки называются критическими в методе интервалов?',
        'Почему знак выражения постоянен внутри интервала?',
        'Какие точки никогда не входят в ответ?',
        'Когда корень числителя включается в ответ, а когда нет?',
        'Как проверить итоговое множество решений?'
      ];
    }

    if (text.includes('теорема пифагора')) {
      return [
        'Сформулируйте теорему Пифагора и обратную теорему.',
        'В каком треугольнике она применима напрямую?',
        'Как найти катет по гипотенузе и другому катету?',
        'Как использовать теорему в координатной плоскости?',
        'Какие типичные ошибки возникают в вычислениях корней?'
      ];
    }

    return [
      'Какое определение является ключевым для этой темы?',
      'Какой базовый алгоритм решения задач по этой теме?',
      'Какие 2-3 типичные ошибки совершают ученики?',
      'Как проверить правильность полученного ответа?',
      'Где эта тема применяется в задачах следующего класса?'
    ];
  }

  function getTopicPracticeExamples(topicData) {
    const text = `${topicData.topic} ${topicData.section}`.toLowerCase();
    const pack = (a, b, c) => [a, b, c];

    if (text.includes('квадратные уравнения')) {
      return pack(
        { level: 'Базовый', task: 'x² - 7x + 10 = 0', solution: 'D=49-40=9, x=(7±3)/2', answer: 'x₁=5, x₂=2' },
        { level: 'Средний', task: '3x² - 12x + 9 = 0', solution: 'D=144-108=36, x=(12±6)/6', answer: 'x₁=3, x₂=1' },
        { level: 'Повышенный', task: '2x² + 8x + 5 = 0', solution: 'D=64-40=24, x=(-8±√24)/4=(-8±2√6)/4', answer: 'x₁=(-4+√6)/2, x₂=(-4-√6)/2' }
      );
    }

    if (text.includes('линейное уравнение')) {
      return pack(
        { level: 'Базовый', task: '5x - 15 = 0', solution: '5x=15', answer: 'x=3' },
        { level: 'Средний', task: '3(2x-1)-5=10', solution: '6x-3-5=10 -> 6x=18', answer: 'x=3' },
        { level: 'Повышенный', task: '(x-2)/4 + (x+6)/8 = 3', solution: 'Умножаем на 8: 2(x-2)+x+6=24 -> 3x=22', answer: 'x=22/3' }
      );
    }

    if (text.includes('системы линейных уравнений')) {
      return pack(
        { level: 'Базовый', task: 'x+y=9, x-y=1', solution: 'Складываем: 2x=10, x=5; y=4', answer: '(5;4)' },
        { level: 'Средний', task: '2x+y=7, x-2y=-2', solution: 'Из второго x=2y-2; подставляем: 4y-4+y=7', answer: 'y=11/5, x=12/5' },
        { level: 'Повышенный', task: '3x-2y=4, 5x+2y=16', solution: 'Складываем: 8x=20, x=5/2; подстановка', answer: 'x=5/2, y=7/4' }
      );
    }

    if (text.includes('формулы сокращенного умножения')) {
      return pack(
        { level: 'Базовый', task: '(x+5)²', solution: 'x²+2*5x+25', answer: 'x²+10x+25' },
        { level: 'Средний', task: '49a²-81', solution: '(7a)²-9²=(7a-9)(7a+9)', answer: '(7a-9)(7a+9)' },
        { level: 'Повышенный', task: '(2x-3)³', solution: '(a-b)³=a³-3a²b+3ab²-b³, a=2x,b=3', answer: '8x³-36x²+54x-27' }
      );
    }

    if (text.includes('производная')) {
      return pack(
        { level: 'Базовый', task: 'f(x)=x³', solution: 'f\'(x)=3x²', answer: '3x²' },
        { level: 'Средний', task: 'f(x)=2x²-5x+1', solution: 'f\'(x)=4x-5', answer: '4x-5' },
        { level: 'Повышенный', task: 'f(x)=(x²+1)(x-3)', solution: 'f\'=2x(x-3)+(x²+1)', answer: '3x²-6x+1' }
      );
    }

    if (text.includes('интеграл')) {
      return pack(
        { level: 'Базовый', task: '∫ x dx', solution: 'x²/2 + C', answer: 'x²/2 + C' },
        { level: 'Средний', task: '∫ (3x²-4) dx', solution: 'x³-4x + C', answer: 'x³-4x + C' },
        { level: 'Повышенный', task: '∫(от 1 до 3) 2x dx', solution: '[x²]₁³=9-1', answer: '8' }
      );
    }

    if (text.includes('тригонометр')) {
      return pack(
        { level: 'Базовый', task: 'sin x = 0', solution: 'x=pi*k', answer: 'x=pi*k, k∈Z' },
        { level: 'Средний', task: 'cos x = 1/2', solution: 'x=±pi/3 + 2pi*k', answer: 'x=2pi*k±pi/3' },
        { level: 'Повышенный', task: '2sin x cos x = 1', solution: 'sin 2x=1 -> 2x=pi/2+2pi*k', answer: 'x=pi/4+pi*k' }
      );
    }

    if (text.includes('логарифмическая') || text.includes('показательная')) {
      return pack(
        { level: 'Базовый', task: 'log₂ 32', solution: '2^5=32', answer: '5' },
        { level: 'Средний', task: 'log₃ x = 2', solution: 'x=3²', answer: '9' },
        { level: 'Повышенный', task: '2^(x+1)=16', solution: '16=2^4 -> x+1=4', answer: 'x=3' }
      );
    }

    if (text.includes('прогрессии')) {
      return pack(
        { level: 'Базовый', task: 'a₁=4, d=3. Найти a₆', solution: 'a₆=4+5*3', answer: '19' },
        { level: 'Средний', task: 'b₁=2, q=3. Найти b₅', solution: 'b₅=2*3^4', answer: '162' },
        { level: 'Повышенный', task: 'a₁=5, d=2. Найти S₁₀', solution: 'a₁₀=23, S₁₀=(5+23)*10/2', answer: '140' }
      );
    }

    if (text.includes('дроб')) {
      return pack(
        { level: 'Базовый', task: '3/4 + 1/8', solution: '6/8+1/8', answer: '7/8' },
        { level: 'Средний', task: '5/6 - 1/4', solution: '10/12-3/12', answer: '7/12' },
        { level: 'Повышенный', task: '2 1/3 : 7/9', solution: '7/3 * 9/7', answer: '3' }
      );
    }

    if (text.includes('теорема пифагора')) {
      return pack(
        { level: 'Базовый', task: 'a=3, b=4. Найти c', solution: 'c=√(3²+4²)=√25', answer: '5' },
        { level: 'Средний', task: 'c=13, a=5. Найти b', solution: 'b=√(13²-5²)=√144', answer: '12' },
        { level: 'Повышенный', task: 'Катеты x и x+1, c=√41', solution: 'x²+(x+1)²=41 -> x²+x-20=0', answer: 'x=4 (катеты 4 и 5)' }
      );
    }

    if (/геометр|угол|треуг|окруж|круг|площад|объем|вектор|синусов|косинусов|призма|пирамида/i.test(text)) {
      return pack(
        { level: 'Базовый', task: 'Периметр треугольника со сторонами 5, 6, 7', solution: 'P=5+6+7', answer: '18' },
        { level: 'Средний', task: 'S прямоугольника 8×3', solution: 'S=ab=8*3', answer: '24' },
        { level: 'Повышенный', task: 'Длина окружности при r=4', solution: 'L=2pi r', answer: '8pi' }
      );
    }

    return pack(
      { level: 'Базовый', task: topicData.example, solution: 'Решаем по базовому правилу темы шаг за шагом.', answer: 'Числовой/алгебраический результат по условию' },
      { level: 'Средний', task: 'Задача аналогичного типа с изменёнными данными', solution: 'Повторяем алгоритм, контролируем порядок действий.', answer: 'Проверенный результат' },
      { level: 'Повышенный', task: 'Комбинированная задача на 2 правила темы', solution: 'Разбиваем на этапы и решаем последовательно.', answer: 'Итог после проверки' }
    );
  }

  function getAdvancedTopicContent(topicData) {
    const text = `${topicData.topic} ${topicData.section}`.toLowerCase();

    if (text.includes('формулы сокращенного умножения')) {
      return `
        <section class="theory-topic-card">
          <h2>Полный набор формул сокращённого умножения (7 класс)</h2>
          <p>Эти формулы используются для быстрого раскрытия скобок и разложения на множители.</p>
          <p class="math-text">(a+b)² = a² + 2ab + b²</p>
          <p class="math-text">(a-b)² = a² - 2ab + b²</p>
          <p class="math-text">a² - b² = (a-b)(a+b)</p>
          <p class="math-text">(a+b)³ = a³ + 3a²b + 3ab² + b³</p>
          <p class="math-text">(a-b)³ = a³ - 3a²b + 3ab² - b³</p>
          <p class="math-text">a³ + b³ = (a+b)(a² - ab + b²)</p>
          <p class="math-text">a³ - b³ = (a-b)(a² + ab + b²)</p>
          <p><strong>Важно:</strong> куб суммы и куб разности часто забывают, но в олимпиадных и экзаменационных задачах они встречаются регулярно.</p>
        </section>
        <section class="theory-topic-card">
          <h2>Пример применения</h2>
          <ol>
            <li>Упростить: <span class="math-text">(2x-3)² - (x-1)(x+1)</span>.</li>
            <li><span class="math-text">(2x-3)² = 4x² - 12x + 9</span>.</li>
            <li><span class="math-text">(x-1)(x+1) = x² - 1</span> (разность квадратов).</li>
            <li>Итог: <span class="math-text">4x² - 12x + 9 - (x² - 1) = 3x² - 12x + 10</span>.</li>
          </ol>
        </section>
      `;
    }

    if (text.includes('квадратные уравнения')) {
      return `
        <section class="theory-topic-card">
          <h2>Теория углублённо: квадратные уравнения</h2>
          <p>Общий вид: <span class="math-text">ax² + bx + c = 0</span>, где <span class="math-text">a ≠ 0</span>.</p>
          <p>Главная идея решения — привести уравнение к виду полного квадрата. Делим на <span class="math-text">a</span>:</p>
          <p class="math-text">x² + (b/a)x + c/a = 0</p>
          <p>Переносим свободный член и добавляем квадрат половины коэффициента при <span class="math-text">x</span>:</p>
          <p class="math-text">x² + (b/a)x + (b/2a)² = (b/2a)² - c/a</p>
          <p class="math-text">(x + b/2a)² = (b² - 4ac) / 4a²</p>
          <p>Числитель выражения справа и есть дискриминант:</p>
          <p class="math-text">D = b² - 4ac</p>
          <p>Тогда формула корней:</p>
          <p class="math-text">x₁,₂ = (-b ± √D) / (2a)</p>
          <p>Случаи:</p>
          <ul>
            <li><span class="math-text">D > 0</span> — два различных корня.</li>
            <li><span class="math-text">D = 0</span> — один корень (двукратный).</li>
            <li><span class="math-text">D < 0</span> — в действительных числах корней нет.</li>
          </ul>
        </section>

        <section class="theory-topic-card">
          <h2>Теорема Виета</h2>
          <p>Для приведённого уравнения <span class="math-text">x² + px + q = 0</span>:</p>
          <p class="math-text">x₁ + x₂ = -p, &nbsp; x₁x₂ = q</p>
          <p>Для общего вида <span class="math-text">ax² + bx + c = 0</span>:</p>
          <p class="math-text">x₁ + x₂ = -b/a, &nbsp; x₁x₂ = c/a</p>
          <p>Виета удобна, когда корни «угадываются» по сумме и произведению без вычисления корня из дискриминанта.</p>
        </section>

        <section class="theory-topic-card">
          <h2>Случай чётного коэффициента b</h2>
          <p>Если <span class="math-text">b = 2k</span>, то формулу удобно упростить:</p>
          <p class="math-text">D = (2k)² - 4ac = 4(k² - ac)</p>
          <p class="math-text">x₁,₂ = (-2k ± 2√(k²-ac)) / 2a = (-k ± √(k²-ac)) / a</p>
          <p>Такой подход уменьшает вычисления и снижает риск арифметических ошибок.</p>
        </section>

        <section class="theory-topic-card">
          <h2>Подробный пример</h2>
          <p><strong>Решить:</strong> <span class="math-text">2x² - 8x + 6 = 0</span></p>
          <ol>
            <li>Здесь <span class="math-text">a=2, b=-8, c=6</span>, и <span class="math-text">b</span> чётный, значит берём <span class="math-text">k=b/2=-4</span>.</li>
            <li>Считаем малый дискриминант: <span class="math-text">k² - ac = 16 - 12 = 4</span>.</li>
            <li>Корни: <span class="math-text">x₁,₂ = (-k ± √(k²-ac))/a = (4 ± 2)/2</span>.</li>
            <li>Получаем: <span class="math-text">x₁ = 3, x₂ = 1</span>.</li>
            <li>Проверка Виета: <span class="math-text">x₁ + x₂ = 4 = -b/a</span>, <span class="math-text">x₁x₂ = 3 = c/a</span> — верно.</li>
          </ol>
        </section>
      `;
    }

    if (text.includes('линейное уравнение')) {
      return `
        <section class="theory-topic-card">
          <h2>Углубление: линейные уравнения</h2>
          <p>Общий вид: <span class="math-text">ax+b=0</span>, где <span class="math-text">a≠0</span>. Решение: <span class="math-text">x=-b/a</span>.</p>
          <p>Если в уравнении есть дроби, сначала избавьтесь от знаменателей (умножьте на общий знаменатель), затем решайте линейно.</p>
          <p><strong>Пример:</strong> <span class="math-text">(x-2)/3 + (x+1)/6 = 2</span> → умножаем на 6: <span class="math-text">2(x-2)+(x+1)=12</span> → <span class="math-text">x=5</span>.</p>
        </section>
      `;
    }

    if (text.includes('системы линейных уравнений')) {
      return `
        <section class="theory-topic-card">
          <h2>Методы решения систем</h2>
          <p><strong>Подстановка:</strong> выражаем одну переменную через другую и подставляем.</p>
          <p><strong>Сложение:</strong> домножаем уравнения так, чтобы коэффициенты при одной переменной стали противоположными.</p>
          <p><strong>Пример:</strong> <span class="math-text">2x+y=7, x-y=2</span>. Складываем: <span class="math-text">3x=9</span> → <span class="math-text">x=3</span>, затем <span class="math-text">y=1</span>.</p>
        </section>
      `;
    }

    if (text.includes('линейная функция') || text.includes('функция и график')) {
      return `
        <section class="theory-topic-card">
          <h2>Функции: учебный разбор</h2>
          <p>Линейная функция: <span class="math-text">y = kx + b</span>.</p>
          <ul>
            <li><span class="math-text">k</span> — угловой коэффициент (направление наклона).</li>
            <li><span class="math-text">b</span> — ордината точки пересечения с осью <span class="math-text">Oy</span>.</li>
          </ul>
          <p><strong>Пример:</strong> для <span class="math-text">y=-2x+3</span> берём точки: при <span class="math-text">x=0, y=3</span>; при <span class="math-text">x=1, y=1</span>; при <span class="math-text">x=2, y=-1</span>.</p>
        </section>
      `;
    }

    if (text.includes('прогрессии')) {
      return `
        <section class="theory-topic-card">
          <h2>Арифметическая и геометрическая прогрессии</h2>
          <p class="math-text">a_n = a_1 + (n-1)d, &nbsp; S_n = (a_1 + a_n)n/2</p>
          <p class="math-text">b_n = b_1 q^{n-1}, &nbsp; S_n = b_1(q^n-1)/(q-1), q≠1</p>
          <p><strong>Пример:</strong> <span class="math-text">a_1=5, d=3</span>, тогда <span class="math-text">a_8=5+7*3=26</span>.</p>
        </section>
      `;
    }

    if (text.includes('логарифмическая') || text.includes('показательная')) {
      return `
        <section class="theory-topic-card">
          <h2>Показательные и логарифмические выражения</h2>
          <p class="math-text">a^{\log_a x} = x, \quad \log_a(a^x)=x</p>
          <p class="math-text">\log_a(xy)=\log_a x + \log_a y</p>
          <p class="math-text">\log_a(x/y)=\log_a x - \log_a y</p>
          <p class="math-text">\log_a(x^n)=n\log_a x</p>
          <p><strong>ОДЗ:</strong> <span class="math-text">x>0</span>, основание <span class="math-text">a>0, a≠1</span>.</p>
        </section>
      `;
    }

    if (text.includes('производная')) {
      return `
        <section class="theory-topic-card">
          <h2>Производная: ключевые правила</h2>
          <p class="math-text">(c)'=0, (x^n)'=nx^{n-1}, (u+v)'=u'+v', (uv)'=u'v+uv'</p>
          <p class="math-text">(u/v)'=(u'v-uv')/v^2, \quad (f(g(x)))' = f'(g(x))g'(x)</p>
          <p><strong>Алгоритм исследования:</strong> найти область определения → производную → критические точки → интервалы знака производной → экстремумы.</p>
        </section>
      `;
    }

    if (text.includes('интеграл')) {
      return `
        <section class="theory-topic-card">
          <h2>Интеграл: базовые формулы</h2>
          <p class="math-text">∫x^n dx = x^{n+1}/(n+1) + C, \quad n≠-1</p>
          <p class="math-text">∫(1/x)dx = \ln|x| + C</p>
          <p class="math-text">∫(a f(x)+b g(x))dx = a∫f(x)dx + b∫g(x)dx</p>
          <p class="math-text">∫(от a до b) f(x)dx = F(b)-F(a)</p>
        </section>
      `;
    }

    if (text.includes('тригонометр')) {
      return `
        <section class="theory-topic-card">
          <h2>Тригонометрия: основные формулы</h2>
          <p class="math-text">sin^2 x + cos^2 x = 1</p>
          <p class="math-text">1 + tg^2 x = 1/cos^2 x</p>
          <p class="math-text">sin(2x)=2sin x cos x</p>
          <p class="math-text">cos(2x)=cos^2 x - sin^2 x = 2cos^2 x -1 = 1-2sin^2 x</p>
          <p><strong>Простейшие уравнения:</strong> <span class="math-text">sin x = a</span>, <span class="math-text">cos x = a</span>, <span class="math-text">tg x = a</span> решаются через табличные углы и периодичность.</p>
        </section>
      `;
    }

    if (text.includes('неравенства') || text.includes('метод интервалов') || text.includes('интервалы')) {
      return `
        <section class="theory-topic-card">
          <h2>Метод интервалов (подробно)</h2>
          <p>Метод интервалов применяют для произведений и дробно-рациональных выражений вида <span class="math-text">f(x)g(x).../h(x)... > 0</span> или <span class="math-text">< 0</span>.</p>
          <ol>
            <li>Перенесите всё в одну сторону: получаем <span class="math-text">F(x) > 0</span>, <span class="math-text">F(x) < 0</span>, <span class="math-text">≥ 0</span> или <span class="math-text">≤ 0</span>.</li>
            <li>Найдите нули числителя и точки, где знаменатель равен нулю (это ОДЗ-исключения).</li>
            <li>Отметьте все критические точки на числовой прямой и разбейте ось на интервалы.</li>
            <li>Определите знак выражения на каждом интервале (подстановка тестовой точки или правило смены знака при проходе через корень нечётной/чётной кратности).</li>
            <li>Выберите нужные интервалы по знаку и аккуратно включите/исключите граничные точки по знаку неравенства и ОДЗ.</li>
          </ol>
          <p><strong>Памятка:</strong> точки из знаменателя никогда не входят в ответ. Точки из числителя входят только при <span class="math-text">≥</span> или <span class="math-text">≤</span>.</p>
        </section>

        <section class="theory-topic-card">
          <h2>Пример 1 (квадратное неравенство)</h2>
          <p class="math-text">(x-3)(x+1) > 0</p>
          <ol>
            <li>Критические точки: <span class="math-text">x=-1, 3</span>.</li>
            <li>Интервалы: <span class="math-text">(-∞,-1), (-1,3), (3,∞)</span>.</li>
            <li>Знаки: на крайних интервалах «+», в середине «-».</li>
            <li>Нужно <span class="math-text">>0</span> → берём крайние интервалы.</li>
          </ol>
          <p><strong>Ответ:</strong> <span class="math-text">(-∞,-1)∪(3,∞)</span>.</p>
        </section>

        <section class="theory-topic-card">
          <h2>Пример 2 (рациональное неравенство)</h2>
          <p class="math-text">(x-2)/(x+4) ≤ 0</p>
          <ol>
            <li>Критические точки: <span class="math-text">x=2</span> (ноль числителя), <span class="math-text">x=-4</span> (знаменатель, исключаем).</li>
            <li>Интервалы: <span class="math-text">(-∞,-4), (-4,2), (2,∞)</span>.</li>
            <li>Знаки: <span class="math-text">+, -, +</span>.</li>
            <li>Нужно <span class="math-text">≤0</span> → берём отрицательный интервал и точку нуля числителя.</li>
          </ol>
          <p><strong>Ответ:</strong> <span class="math-text">(-4,2]</span>.</p>
        </section>
      `;
    }

    if (text.includes('дроб')) {
      return `
        <section class="theory-topic-card">
          <h2>Учебный акцент</h2>
          <p>При работе с дробями в школьных курсах важно всегда контролировать:</p>
          <ul>
            <li>корректность общего знаменателя;</li>
            <li>сократимость результата;</li>
            <li>перевод в смешанное число, если это требуется условием.</li>
            <li>для алгебраических дробей — ОДЗ (знаменатель не равен нулю).</li>
          </ul>
        </section>
      `;
    }

    if (text.includes('теорема пифагора')) {
      return `
        <section class="theory-topic-card">
          <h2>Теория углублённо: теорема Пифагора</h2>
          <p>В прямоугольном треугольнике квадрат гипотенузы равен сумме квадратов катетов:</p>
          <p class="math-text">c² = a² + b²</p>
          <p>Обратная теорема: если для трёх сторон выполняется это равенство, треугольник прямоугольный.</p>
          <p><strong>Пример:</strong> при <span class="math-text">a=9, b=12</span> имеем <span class="math-text">c = √(81+144)=√225=15</span>.</p>
        </section>
      `;
    }

    if (text.includes('теорема синусов') || text.includes('теорема косинусов')) {
      return `
        <section class="theory-topic-card">
          <h2>Решение треугольников</h2>
          <p class="math-text">a/sin A = b/sin B = c/sin C</p>
          <p class="math-text">c^2 = a^2 + b^2 - 2ab cos C</p>
          <p>Если известны две стороны и угол между ними — обычно удобнее теорема косинусов. Если известна сторона и два угла — чаще теорема синусов.</p>
        </section>
      `;
    }

    if (text.includes('признаки делимости') || text.includes('делители') || text.includes('кратные')) {
      return `
        <section class="theory-topic-card">
          <h2>Числа, делимость и проверка</h2>
          <p><strong>Базовые признаки:</strong> на 2 — последняя цифра чётная; на 5 — 0 или 5; на 10 — 0; на 3 и 9 — сумма цифр делится на 3 или 9.</p>
          <p><strong>Алгоритм:</strong> сначала быстро проверяем признаки делимости, затем при необходимости раскладываем на простые множители.</p>
          <p><strong>Типичная ошибка:</strong> путать делимость на 3 и на 9.</p>
        </section>
      `;
    }

    if (text.includes('десятичная') || text.includes('проценты')) {
      return `
        <section class="theory-topic-card">
          <h2>Десятичные дроби и проценты</h2>
          <p class="math-text">p% = p/100</p>
          <p><strong>Процент от числа:</strong> умножаем число на <span class="math-text">p/100</span>.</p>
          <p><strong>Число по проценту:</strong> делим известную часть на <span class="math-text">p/100</span>.</p>
          <p><strong>Проверка:</strong> оцените порядок результата (процент меньше 100% даёт значение меньше исходного).</p>
        </section>
      `;
    }

    if (text.includes('степень') || text.includes('квадрат и куб')) {
      return `
        <section class="theory-topic-card">
          <h2>Степени: ключевые правила</h2>
          <p class="math-text">a^m * a^n = a^{m+n}, a^m/a^n = a^{m-n}, (a^m)^n = a^{mn}</p>
          <p class="math-text">(ab)^n = a^n b^n, a^{-n} = 1/a^n</p>
          <p><strong>Типичная ошибка:</strong> неверно раскрывать степень суммы: <span class="math-text">(a+b)^2 ≠ a^2+b^2</span>.</p>
        </section>
      `;
    }

    if (text.includes('рациональные дроби')) {
      return `
        <section class="theory-topic-card">
          <h2>Алгебраические дроби: полный алгоритм</h2>
          <ol>
            <li>Разложите числитель и знаменатель на множители.</li>
            <li>Сократите общие множители, учитывая ОДЗ.</li>
            <li>При сложении/вычитании приведите к общему знаменателю.</li>
            <li>Проверьте, что запрещённые значения не попали в ответ.</li>
          </ol>
          <p><strong>Важное правило:</strong> сокращают только множители, но не слагаемые.</p>
        </section>
      `;
    }

    if (text.includes('квадратные корни') || text.includes('корень n-й')) {
      return `
        <section class="theory-topic-card">
          <h2>Корни и иррациональные выражения</h2>
          <p class="math-text">sqrt(ab)=sqrt(a)sqrt(b), sqrt(a/b)=sqrt(a)/sqrt(b), a>=0, b>0</p>
          <p><strong>ОДЗ:</strong> подкоренное выражение для четного корня должно быть неотрицательно.</p>
          <p><strong>В уравнениях:</strong> после возведения в квадрат всегда делаем проверку (возможны посторонние корни).</p>
        </section>
      `;
    }

    if (text.includes('четырехугольники') || text.includes('параллелограмм') || text.includes('трапеция')) {
      return `
        <section class="theory-topic-card">
          <h2>Четырёхугольники: признаки и свойства</h2>
          <p><strong>Параллелограмм:</strong> противоположные стороны параллельны и равны, диагонали делятся пополам.</p>
          <p><strong>Прямоугольник:</strong> параллелограмм с прямым углом, диагонали равны.</p>
          <p><strong>Ромб:</strong> параллелограмм с равными сторонами, диагонали перпендикулярны.</p>
          <p><strong>Квадрат:</strong> и прямоугольник, и ромб одновременно.</p>
          <p><strong>Трапеция:</strong> одна пара сторон параллельна.</p>
        </section>
      `;
    }

    if (text.includes('подобие треугольников')) {
      return `
        <section class="theory-topic-card">
          <h2>Подобие треугольников</h2>
          <p>Три признака: по двум углам; по двум сторонам и углу между ними; по трём пропорциональным сторонам.</p>
          <p>Если коэффициент подобия <span class="math-text">k</span>, то периметры относятся как <span class="math-text">k</span>, а площади как <span class="math-text">k²</span>.</p>
        </section>
      `;
    }

    if (text.includes('окружность') || text.includes('касательная') || text.includes('вписанные')) {
      return `
        <section class="theory-topic-card">
          <h2>Окружность: опорные факты</h2>
          <p>Радиус, проведённый в точку касания, перпендикулярен касательной.</p>
          <p>Вписанный угол равен половине центрального, опирающегося на ту же дугу.</p>
          <p><strong>Тактика задач:</strong> сначала ищем равные углы и известные дуги, затем применяем связи углов и хорд.</p>
        </section>
      `;
    }

    if (text.includes('векторы')) {
      return `
        <section class="theory-topic-card">
          <h2>Векторы: действия и координаты</h2>
          <p class="math-text">(a1,a2,a3)+(b1,b2,b3)=(a1+b1,a2+b2,a3+b3)</p>
          <p class="math-text">|a|=sqrt(a1^2+a2^2+a3^2)</p>
          <p><strong>Метод:</strong> переводим геометрическую задачу в координаты, выполняем операции покоординатно, возвращаемся к геометрическому смыслу.</p>
        </section>
      `;
    }

    if (text.includes('стереометр')) {
      return `
        <section class="theory-topic-card">
          <h2>Стереометрия: как решать задачи</h2>
          <ol>
            <li>Постройте аккуратный пространственный рисунок и выделите нужное сечение.</li>
            <li>Сведите задачу к плоскому треугольнику/четырёхугольнику, если это возможно.</li>
            <li>Используйте теорему Пифагора, тригонометрию и формулы площадей/объёмов.</li>
            <li>Контролируйте размерности (длина, площадь, объём).</li>
          </ol>
        </section>
      `;
    }

    if (text.includes('комплексные числа')) {
      return `
        <section class="theory-topic-card">
          <h2>Комплексные числа: расширенный конспект</h2>
          <p class="math-text">z=a+bi, i^2=-1, |z|=sqrt(a^2+b^2)</p>
          <p class="math-text">z=r(cos fi + i sin fi), e^{ifi}=cos fi + i sin fi</p>
          <p class="math-text">(cos fi + i sin fi)^n = cos nfi + i sin nfi</p>
          <p><strong>Корни n-й степени:</strong> аргументы равны <span class="math-text">(fi+2pi k)/n</span>, <span class="math-text">k=0..n-1</span>.</p>
        </section>
      `;
    }

    return `
      <section class="theory-topic-card">
        <h2>Учебный акцент (полный шаблон)</h2>
        <p><strong>Определение:</strong> зафиксируйте точную формулировку понятия и условия применимости формулы.</p>
        <p><strong>Алгоритм:</strong> «дано → выбрать правило → вычислить → проверить».</p>
        <p><strong>Типичные ошибки:</strong> потеря ОДЗ, арифметические знаки, пропуск проверки.</p>
        <p><strong>Рекомендация:</strong> решите 2 базовые, 2 средние и 1 повышенную задачу на тему с обязательной самопроверкой.</p>
      </section>
    `;
  }

  function initSettings() {
    const range = $('#anim-speed-range');
    if (range) {
      range.value = state.animSpeed;
      range.addEventListener('input', (e) => {
         applyAnimSpeed(parseFloat(e.target.value));
      });
    }
    const soundToggle = $('#sound-toggle');
    if (soundToggle) {
      soundToggle.checked = state.isSound;
      soundToggle.addEventListener('change', (e) => {
        state.isSound = e.target.checked;
        localStorage.setItem('sciduel_sound', state.isSound);
        showToast(state.isSound ? 'Звук включен 🔊' : 'Звук выключен 🔇', 'info');
      });
    }

    // Grade selection logic
    const gradeSelect = $('#settings-grade-select');
    if (gradeSelect && state.currentUser) {
      gradeSelect.value = state.currentUser.grade || 5;
      gradeSelect.onchange = () => {
        const newGrade = parseInt(gradeSelect.value);
        if (confirm(`Переключить обучение на ${newGrade} класс? Ваш рейтинг будет обновлен для этого класса.`)) {
          socket.emit('update-grade', { grade: newGrade }, (res) => {
            if (res.ok) {
              state.currentUser = res.user;
              showToast(`Класс изменен на ${newGrade}!`, 'success');
              fetchDailyChallenge(); // Refresh challenge for new grade
              // Also update rating display if on profile
              if ($('#screen-profile.active')) renderProfile();
            } else {
              showToast(res.msg || 'Ошибка смены класса', 'error');
              gradeSelect.value = state.currentUser.grade;
            }
          });
        } else {
          gradeSelect.value = state.currentUser.grade;
        }
      };
    }

    $$('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        applyTheme(btn.dataset.theme);
      });
    });
    $('#settings-back-btn').addEventListener('click', () => navigateTo('home'));
  }

  // ──── Leaderboard ────
  function renderLeaderboard(grade = 5) {
    const screen = $('#screen-leaderboard');
    if (screen) screen.innerHTML = '<div style="text-align:center;padding:50px">🔍 Загрузка таблицы лидеров...</div>';
    
    socket.emit('get-leaderboard', { grade }, (result) => {
      const el = $('#screen-leaderboard');
      if (!el) return;
      if (!result || !result.ok) {
        el.innerHTML = '<div style="text-align:center;padding:50px">Ошибка загрузки таблицы</div>';
        return;
      }
      
      const filterLabels = { all: 'Всё время', hour: 'Час', day: 'День' };

      el.innerHTML = `
        <div class="profile-container" style="max-width:600px">
          <h1 style="text-align:center;margin-bottom:8px">🏆 Таблица лидеров</h1>
          <p style="text-align:center;color:var(--text-secondary);margin-bottom:24px">Лучшие умы SciDuel</p>
          
          <div class="leaderboard-filters" style="display:flex; gap:8px; justify-content:center; margin-bottom:24px; flex-wrap:wrap">
            ${[5, 6, 7, 8, 9, 10, 11].map(f => `
              <button class="btn btn-sm ${parseInt(grade) === f ? 'btn-primary' : 'btn-secondary'} filter-btn" data-filter="${f}">
                ${f} класс
              </button>
            `).join('')}
          </div>

          <div class="leaderboard-list">
            <div class="leaderboard-header" style="display:flex;padding:0 16px 8px;color:var(--text-secondary);font-size:0.9rem;border-bottom:1px solid rgba(255,255,255,0.1);margin-bottom:16px">
              <div style="flex:0 0 50px">Место</div>
              <div style="flex:1">Игрок</div>
              <div style="flex:0 0 80px;text-align:right">Победы</div>
              <div style="flex:0 0 100px;text-align:right">Рейтинг</div>
            </div>
            ${result.leaderboard.map((user, idx) => {
              const rank = idx + 1;
              let rankBadge = rank;
              if (rank === 1) rankBadge = '🥇';
              if (rank === 2) rankBadge = '🥈';
              if (rank === 3) rankBadge = '🥉';
              
              const userRank = getRank(user.rating || 1500);
              const displayRating = `${userRank.icon} ${Math.round(user.rating || 1500)}`;

              return `
                <div class="leaderboard-item">
                  <div class="leaderboard-rank">${rankBadge}</div>
                  <div class="leaderboard-name">${user.username}</div>
                  <div class="leaderboard-stats">
                  </div>
                  <div style="flex:0 0 80px;text-align:right;color:var(--success)">
                    ${user.wins || 0}
                  </div>
                  <div class="leaderboard-winrate" style="flex:0 0 100px;color:var(--accent-blue);font-weight:bold">
                    ${displayRating}
                  </div>
                </div>
              `;
            }).join('') || '<div style="text-align:center;color:var(--text-secondary)">Пока пусто...</div>'}
          </div>
          
          <div style="text-align:center;margin-top:32px">
            <button class="btn btn-ghost" id="leaderboard-back-btn">← Назад</button>
          </div>
        </div>
      `;
      
      $$('.filter-btn', el).forEach(btn => {
        btn.addEventListener('click', () => {
          renderLeaderboard(parseInt(btn.dataset.filter));
        });
      });

      $('#leaderboard-back-btn').addEventListener('click', () => navigateTo('home'));
    });
  }

  // ──── Modal ────
  function openModal(type) {
    const overlay = $('#modal-overlay');
    const modal = $('#modal');

    if (type === 'register') {
      modal.innerHTML = `
        <button class="modal-close" id="modal-close-btn">&times;</button>
        <h2>Создать аккаунт ✨</h2>
        <p>Присоединяйтесь к научному сообществу</p>
        <form id="register-form">
          <div class="form-group">
            <label>Имя пользователя</label>
            <input type="text" class="form-input" id="reg-username" placeholder="Ваше имя" autocomplete="off">
            <div class="form-error" id="reg-username-error"></div>
          </div>
          <div class="form-group">
            <label>Пароль</label>
            <input type="password" class="form-input" id="reg-password" placeholder="Минимум 4 символа">
            <div class="form-error" id="reg-password-error"></div>
          </div>
          <div class="form-group">
            <label>Подтвердите пароль</label>
            <input type="password" class="form-input" id="reg-password-confirm" placeholder="Повторите пароль">
            <div class="form-error" id="reg-confirm-error"></div>
          </div>
          <div class="form-group">
            <label>Класс обучения</label>
            <select id="reg-grade" class="form-input" style="background:rgba(0,0,0,0.3); color:white; border:1px solid rgba(255,255,255,0.1); padding:10px; border-radius:8px; width:100%;">
              <option value="5">5 класс</option>
              <option value="6">6 класс</option>
              <option value="7">7 класс</option>
              <option value="8">8 класс</option>
              <option value="9">9 класс</option>
              <option value="10">10 класс</option>
              <option value="11">11 класс</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px">Зарегистрироваться</button>
        </form>
        <div class="form-footer">Уже есть аккаунт? <a id="switch-to-login">Войти</a></div>
      `;
      $('#switch-to-login').addEventListener('click', () => openModal('login'));
      $('#register-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const username = $('#reg-username').value.trim();
        const password = $('#reg-password').value;
        const confirm = $('#reg-password-confirm').value;
        const grade = parseInt($('#reg-grade').value);
        $$('.form-error', modal).forEach(el => { el.textContent = ''; el.classList.remove('visible'); });
        if (password !== confirm) {
          $('#reg-confirm-error').textContent = 'Пароли не совпадают';
          $('#reg-confirm-error').classList.add('visible');
          return;
        }
        socket.emit('register', {username, password, grade}, (result) => {
          if (!result.ok) {
            $('#reg-username-error').textContent = result.msg;
            $('#reg-username-error').classList.add('visible');
            return;
          }
          setCurrentUser(result.user);
          closeModal();
          showToast(`Добро пожаловать, ${result.user.username}! 🎉`, 'success');
        });
      });
    } else {
      modal.innerHTML = `
        <button class="modal-close" id="modal-close-btn">&times;</button>
        <h2>С возвращением! 🔬</h2>
        <p>Войдите в свой аккаунт</p>
        <form id="login-form">
          <div class="form-group">
            <label>Имя пользователя</label>
            <input type="text" class="form-input" id="login-username" placeholder="Ваше имя" autocomplete="off">
          </div>
          <div class="form-group">
            <label>Пароль</label>
            <input type="password" class="form-input" id="login-password" placeholder="Ваш пароль">
            <div class="form-error" id="login-error"></div>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px">Войти</button>
        </form>
        <div class="form-footer">Нет аккаунта? <a id="switch-to-register">Зарегистрироваться</a></div>
      `;
      $('#switch-to-register').addEventListener('click', () => openModal('register'));
      $('#login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const username = $('#login-username').value.trim();
        const password = $('#login-password').value;
        socket.emit('login', {username, password}, (result) => {
          if (!result.ok) {
            $('#login-error').textContent = result.msg;
            $('#login-error').classList.add('visible');
            return;
          }
          setCurrentUser(result.user);
          closeModal();
          showToast(`Привет, ${result.user.username}! 🚀`, 'success');
        });
      });
    }

    overlay.classList.add('active');
    setTimeout(() => {
      const firstInput = $('input', modal);
      if (firstInput) firstInput.focus();
    }, 100);

    $('#modal-close-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  }

  function closeModal() {
    $('#modal-overlay').classList.remove('active');
  }

  // ──── Profile ────
  function renderProfile() {
    if (!state.currentUser) { navigateTo('home'); return; }

    socket.emit('get-user', { username: state.currentUser.username }, (result) => {
      if (!result || !result.ok) { navigateTo('home'); return; }
      const user = result.user;
      state.currentUser = user;

      socket.emit('get-best-results', { username: user.username }, (resBest) => {
        const records = (resBest && resBest.ok) ? resBest.records : [];
        const el = $('#screen-profile');
        if (!el) return;

        const initial = user.username.charAt(0).toUpperCase();
        // Winrate = wins / duelGames only (solo has no winner)
        const duelGames = user.duelgames || user.duelGames || 0;
        const soloGames = user.sologames || user.soloGames || 0;
        const totalGames = user.totalgames || user.totalGames || 0;
        const wins = user.wins || 0;
        const losses = user.losses || 0;
        const winRate = duelGames > 0 ? Math.round((wins / duelGames) * 100) : 0;
        const rating = Math.round(user.glicko_rating || 1500);
        const userRank = getRank(rating);

        // Helper: best score for a mode in match_results
        const findBest = (mode) => {
          const r = records.find(rec => rec.mode === mode);
          return r ? r.best_score : 0;
        };

        // Best duel score = user.bestResult updated by server
        const bestDuel = user.bestresult || user.bestResult || 0;

        // Best solo by difficulty (stored as 'solo_easy', 'solo_medium', 'solo_hard')
        const bestSoloEasy   = findBest('solo_easy');
        const bestSoloMedium = findBest('solo_medium');
        const bestSoloHard   = findBest('solo_hard');

        el.innerHTML = `
          <div class="profile-container">
            <div class="profile-header">
              <div class="profile-avatar ${userRank.class}">${initial}</div>
              <div class="profile-info">
                <h1>${user.username} <span class="rank-icon-small">${userRank.icon}</span></h1>
                <p class="academic-level rank-text-${userRank.class}">${userRank.title}</p>
              </div>
            </div>

            <div class="stats-grid">
              <div class="stat-card stat-card-rating">
                <div class="stat-value" style="color: var(--accent-blue)">${rating}</div>
                <div class="stat-label">🏆 Рейтинг</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${wins}</div>
                <div class="stat-label">Победы</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${losses}</div>
                <div class="stat-label">Поражения</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${duelGames}</div>
                <div class="stat-label">Дуэлей сыграно</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${winRate}%</div>
                <div class="stat-label">Винрейт (дуэли)</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${user.totalSolved || 0}</div>
                <div class="stat-label">Решено задач</div>
              </div>
            </div>

            <div class="best-results-section">
              <h2 style="margin-bottom:16px; font-size:1.4rem">🌟 Личные рекорды</h2>
              <div class="records-grid-v2">
                <div class="record-item-v2">
                  <span class="rec-label">⚔️ Лучшая дуэль</span>
                  <span class="rec-val rec-val-big">${bestDuel}</span>
                </div>
                <div class="record-item-v2">
                  <span class="rec-label">⚡ Штурм — Лёгкий</span>
                  <span class="rec-val rec-val-big">${bestSoloEasy}</span>
                </div>
                <div class="record-item-v2">
                  <span class="rec-label">⚡ Штурм — Средний</span>
                  <span class="rec-val rec-val-big">${bestSoloMedium}</span>
                </div>
                <div class="record-item-v2">
                  <span class="rec-label">⚡ Штурм — Сложный</span>
                  <span class="rec-val rec-val-big">${bestSoloHard}</span>
                </div>
              </div>
            </div>

            <div class="match-history-section" id="match-history-section">
              <h2 style="margin-bottom:16px; font-size:1.4rem">📜 История матчей</h2>
              <div id="match-history-list" class="match-history-list">
                <div style="text-align:center;padding:24px;color:var(--text-muted)">Загрузка...</div>
              </div>
            </div>

            <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;margin-top:32px">
              <button class="btn btn-primary btn-lg" id="profile-duel-btn">🏠 Создать комнату</button>
              <button class="btn btn-secondary btn-lg" id="profile-search-btn">🔍 Найти соперника</button>
              <button class="btn btn-accent btn-lg" id="profile-solo-btn">⚡ Штурм</button>
              <button class="btn btn-ghost btn-lg" id="profile-back-btn">← На главную</button>
            </div>
          </div>
        `;

        loadMatchHistory(user.username);
        $('#profile-duel-btn').addEventListener('click', () => { renderDuelSetup(); navigateTo('duel-setup'); });
        $('#profile-search-btn').addEventListener('click', () => { renderMatchmaking(); navigateTo('matchmaking'); });
        $('#profile-solo-btn').addEventListener('click', () => { renderSoloSetup('blitz'); navigateTo('solo-setup'); });
        $('#profile-back-btn').addEventListener('click', () => navigateTo('home'));
      });
    });
  }


  function loadMatchHistory(username) {
    socket.emit('get-match-history', { username, limit: 10 }, (result) => {
      const listEl = $('#match-history-list');
      if (!listEl) return;

      if (!result || !result.ok || !result.matches || result.matches.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted)">Пока нет завершённых матчей</div>';
        return;
      }

      listEl.innerHTML = result.matches.map(m => {
        const ts = Number(m.timestamp);
        const date = isNaN(ts) ? new Date(m.timestamp) : new Date(ts);
        const timeStr = isNaN(date.getTime())
          ? 'Дата неизвестна'
          : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const isSoloMode = String(m.mode).startsWith('solo_');
        const modeLabel = isSoloMode ? ('⚡ Штурм (' + m.mode.replace('solo_','') + ')') : ('⚔️ Дуэль (' + m.mode + ')');
        const resultClass = m.is_win ? 'match-win' : (isSoloMode ? 'match-solo' : 'match-loss');
        const resultText = isSoloMode ? 'Штурм' : (m.is_win ? 'Победа' : 'Поражение');

        return `
          <div class="match-history-item ${resultClass}">
            <div class="match-mode">${modeLabel}</div>
            <div class="match-score-display">${m.score}</div>
            <div class="match-result-text">${resultText}</div>
            <div class="match-time">${timeStr}</div>
          </div>
        `;
      }).join('');
    });
  }

  // ──── Player Search Modal ────


  function openPlayerSearch() {
    // Remove any existing modal
    const existing = document.getElementById('player-search-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'player-search-modal';
    modal.className = 'player-search-overlay';
    modal.innerHTML = `
      <div class="player-search-card">
        <div class="player-search-header">
          <h3>🔍 Поиск игроков</h3>
          <button class="ps-close" id="ps-close-btn">✕</button>
        </div>
        <div class="player-search-input-row">
          <input class="form-input ps-input" id="ps-input" type="text" placeholder="Введите никнейм (минимум 2 символа)..." autocomplete="off" />
          <button class="btn btn-primary" id="ps-search-btn">Найти</button>
        </div>
        <div id="ps-results" class="ps-results-list">
          <p class="ps-hint">Начните вводить имя игрока</p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const input = modal.querySelector('#ps-input');
    const resultsEl = modal.querySelector('#ps-results');
    let searchTimeout;

    function doSearch() {
      const q = input.value.trim();
      if (q.length < 2) {
        resultsEl.innerHTML = '<p class="ps-hint">Введите минимум 2 символа</p>';
        return;
      }
      resultsEl.innerHTML = '<p class="ps-hint">Поиск...</p>';
      socket.emit('search-players', { query: q }, (res) => {
        if (!res.ok || !res.players || res.players.length === 0) {
          resultsEl.innerHTML = '<p class="ps-hint">Игроки не найдены</p>';
          return;
        }
        resultsEl.innerHTML = res.players.map(p => {
          const rank = getRank(p.glicko_rating || 1500);
          const initial = p.username.charAt(0).toUpperCase();
          const winRate = p.totalgames > 0 ? Math.round((p.wins / p.totalgames) * 100) : 0;
          return `
            <div class="ps-player-row" data-username="${p.username}">
              <div class="ps-avatar ${rank.class}">${initial}</div>
              <div class="ps-info">
                <div class="ps-name">${p.username} ${rank.icon}</div>
                <div class="ps-stats">${rank.title} • ${Math.round(p.glicko_rating || 1500)} рейт. • ${p.wins || 0}W / ${p.losses || 0}L</div>
              </div>
              <button class="btn btn-primary ps-profile-btn" data-username="${p.username}">Профиль</button>
            </div>
          `;
        }).join('');

        // Bind profile buttons
        modal.querySelectorAll('.ps-profile-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const uname = btn.dataset.username;
            modal.remove();
            showUserProfile(uname);
          });
        });
      });
    }

    input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(doSearch, 400);
    });
    modal.querySelector('#ps-search-btn').addEventListener('click', doSearch);
    modal.querySelector('#ps-close-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // Focus input
    setTimeout(() => input.focus(), 50);
  }

  function showUserProfile(username) {
    socket.emit('get-user', { username }, (result) => {
      if (!result || !result.ok) { showToast('Игрок не найден', 'error'); return; }
      const user = result.user;
      const rank = getRank(user.glicko_rating || 1500);
      const initial = user.username.charAt(0).toUpperCase();
      const winRate = user.totalGames > 0 ? Math.round((user.wins / user.totalGames) * 100) : 0;

      // Reuse the existing modal overlay
      const overlay = $('#modal-overlay');
      const modalEl = $('#modal');
      if (!overlay || !modalEl) return;

      modalEl.innerHTML = `
        <div style="text-align:center; padding: 8px 0 0;">
          <button class="modal-close" id="modal-close-btn" style="position:absolute;top:12px;right:16px;background:none;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer">✕</button>
          <div class="profile-avatar ${rank.class}" style="width:72px;height:72px;font-size:1.8rem;margin:0 auto 12px;">${initial}</div>
          <h2 style="margin-bottom:4px">${user.username} ${rank.icon}</h2>
          <p style="color:var(--accent-purple);font-weight:600;margin-bottom:20px">${rank.title} ${user.grade ? ' • ' + user.grade + ' класс' : ''}</p>
          <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);gap:12px;">
            <div class="stat-card"><div class="stat-value">${Math.round(user.glicko_rating || 1500)}</div><div class="stat-label">Рейтинг ${user.grade ? '(' + user.grade + ' кл.)' : ''}</div></div>
            <div class="stat-card"><div class="stat-value">${user.wins || 0}</div><div class="stat-label">Победы</div></div>
            <div class="stat-card"><div class="stat-value">${winRate}%</div><div class="stat-label">Винрейт</div></div>
          </div>
        </div>
      `;
      overlay.classList.add('active');
      $('#modal-close-btn').addEventListener('click', () => overlay.classList.remove('active'));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });
    });
  }

  // ──── Duel Setup (with mode selection like Штурм) ────
  function renderDuelSetup() {
    const el = $('#screen-duel-setup');
    const playerName = state.currentUser ? state.currentUser.username : '';

    const modes = [
      { id: 'easy', icon: '🌱', name: 'Лёгкий', desc: 'Сложение и вычитание (1–10)' },
      { id: 'medium', icon: '🔥', name: 'Средний', desc: '+, −, × (1–15)' },
      { id: 'hard', icon: '💀', name: 'Сложный', desc: '+, −, ×, ÷ (1–30)' },
      { id: 'algebra', icon: '🧮', name: 'Алгебра', desc: 'Уравнения x + a = b' },
      { id: 'geometry', icon: '📐', name: 'Геометрия', desc: 'Площадь и периметр фигур' },
      { id: 'logic', icon: '🧩', name: 'Логика', desc: 'Числовые последовательности' },
      { id: 'blitz', icon: '⚡', name: 'Блиц', desc: 'Лёгкие задачи, 60 секунд' },
      { id: 'hardcore', icon: '💀', name: 'Хардкор', desc: 'Сложные задачи, 120 секунд' },
    ];

    const isUpdating = !!state.roomCode;
    const subtitle = isUpdating 
      ? `Настройте параметры для комнаты <strong>${state.roomCode}</strong>`
      : 'Выберите тип задач и создайте комнату или присоединитесь по коду';
    const mainBtnText = isUpdating ? '✅ Применить и играть' : '🏠 Создать комнату';

    const times = [30, 60, 90, 120];

    el.innerHTML = `
      <div class="duel-setup">
        <h1>⚔️ Математическая дуэль</h1>
        <p class="subtitle">${subtitle}</p>

        <div class="difficulty-cards" style="max-width:1000px">
          ${modes.map(m => `
            <div class="difficulty-card ${m.id === (state.difficulty || 'easy') ? 'selected' : ''}" data-diff="${m.id}">
              <div class="diff-icon">${m.icon}</div>
              <h3>${m.name}</h3>
              <p>${m.desc}</p>
            </div>
          `).join('')}
        </div>

        <div class="time-selection" style="margin-bottom:32px">
          <label style="display:block;margin-bottom:12px;font-weight:600;color:var(--text-secondary)">Время игры (секунд):</label>
          <div style="display:flex;gap:12px;justify-content:center">
            ${times.map(t => `
              <button class="time-btn ${t === (state.duration || 60) ? 'selected' : ''}" data-time="${t}">${t}</button>
            `).join('')}
          </div>
        </div>

        <div class="form-group" style="max-width:350px;width:100%;margin:0 auto 24px ${isUpdating ? ';display:none' : ''}">
          <label>Ваше имя</label>
          <input type="text" class="form-input" id="setup-name" placeholder="Введите имя" 
            value="${playerName}" style="text-align:center">
        </div>

        <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-bottom:24px">
          <button class="btn btn-primary btn-lg" id="create-room-btn">${mainBtnText}</button>
          ${!isUpdating ? '<button class="btn btn-secondary btn-lg" id="show-join-btn">🔗 Присоединиться</button>' : ''}
        </div>

        ${!isUpdating ? `
        <div class="join-section" id="join-section" style="display:none;margin-bottom:24px">
          <div style="display:flex;gap:12px;justify-content:center;align-items:end;flex-wrap:wrap">
            <div class="form-group" style="margin:0">
              <label>Код комнаты</label>
              <input type="text" class="form-input room-code-input" id="join-code-input" 
                placeholder="ABCD12" maxlength="6" style="text-align:center;text-transform:uppercase;letter-spacing:4px;font-family:var(--font-mono);font-size:1.3rem;width:200px">
            </div>
            <button class="btn btn-success btn-lg" id="join-room-btn">Войти</button>
          </div>
          <div class="form-error" id="join-error" style="text-align:center;margin-top:8px"></div>
        </div>
        ` : ''}

        <button class="btn btn-ghost" id="back-home-btn">${isUpdating ? '← Назад в лобби' : '← На главную'}</button>
      </div>
    `;

    let duelDifficulty = isUpdating ? (state.difficulty || 'easy') : 'easy';
    let duelDuration = isUpdating ? (state.duration || 60) : 60;

    $$('.difficulty-card', el).forEach(card => {
      card.addEventListener('click', () => {
        $$('.difficulty-card', el).forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        duelDifficulty = card.dataset.diff;
      });
    });

    $$('.time-btn', el).forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.time-btn', el).forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        duelDuration = parseInt(btn.dataset.time, 10);
      });
    });

    // Create or Update room
    $('#create-room-btn').addEventListener('click', () => {
      const name = isUpdating ? state.myName : ($('#setup-name').value.trim() || 'Игрок');
      state.myName = name;
      state.difficulty = duelDifficulty;
      state.duration = duelDuration;

      if (isUpdating) {
        socket.emit('update-room-config', {
          roomCode: state.roomCode,
          difficulty: duelDifficulty,
          duration: duelDuration
        });
      } else {
        socket.emit('create-room', {
          difficulty: duelDifficulty,
          duration: duelDuration,
          playerName: name,
        });
      }
    });

    if (!isUpdating) {
      $('#show-join-btn').addEventListener('click', () => {
        const joinSec = $('#join-section');
        joinSec.style.display = joinSec.style.display === 'none' ? 'block' : 'none';
        if (joinSec.style.display === 'block') {
          setTimeout(() => $('#join-code-input').focus(), 100);
        }
      });

      $('#join-room-btn').addEventListener('click', () => {
        const code = $('#join-code-input').value.trim().toUpperCase();
        const name = $('#setup-name').value.trim() || 'Игрок';
        if (!code || code.length < 4) {
          $('#join-error').textContent = 'Введите код комнаты';
          $('#join-error').classList.add('visible');
          return;
        }
        state.myName = name;
        socket.emit('join-room', { roomCode: code, playerName: name });
      });
      
      $('#join-code-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') $('#join-room-btn').click();
      });

      $('#back-home-btn').addEventListener('click', () => navigateTo('home'));
    } else {
      $('#back-home-btn').addEventListener('click', () => navigateTo('lobby'));
    }
  }

  // ──── Lobby (updated for multiplayer & chat) ────
  function renderLobby(data = null) {
    const el = $('#screen-lobby');
    if (!el) return;
    
    const roomCode = data ? data.code : state.roomCode;
    const players = data ? data.players : (state.players || []);
    const difficulty = data ? data.difficulty : (state.difficulty || 'medium');
    const chat = data ? data.chat : (state.chat || []);
    
    state.roomCode = roomCode;
    state.players = players;
    
    const diffNames = { easy: '🌱 Лёгкий', medium: '🔥 Средний', hard: '💀 Сложный', algebra: '🧮 Алгебра', geometry: '📐 Геометрия' };

    el.innerHTML = `
      <div class="lobby-container" style="max-width:1100px; margin:0 auto; padding:40px 24px; display:flex; gap:32px; flex-wrap:wrap;">
        <div style="flex:1; min-width:320px;">
          <h1 style="margin-bottom:8px">🏠 Комната: <span class="gradient-text">${roomCode}</span></h1>
          <p style="color:var(--text-secondary); margin-bottom:24px">Режим: ${diffNames[difficulty] || difficulty}</p>
          
          <div class="lobby-players-list" style="display:grid; gap:12px; margin-bottom:32px">
            <h3 style="font-size:1.1rem; color:var(--text-secondary); margin-bottom:8px">Участники (${players.length})</h3>
            ${players.map(p => `
              <div class="user-list-item" style="background:rgba(255,255,255,0.05); padding:12px 16px; border-radius:12px; display:flex; align-items:center; gap:12px">
                <div class="user-avatar" style="width:32px; height:32px; font-size:14px">${p.name.charAt(0).toUpperCase()}</div>
                <span style="font-weight:600">${p.name}</span>
                ${p.name === state.myName ? '<span style="font-size:0.7rem; background:var(--accent-purple); padding:2px 8px; border-radius:10px">ВЫ</span>' : ''}
              </div>
            `).join('')}
          </div>

          <div style="display:flex; gap:12px; flex-wrap:wrap">
            ${players[0]?.name === state.myName ? `
              <button class="btn btn-primary btn-lg" id="lobby-start-btn">🚀 Начать игру</button>
            ` : `
              <div style="padding:12px 20px; background:rgba(255,165,0,0.1); border:1px solid orange; color:orange; border-radius:12px; font-size:0.9rem">
                ⏳ Ожидание запуска хостом...
              </div>
            `}
            <button class="btn btn-secondary btn-lg" id="lobby-copy-btn">📋 Код</button>
            <button class="btn btn-danger btn-lg" id="lobby-exit-btn">✕ Выйти</button>
          </div>
        </div>

        <div style="width:100%; max-width:400px; min-width:300px;">
          <h3 style="margin-bottom:12px">💬 Чат комнаты</h3>
          <div class="chat-container">
            <div class="chat-messages" id="chat-messages">
               ${chat.map(m => `
                 <div class="chat-msg ${m.sender === state.myName ? 'chat-msg-self' : 'chat-msg-other'}">
                   <span class="chat-name">${m.sender}</span>
                   ${m.text}
                 </div>
               `).join('')}
            </div>
            <div class="chat-input-area">
              <input type="text" class="chat-input" id="chat-input" placeholder="Напишите сообщение...">
              <button class="chat-send-btn" id="chat-send-btn">Отпр.</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Wait for DOM
    setTimeout(() => {
      const scrollEl = $('#chat-messages');
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    }, 50);

    $('#chat-send-btn')?.addEventListener('click', sendChatMessage);
    $('#chat-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });
    
    $('#lobby-start-btn')?.addEventListener('click', () => {
      socket.emit('start-room-game');
    });

    $('#lobby-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(roomCode).then(() => showToast('Код комнаты скопирован!', 'success'));
    });

    $('#lobby-exit-btn').addEventListener('click', () => {
      socket.emit('leave-room');
      navigateTo('home');
    });
  }

  function sendChatMessage() {
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    socket.emit('send-chat-message', { text });
    input.value = '';
  }

  socket.on("solo-over", (data) => {
    state.isRunning = false;
    showToast(`🏁 Время вышло! Решено: ${data.score}`, 'success');
    playSound('win');
    
    const diffName = difficultyNames[state.difficulty] || state.difficulty;
    const el = $('#screen-solo-arena');
    el.innerHTML = `
      <div class="results-container">
        <div class="results-trophy">🏁</div>
        <div class="results-title">Результат: ${data.score}</div>
        <div class="results-subtitle">Режим «${diffName}» завершён</div>
        <div style="margin-top:32px; display:flex; gap:16px; justify-content:center; flex-wrap:wrap">
           <button class="btn btn-primary btn-lg" id="solo-retry-btn">🔄 Ещё раз</button>
           <button class="btn btn-secondary btn-lg" id="solo-change-btn">⚙️ Другой режим</button>
           <button class="btn btn-ghost" id="solo-home-btn">🏠 Домой</button>
        </div>
      </div>
    `;
    $('#solo-retry-btn').addEventListener('click', () => startSoloMode(state.difficulty));
    $('#solo-change-btn').addEventListener('click', () => {
      renderSoloSetup(state.difficulty);
      navigateTo('solo-setup');
    });
    $('#solo-home-btn').addEventListener('click', () => navigateTo('home'));
  });

  // ──── Marathon Mode (Sudden Death) ────
  function renderMarathon() {
    const el = $('#screen-practice'); // Reuse practice screen container
    if (!el) return;
    
    state.marathon.active = true;
    state.marathon.streak = 0;
    state.marathon.history = [];
    
    // Hide navbar for focus
    document.body.classList.add('in-game');
    
    nextMarathonProblem();
  }

  function nextMarathonProblem() {
    const bank = getPracticeBank();
    let taskGen = bank[randomInt(0, bank.length - 1)];
    // Marathon is Hard/Olympiad by default
    const level = state.marathon.streak > 5 ? 'olympiad' : (state.marathon.streak > 2 ? 'hard' : 'medium');
    let task = taskGen.gen(level);
    
    state.marathon.currentTask = task;
    
    // Generate 4 options for marathon
    const options = generateMarathonOptions(parseInt(task.correct) || 0);

    const el = $('#screen-practice');
    el.innerHTML = `
      <div class="theory-container" style="text-align:center; padding-top:60px">
        <div style="font-size:1.2rem; color:var(--accent-purple); font-weight:700; margin-bottom:20px">
          🏆 МАРАФОН • Счёт: ${state.marathon.streak}
        </div>
        <div class="theory-topic-card" style="max-width:600px; margin:0 auto; padding:40px">
          <h2 style="font-size:2.5rem; margin-bottom:24px">${autoMathWrap(task.question)}</h2>
          ${task.draw ? `<div style="margin-bottom:24px">${getGeometricShapeSvg(task)}</div>` : ''}
          
          <div class="marathon-grid">
            ${options.map(opt => `
              <button class="btn btn-secondary marathon-opt-btn" style="padding:20px; font-size:1.4rem" data-val="${opt}">
                ${opt}
              </button>
            `).join('')}
          </div>
          
          <button class="btn btn-ghost" style="margin-top:32px" id="marathon-quit-btn">Сдаться</button>
        </div>
      </div>
    `;

    $$('.marathon-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        checkMarathonAnswer(val);
      });
    });

    $('#marathon-quit-btn').addEventListener('click', () => {
      state.marathon.active = false;
      document.body.classList.remove('in-game');
      navigateTo('home');
    });
  }

  function generateMarathonOptions(correct) {
    const opts = new Set([correct]);
    while (opts.size < 4) {
      const dev = randomInt(1, 10);
      opts.add(Math.random() > 0.5 ? correct + dev : correct - dev);
    }
    return [...opts].sort((a,b) => a-b);
  }

  function checkMarathonAnswer(ans) {
    const correct = state.marathon.currentTask.correct;
    if (String(ans) === String(correct)) {
      state.marathon.streak++;
      playSound('correct');
      showToast('Верно! 🔥', 'success');
      nextMarathonProblem();
    } else {
      playSound('wrong');
      showToast('Ошибка! Игра окончена.', 'error');
      renderMarathonResults();
    }
  }

  function renderMarathonResults() {
    state.marathon.active = false;
    document.body.classList.remove('in-game');
    
    // Save record locally
    const best = localStorage.getItem('sciduel_best_marathon') || 0;
    if (state.marathon.streak > best) {
      localStorage.setItem('sciduel_best_marathon', state.marathon.streak);
    }

    const el = $('#screen-practice');
    el.innerHTML = `
      <div class="theory-container" style="text-align:center; padding-top:80px">
        <h1>🏁 Марафон окончен!</h1>
        <div class="theory-topic-card" style="max-width:500px; margin:20px auto; padding:40px">
          <div style="font-size:4rem; margin-bottom:12px">🏆</div>
          <div style="font-size:2rem; font-weight:800">Счёт: ${state.marathon.streak}</div>
          <p style="color:var(--text-secondary); margin-top:12px">Ваш лучший результат: ${localStorage.getItem('sciduel_best_marathon')}</p>
          
          <div style="display:flex; gap:16px; justify-content:center; margin-top:32px">
            <button class="btn btn-primary btn-lg" id="marathon-retry-btn">Повторить</button>
            <button class="btn btn-secondary btn-lg" id="marathon-home-btn">На главную</button>
          </div>
        </div>
      </div>
    `;

    $('#marathon-retry-btn').addEventListener('click', renderMarathon);
    $('#marathon-home-btn').addEventListener('click', () => navigateTo('home'));
  }

  // ──── Matchmaking (progressive difficulty, no selection) ────
  function renderMatchmaking() {
    const el = $('#screen-matchmaking');
    const name = state.currentUser ? state.currentUser.username : 'Игрок';

    el.innerHTML = `
      <div class="matchmaking-container">
        <div class="matchmaking-visual">
          <div class="search-rings">
            <div class="ring ring-1"></div>
            <div class="ring ring-2"></div>
            <div class="ring ring-3"></div>
            <div class="search-avatar">${name.charAt(0).toUpperCase()}</div>
          </div>
        </div>
        <h1 class="matchmaking-title">Поиск соперника...</h1>
        <p class="matchmaking-subtitle" id="mm-status">Нажмите кнопку для поиска случайного оппонента</p>

        <div class="progressive-info" style="background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-xl);padding:24px 32px;max-width:500px;width:100%;margin-bottom:32px;text-align:left">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
            <span style="font-size:1.5rem">📈</span>
            <h3 style="font-size:1.1rem">Прогрессивная сложность</h3>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:0.9rem;color:var(--text-secondary)">
            <span>🌱 Задачи 1–6: Лёгкие (сложение, вычитание)</span>
            <span>🔥 Задачи 7–13: Средние (+, −, ×)</span>
            <span>💀 Задачи 14–20: Сложные (+, −, ×, ÷)</span>
            <span>🧮 Задачи 20+: Алгебра и продвинутый уровень</span>
          </div>
        </div>

        <button class="btn btn-primary btn-lg" id="start-search-btn">🔍 Найти соперника</button>
        <button class="btn btn-danger" id="cancel-search-btn" style="display:none;margin-top:16px">✕ Отменить</button>
        <button class="btn btn-ghost" id="mm-back-btn" style="margin-top:16px">← Назад</button>
      </div>
    `;

    $('#start-search-btn').addEventListener('click', () => {
      const playerName = state.currentUser ? state.currentUser.username : 'Игрок';
      state.myName = playerName;
      state.difficulty = 'progressive';

      socket.emit('find-match', {
        playerName,
        difficulty: 'progressive',
        rating: state.currentUser ? state.currentUser.glicko_rating : 1500
      });

      $('#start-search-btn').style.display = 'none';
      $('#cancel-search-btn').style.display = 'inline-flex';
      $('#mm-status').textContent = 'Ищем достойного оппонента...';
    });

    $('#cancel-search-btn').addEventListener('click', () => {
      socket.emit('cancel-match');
      $('#start-search-btn').style.display = 'inline-flex';
      $('#cancel-search-btn').style.display = 'none';
      $('#mm-status').textContent = 'Поиск отменён';
    });

    $('#mm-back-btn').addEventListener('click', () => {
      socket.emit('cancel-match');
      navigateTo('home');
    });
  }

  // ──── Countdown ────
  function showCountdown(callback) {
    const overlay = $('#countdown-overlay');
    const numberEl = $('#countdown-number');
    overlay.classList.add('active');

    let count = 3;
    numberEl.textContent = count;

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        numberEl.textContent = count;
        numberEl.style.animation = 'none';
        void numberEl.offsetWidth;
        numberEl.style.animation = 'countPop 1s ease';
      } else if (count === 0) {
        numberEl.textContent = 'GO!';
        numberEl.style.animation = 'none';
        void numberEl.offsetWidth;
        numberEl.style.animation = 'countPop 1s ease';
      } else {
        clearInterval(interval);
        overlay.classList.remove('active');
        if (callback) callback();
      }
    }, 1000);
  }

  // ──── Duel Arena (single player panel) ────
  function renderDuelArena() {
    const el = $('#screen-duel-arena');
    state.streak = 0;

    el.innerHTML = `
      <div class="duel-arena">
        <div class="duel-header">
          <div class="duel-score-left">
            <span class="arena-player-label you-label">Вы: ${state.myName}</span>
            <span class="arena-score my-score" id="my-score-display">0</span>
          </div>
          <div class="duel-timer">
            <span class="timer-label">Осталось</span>
            <span class="timer-value" id="timer-display">${formatTime(state.timeLeft)}</span>
            <div class="timer-bar-container"><div class="timer-bar" id="timer-bar"></div></div>
          </div>
          <div class="duel-score-right">
            <span class="arena-player-label opp-label">${state.opponentName}</span>
            <span class="arena-score opp-score" id="opp-score-display">0</span>
          </div>
        </div>

        <div class="streak-badge" id="streak-badge" style="display:none">🔥 <span id="streak-count">0</span></div>

        <div class="duel-problem">
          <div class="problem-label">Решите пример</div>
          <div class="problem-expression" id="problem-display">⏳ Ожидание...</div>
        </div>

        <div class="answer-options-grid-solo" id="answer-options">
        </div>

        <div class="player-feedback-solo" id="my-feedback"></div>
      </div>
    `;
  }

  function updateProblem(expression, options) {
    const activeScreen = $('.screen.active');
    const problemEl = $('#problem-display', activeScreen);
    if (problemEl) {
      problemEl.textContent = `${expression} = ?`;
      problemEl.style.animation = 'none';
      void problemEl.offsetWidth;
      problemEl.style.animation = 'fadeIn 0.3s ease';
    }

    const optionsEl = $('#answer-options', activeScreen);
    if (optionsEl) {
      optionsEl.innerHTML = options.map(opt =>
        `<button class="answer-option-btn" data-value="${opt}">${opt}</button>`
      ).join('');

      $$('.answer-option-btn', optionsEl).forEach(btn => {
        btn.addEventListener('click', () => {
          if (!state.isRunning) return;
          const answer = parseInt(btn.dataset.value, 10);
          socket.emit('submit-answer', { answer });
          // Disable all buttons until feedback
          $$('.answer-option-btn', optionsEl).forEach(b => b.style.pointerEvents = 'none');
        });
      });
    }

    // Clear feedback
    const fb = $('#my-feedback');
    if (fb) { fb.textContent = ''; fb.className = 'player-feedback-solo'; }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // ──── Results ────
  function renderResults(data) {
    const el = $('#screen-results');

    // Handle solo mode results
    if (data.isSolo) {
      renderSoloResults(data);
      return;
    }

    const p1 = data.player1;
    const p2 = data.player2;

    const iAmP1 = state.myPlayerSlot === 1;
    const myData = iAmP1 ? p1 : p2;
    const oppData = iAmP1 ? p2 : p1;

    // Safely resolve rating: use the data from server, or fall back to user state
    const myRating = myData.rating || (state.currentUser ? state.currentUser.glicko_rating : 1500) || 1500;
    const oppRating = oppData.rating || 1500;

    let trophy, title, subtitle;
    if (myData.score > oppData.score) {
      trophy = '🏆';
      title = 'Вы победили!';
      subtitle = 'Великолепная игра! Ваш ум сияет ярче звёзд';
      playSound('win');
    } else if (myData.score < oppData.score) {
      trophy = '😔';
      title = `${oppData.name} побеждает`;
      subtitle = 'Не сдавайтесь! Каждая игра делает вас сильнее';
      playSound('loss');
    } else {
      trophy = '🤝';
      title = 'Ничья!';
      subtitle = 'Вы оба показали равный результат';
    }

    const myRank = getRank(myRating);
    const oppRank = getRank(oppRating);

    el.innerHTML = `
      <div class="results-container">
        <div class="results-trophy">${trophy}</div>
        <div class="results-title">${title}</div>
        <div class="results-subtitle">${subtitle}</div>

        <div class="results-cards">
          <div class="result-card ${myData.score > oppData.score ? 'winner' : ''}">
            <div class="result-player-name">🧑 ${myData.name} (Вы)</div>
            <div class="res-rank ${myRank.class}">${myRank.icon} ${myRank.title}</div>
            <div class="result-score-container">
              <div class="result-score">${myData.score}</div>
              ${data.isRanked && myData.ratingDelta !== undefined ? `
                <div class="rating-change-badge ${myData.ratingDelta >= 0 ? 'plus' : 'minus'}">
                  ${myData.ratingDelta >= 0 ? '▲' : '▼'} ${Math.abs(myData.ratingDelta)}
                </div>
              ` : ''}
            </div>
            <div class="result-label">правильных ответов</div>
            ${data.isRanked ? `<div class="res-total-rating">Рейтинг: ${Math.round(myRating + (myData.ratingDelta || 0))}</div>` : ''}
            ${myData.score > oppData.score ? '<div class="result-badge">🏆 Победитель</div>' : ''}
          </div>
          <div class="result-card ${oppData.score > myData.score ? 'winner' : ''}">
            <div class="result-player-name">👤 ${oppData.name}</div>
            <div class="res-rank ${oppRank.class}">${oppRank.icon} ${oppRank.title}</div>
            <div class="result-score-container">
              <div class="result-score">${oppData.score}</div>
              ${data.isRanked && oppData.ratingDelta !== undefined ? `
                <div class="rating-change-badge ${oppData.ratingDelta >= 0 ? 'plus' : 'minus'}">
                  ${oppData.ratingDelta >= 0 ? '▲' : '▼'} ${Math.abs(oppData.ratingDelta)}
                </div>
              ` : ''}
            </div>
            <div class="result-label">правильных ответов</div>
            ${data.isRanked ? `<div class="res-total-rating">Рейтинг: ${Math.round(oppRating + (oppData.ratingDelta || 0))}</div>` : ''}
            ${oppData.score > myData.score ? '<div class="result-badge">🏆 Победитель</div>' : ''}
          </div>
        </div>

        <div class="results-actions">
          ${data.isTournament ? `<button class="btn btn-primary btn-lg" id="return-tournament-btn">🏆 Вернуться к турниру</button>` : `<button class="btn btn-primary btn-lg" id="rematch-btn">🔄 Реванш</button>`}
          <button class="btn btn-secondary btn-lg" id="change-mode-btn">⚙️ Выбрать другой режим</button>
          <button class="btn btn-ghost" id="results-home-btn">На главную</button>
        </div>
      </div>
    `;

    if (data.isTournament) {
      $('#return-tournament-btn').addEventListener('click', () => {
        state.roomCode = null;
        openTournamentLobby(data.tournamentId);
      });
      // Авто-возврат в сетку через 5 секунд
      setTimeout(() => {
        if (state.roomCode === data.roomCode) { // Still on this result screen roughly
          state.roomCode = null;
          openTournamentLobby(data.tournamentId);
        }
      }, 5000);
    } else {
      $('#rematch-btn').addEventListener('click', () => {
        socket.emit('request-rematch');
        $('#rematch-btn').textContent = '⏳ Ожидание соперника...';
        $('#rematch-btn').disabled = true;
      });
    }

    $('#change-mode-btn').addEventListener('click', () => {
      renderDuelSetup();
      navigateTo('duel-setup');
    });

    $('#results-home-btn').addEventListener('click', () => {
      state.roomCode = null;
      navigateTo('home');
    });

    // Award / Confetti effect
    if (myData && oppData && myData.score > oppData.score) {
      setTimeout(() => {
        triggerVictoryEffect();
      }, 500);
    }
  }

  function triggerVictoryEffect() {
    if (typeof confetti === 'undefined') return;
    
    const duration = 3 * 1000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#4f46e5', '#38bdf8', '#818cf8']
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#4f46e5', '#38bdf8', '#818cf8']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());

    // Show a small overlay modal for the winner
    const initial = state.myName.charAt(0).toUpperCase();
    const rank = getRank(state.currentUser ? state.currentUser.glicko_rating : 1500);
    
    const winModal = document.createElement('div');
    winModal.className = 'victory-popup-overlay';
    winModal.innerHTML = `
      <div class="victory-popup-card">
        <div class="vic-close" onclick="this.parentElement.parentElement.remove()">×</div>
        <div class="vic-crown">🏆</div>
        <h3>ПОБЕДА!</h3>
        <div class="vic-user-avatar ${rank.class}">${initial}</div>
        <div class="vic-username">${state.myName}</div>
        <div class="vic-rank-text">${rank.icon} ${rank.title}</div>
        <div class="vic-glory">Ваши научные достижения впечатляют!</div>
        <button class="btn btn-primary" onclick="this.parentElement.parentElement.remove()">Продолжить</button>
      </div>
    `;
    document.body.appendChild(winModal);
  }

  // ──── Solo Results ────
  function renderSoloResults(data) {
    const el = $('#screen-results');
    const score = data.player1.score;
    const bestSolo = data.player2 ? data.player2.score : 0;
    const diffName = difficultyNames[state.difficulty] || state.difficulty;
    const isNewRecord = score > bestSolo && bestSolo > 0;

    playSound(isNewRecord ? 'win' : 'correct');

    el.innerHTML = `
      <div class="results-container">
        <div class="results-trophy">🏁</div>
        <div class="results-title">Ваш результат и рекорд</div>
        <div class="results-subtitle">Режим «${diffName}»</div>

        <div class="solo-results-panel">
          <div class="solo-results-score">
            <div class="solo-score-big">${score}</div>
            <div class="solo-score-label">решено задач</div>
          </div>
          <div class="solo-results-stats">
            <div class="solo-stat-row">
              <span>Личный рекорд:</span>
              <span class="solo-stat-value">${Math.max(score, bestSolo)}</span>
            </div>
            <div class="solo-stat-row">
              <span>Предыдущий рекорд:</span>
              <span class="solo-stat-value">${bestSolo}</span>
            </div>
          </div>
        </div>

        <div class="results-actions">
          <button class="btn btn-primary btn-lg" id="solo-retry-btn">🔄 Ещё раз</button>
          <button class="btn btn-secondary btn-lg" id="solo-change-btn">⚙️ Другой режим</button>
          <button class="btn btn-ghost" id="solo-home-btn">🏠 Домой</button>
        </div>
      </div>
    `;

    $('#solo-retry-btn').addEventListener('click', () => startSoloMode(state.difficulty));
    $('#solo-change-btn').addEventListener('click', () => {
      renderSoloSetup(state.difficulty);
      navigateTo('solo-setup');
    });
    $('#solo-home-btn').addEventListener('click', () => navigateTo('home'));
  }

  // ──── Socket.io Event Handlers ────

  // Room created — show lobby with code
  socket.on('room-created', (data) => {
    state.roomCode = data.roomCode;
    state.myPlayerSlot = data.playerSlot;
    state.difficulty = data.difficulty;

    renderLobby(data.roomCode, data.difficulty);
    navigateTo('lobby');
    showToast(`Комната создана: ${data.roomCode}`, 'success');
  });

  // Room joined successfully
  socket.on('room-joined', (data) => {
    state.roomCode = data.roomCode;
    state.myPlayerSlot = data.playerSlot;
    state.difficulty = data.difficulty;
    state.opponentName = data.opponentName;

    playSound('found');
    showToast(`Вы присоединились к комнате! Соперник: ${data.opponentName}`, 'success');
  });

  // Join error
  socket.on('join-error', (data) => {
    const errEl = $('#join-error');
    if (errEl) {
      errEl.textContent = data.message;
      errEl.classList.add('visible');
    }
    showToast(data.message, 'error');
  });

  // Opponent joined our room
  socket.on('opponent-joined', (data) => {
    state.opponentName = data.opponentName;
    playSound('found');
    showToast(`${data.opponentName} присоединился! Игра начинается`, 'success');
  });

  // Match found (from matchmaking)
  socket.on('match-found', (data) => {
    state.roomCode = data.roomCode;
    state.myPlayerSlot = data.playerSlot;
    state.opponentName = data.opponentName;
    state.difficulty = data.difficulty;

    playSound('found');
    showToast(`Соперник найден: ${data.opponentName}! 🎯`, 'success');
  });

  // Waiting for match
  socket.on('waiting-for-match', () => {
    const statusEl = $('#mm-status');
    if (statusEl) statusEl.textContent = 'Ищем соперника, подождите';
  });

  // Game starting (both players ready)
  socket.on('game-starting', (data) => {
    state.timeLeft = data.timeLeft;
    state.timeTotal = data.timeLeft;
    state.myScore = 0;
    state.opponentScore = 0;
    state.isRunning = true;
    state.streak = 0;

    if (state.myPlayerSlot === 1) {
      state.opponentName = data.player2.name;
    } else {
      state.opponentName = data.player1.name;
    }

    // Fix: render the arena immediately so the DOM exists for incoming new-problem event
    renderDuelArena();
    navigateTo('duel-arena');
    updateNavHeightVar();

    // Show countdown over the arena
    showCountdown(() => {
      console.log("Countdown finished");
    });
  });

  // New problem from server
  socket.on('new-problem', (data) => {
    updateProblem(data.expression, data.options);
  });

  // Timer update
  socket.on('timer-update', (data) => {
    state.timeLeft = data.timeLeft;
    const timerEl = $('#timer-display');
    if (timerEl) {
      timerEl.textContent = formatTime(data.timeLeft);
      if (data.timeLeft <= 30) {
        timerEl.classList.add('warning');
      }
    }
    // Update timer progress bar
    const barEl = $('#timer-bar');
    if (barEl && state.timeTotal > 0) {
      const pct = (data.timeLeft / state.timeTotal) * 100;
      barEl.style.width = pct + '%';
      if (pct <= 25) barEl.classList.add('critical');
      else if (pct <= 50) barEl.classList.add('low');
    }
  });

  // Answer feedback (just for this player)
  socket.on('answer-feedback', (data) => {
    const fb = $('#my-feedback');
    const optionsEl = $('#answer-options');

    if (data.correct) {
      playSound('correct');
      state.streak++;
      if (fb) {
        fb.textContent = '✓ Верно';
        fb.className = 'player-feedback-solo correct';
      }
      // Update streak badge
      updateStreakBadge();
    } else {
      playSound('wrong');
      state.streak = 0;
      updateStreakBadge();
      if (fb) {
        fb.textContent = '✗ Неверно';
        fb.className = 'player-feedback-solo wrong';
      }
      // Highlight wrong button, re-enable others
      if (optionsEl) {
        $$('.answer-option-btn', optionsEl).forEach(btn => {
          if (parseInt(btn.dataset.value, 10) === data.givenAnswer) {
            btn.classList.add('wrong');
            btn.disabled = true;
            btn.style.opacity = '0.3';
          } else {
            btn.style.pointerEvents = 'auto';
          }
        });
      }
    }
  });

  function updateStreakBadge() {
    const badge = $('#streak-badge');
    const count = $('#streak-count');
    if (!badge || !count) return;
    if (state.streak >= 2) {
      badge.style.display = 'flex';
      count.textContent = state.streak;
      badge.style.animation = 'none';
      void badge.offsetWidth;
      badge.style.animation = 'streakPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    } else {
      badge.style.display = 'none';
    }
  }

  // Score update
  socket.on('score-update', (data) => {
    if (data.playerSlot === state.myPlayerSlot) {
      state.myScore = data.score;
      const el = $('#my-score-display');
      const soloEl = $('#solo-score-display');
      if (el) {
        el.textContent = data.score;
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'optionCorrect 0.4s ease';
      }
      if (soloEl) {
        soloEl.textContent = data.score;
        soloEl.style.animation = 'none';
        void soloEl.offsetWidth;
        soloEl.style.animation = 'optionCorrect 0.4s ease';
      }
    } else {
      state.opponentScore = data.score;
      const el = $('#opp-score-display');
      if (el) {
        el.textContent = data.score;
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'optionCorrect 0.4s ease';
      }
    }
  });

  // Game over
  socket.on('game-over', (data) => {
    state.isRunning = false;
    state.isSolo = !!data.isSolo;
    navigateTo('results');
    renderResults(data);
  });

  // Opponent disconnected
  socket.on('opponent-disconnected', (data) => {
    showToast('Соперник отключился, но вы можете доиграть!', 'info');
    const oppLabel = $('.opp-label');
    if (oppLabel) oppLabel.textContent = `${state.opponentName} (Откл.)`;
  });

  // Rematch requested by opponent
  socket.on('rematch-requested', (data) => {
    showToast(`${data.playerName} хочет реванш!`, 'info');
    const rematchBtn = $('#rematch-btn');
    if (rematchBtn) {
      rematchBtn.textContent = '✓ Принять реванш';
      rematchBtn.disabled = false;
      rematchBtn.onclick = () => {
        socket.emit('accept-rematch');
      };
    }
  });

  // Rematch accepted
  socket.on('rematch-accepted', () => {
    state.myScore = 0;
    state.opponentScore = 0;
    showToast('Реванш принят! Начинаем! 🔥', 'success');
  });

  // Difficulty changed
  socket.on('difficulty-changed', (data) => {
    state.difficulty = data.difficulty;
    showToast(`Сложность изменена: ${data.difficulty}`, 'info');
  });

  // ──── Quotes Carousel ────
  function initQuotes() {
    renderQuote();
    setInterval(() => {
      state.quoteIndex = (state.quoteIndex + 1) % quotes.length;
      renderQuote();
    }, 6000);
  }

  function renderQuote() {
    const textEl = $('#quote-text');
    const authorEl = $('#quote-author');
    const dots = $$('.quote-dot');
    if (!textEl) return;

    textEl.style.opacity = '0';
    textEl.style.transform = 'translateY(10px)';
    authorEl.style.opacity = '0';

    setTimeout(() => {
      textEl.textContent = quotes[state.quoteIndex].text;
      authorEl.textContent = `— ${quotes[state.quoteIndex].author}`;
      textEl.style.opacity = '1';
      textEl.style.transform = 'translateY(0)';
      authorEl.style.opacity = '1';
      dots.forEach((d, i) => d.classList.toggle('active', i === state.quoteIndex));
    }, 400);
  }

  // ──── Particles ────
  function initParticles() {
    const canvas = $('#particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h;
    const particles = [];
    const PARTICLE_COUNT = 80;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }

    function createParticle() {
      return {
        x: Math.random() * w, y: Math.random() * h,
        radius: Math.random() * 2 + 0.5,
        vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
        alpha: Math.random() * 0.5 + 0.1,
        color: ['59,130,246', '139,92,246', '236,72,153', '6,182,212'][Math.floor(Math.random() * 4)],
      };
    }

    function init() {
      resize();
      particles.length = 0;
      for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(createParticle());
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(139, 92, 246, ${0.06 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
        ctx.fill();
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
      });
      requestAnimationFrame(draw);
    }

    window.addEventListener('resize', resize);
    init();
    draw();
  }

  // ──── Solo Mode Logic ────
  const difficultyNames = {
    easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный',
    algebra: 'Алгебра', geometry: 'Геометрия', logic: 'Логика',
    blitz: 'Блиц', hardcore: 'Хардкор', basic: 'Базовый'
  };

  function renderSoloSetup(preselectedMode) {
    const el = $('#screen-solo-setup');
    const modes = [
      { id: 'easy', icon: '🌱', name: 'Лёгкий', desc: 'Сложение и вычитание (1–10)' },
      { id: 'medium', icon: '🔥', name: 'Средний', desc: '+, −, × (1–15)' },
      { id: 'hard', icon: '💀', name: 'Сложный', desc: '+, −, ×, ÷ (1–30)' },
      { id: 'algebra', icon: '🧮', name: 'Алгебра', desc: 'Уравнения x + a = b' },
      { id: 'geometry', icon: '📐', name: 'Геометрия', desc: 'Площадь и периметр фигур' },
      { id: 'logic', icon: '🧩', name: 'Логика', desc: 'Числовые последовательности' },
      { id: 'blitz', icon: '⚡', name: 'Блиц', desc: 'Лёгкие задачи, 60 секунд' },
      { id: 'hardcore', icon: '💀', name: 'Хардкор', desc: 'Сложные задачи, 120 секунд' },
    ];

    const selected = preselectedMode || 'easy';

    el.innerHTML = `
      <div class="duel-setup">
        <h1>⚡ Штурм</h1>
        <p class="subtitle">Выберите тип задач и испытайте свои навыки</p>

        <div class="difficulty-cards" style="max-width:1000px">
          ${modes.map(m => `
            <div class="difficulty-card ${m.id === selected ? 'selected' : ''}" data-diff="${m.id}">
              <div class="diff-icon">${m.icon}</div>
              <h3>${m.name}</h3>
              <p>${m.desc}</p>
            </div>
          `).join('')}
        </div>

        <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center">
          <button class="btn btn-primary btn-lg" id="solo-start-btn">🚀 Начать</button>
          <button class="btn btn-ghost" id="solo-back-btn">← Назад</button>
        </div>
      </div>
    `;

    let soloDifficulty = selected;

    $$('.difficulty-card', el).forEach(card => {
      card.addEventListener('click', () => {
        $$('.difficulty-card', el).forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        soloDifficulty = card.dataset.diff;
      });
    });

    $('#solo-start-btn').addEventListener('click', () => {
      startSoloMode(soloDifficulty);
    });

    $('#solo-back-btn').addEventListener('click', () => navigateTo('home'));
  }

  function startSoloMode(difficulty) {
    if (!state.currentUser && difficulty !== 'blitz') {
      showToast('Войдите в аккаунт для сохранения результата!', 'info');
    }
    initAudio();
    state.isSolo = true;
    state.difficulty = difficulty;
    state.streak = 0;
    socket.emit('start-solo', { 
      username: state.myName || 'Гость',
      difficulty: difficulty 
    });
  }

  socket.on("solo-started", (data) => {
    state.myPlayerSlot = 1;
    state.isRunning = true;
    state.timeLeft = data.timeLeft || 60;
    state.timeTotal = data.timeLeft || 60;
    state.myScore = 0;
    state.streak = 0;
    
    renderSoloArena();
    navigateTo('solo-arena');
    
    showCountdown(() => {
      console.log("Solo countdown finished");
    });

    showToast(`⚡ Режим «${difficultyNames[state.difficulty] || state.difficulty}» начался`, 'info');
  });

  function renderSoloArena() {
    const el = $('#screen-solo-arena');
    const diffName = difficultyNames[state.difficulty] || state.difficulty;
    el.innerHTML = `
      <div class="duel-arena">
        <div class="duel-header" style="justify-content:space-between">
          <div class="duel-score-left">
            <span class="arena-player-label you-label">Счёт:</span>
            <span class="arena-score my-score" id="solo-score-display">0</span>
          </div>
          <div class="duel-timer">
            <span class="timer-label">Осталось</span>
            <span class="timer-value" id="timer-display">${formatTime(state.timeLeft)}</span>
            <div class="timer-bar-container"><div class="timer-bar" id="timer-bar"></div></div>
          </div>
          <div style="flex:1; text-align:right">
             <span class="diff-badge ${state.difficulty}" style="padding:6px 14px;font-size:0.85rem">${diffName}</span>
          </div>
        </div>

        <div class="streak-badge" id="streak-badge" style="display:none">🔥 <span id="streak-count">0</span></div>

        <div class="duel-problem">
          <div class="problem-label">Индивидуальный зачёт</div>
          <div class="problem-expression" id="problem-display">⏳ Готовим задачи...</div>
        </div>

        <div class="answer-options-grid" id="answer-options"></div>
        <div class="player-feedback" id="my-feedback"></div>

        <div style="margin-top:40px; text-align:center">
          <button class="btn btn-ghost" id="solo-cancel-btn">✕ Прервать игру</button>
        </div>
      </div>
    `;
    $('#solo-cancel-btn').addEventListener('click', () => {
      state.isRunning = false;
      socket.emit('cancel-solo');
      navigateTo('home');
      showToast('Игра отменена', 'info');
    });
  }


  function renderBots() {
    const grid = $('#bots-grid');
    if (!grid) return;
    
    grid.innerHTML = state.bots.map(bot => `
      <div class="bot-card">
        <div class="bot-header">
          <div class="bot-avatar">${bot.avatar}</div>
          <div class="bot-info">
            <div class="bot-name">${bot.name}</div>
            <div class="bot-rating">⭐ ${bot.rating} • ${bot.role}</div>
          </div>
        </div>
        <p class="bot-desc">${bot.desc}</p>
        <div class="bot-stats">
          <div class="bot-stat">
            <span class="bot-stat-label">Скорость</span>
            <span class="bot-stat-value">${bot.time}</span>
          </div>
          <div class="bot-stat">
            <span class="bot-stat-label">Точность</span>
            <span class="bot-stat-value">${bot.accuracy}</span>
          </div>
        </div>
        <button class="btn btn-primary bot-btn" data-bot-id="${bot.id}">⚔️ Бросить вызов</button>
      </div>
    `).join('');
    
    $$('.bot-btn', grid).forEach(btn => {
      btn.addEventListener('click', () => {
        const botId = btn.dataset.botId;
        startBotGame(botId);
      });
    });
  }

  function startBotGame(botId) {
    if (!state.currentUser) {
      showToast('Войдите, чтобы играть с ботами', 'error');
      openModal('login');
      return;
    }
    
    socket.emit('start-bot-game', {
      botId: botId,
      username: state.myName
    });
    
    // UI Feedback
    showToast('Подготовка арены...', 'info');
  }

  // ──── Init ────
  function init() {
    state.myName = localStorage.getItem('sciduel_current') || ''; // Sync immediately
    MathKeyboard.init();
    loadCurrentUser();
    // ── Bug 1.2 fix: fetch daily challenge for all visitors (including guests) ──
    // loadCurrentUser calls fetchDailyChallenge on success; this one handles guests:
    if (!state.myName) {
      fetchDailyChallenge();
    }
    initParticles();
    initQuotes();
    navigateTo('home');
    updateNavHeightVar();
    window.addEventListener('resize', updateNavHeightVar);

    let lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => {
      const nav = $('.navbar');
      if (!nav) return;
      if (document.body.classList.contains('in-game')) return; 
      
      if (window.scrollY > lastScrollY && window.scrollY > 60) {
        nav.classList.add('nav-hidden');
      } else {
        nav.classList.remove('nav-hidden');
      }
      lastScrollY = window.scrollY;
    }, { passive: true });

    document.body.addEventListener('click', initAudio, { once: true });

    const mobileMenuBtn = $('#mobile-menu-btn');
    if (mobileMenuBtn) {
      mobileMenuBtn.onclick = (e) => {
        e.stopPropagation();
        const nav = $('.navbar');
        if (nav) {
          nav.classList.toggle('nav-open');
          console.log('[MobileMenu] Toggle:', nav.classList.contains('nav-open'));
        }
      };
    }
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', (e) => {
      const nav = $('.navbar');
      if (nav && nav.classList.contains('nav-open') && !e.target.closest('.navbar')) {
        nav.classList.remove('nav-open');
      }
    });

    $('#hero-duel-btn').addEventListener('click', () => {
      if (!state.currentUser) {
        showToast('Войдите в аккаунт для создания комнаты', 'error');
        openModal('login');
        return;
      }
      renderDuelSetup();
      navigateTo('duel-setup');
    });
    $('#hero-search-btn').addEventListener('click', () => {
      if (!state.currentUser) {
        showToast('Войдите для поиска соперника', 'error');
        openModal('login');
        return;
      }
      renderMatchmaking();
      navigateTo('matchmaking');
    });
    $('#hero-solo-btn').addEventListener('click', () => {
      renderSoloSetup('blitz');
      navigateTo('solo-setup');
    });
    $('#hero-marathon-btn')?.addEventListener('click', () => {
      renderMarathon();
    });
    $('#hero-practice-btn')?.addEventListener('click', () => {
      renderPracticeMode();
      navigateTo('practice');
    });
    
    $$('.mode-card').forEach(card => {
      card.addEventListener('click', () => {
        const mode = card.dataset.mode;
        renderSoloSetup(mode);
        navigateTo('solo-setup');
      });
    });

    $('#dev-back-btn')?.addEventListener('click', () => navigateTo('home'));
    $('#rules-back-btn')?.addEventListener('click', () => navigateTo('home'));
    $('#bots-back-btn')?.addEventListener('click', () => navigateTo('home'));
    $('#nav-theory-btn')?.addEventListener('click', () => { renderTheory(); navigateTo('theory'); });
    $('#hero-login-btn')?.addEventListener('click', () => openModal('register'));
    $('.navbar-logo').addEventListener('click', () => navigateTo('home'));

    $$('.quote-dot').forEach((dot, i) => {
      dot.addEventListener('click', () => {
        state.quoteIndex = i;
        renderQuote();
      });
    });

    // Tournament back buttons
    $('#tournaments-back-btn')?.addEventListener('click', () => navigateTo('home'));
    $('#tlobby-back-btn')?.addEventListener('click', () => { renderTournaments(); navigateTo('tournaments'); });
  }

  // ═══════════════════════════════════════════════════════════
  // TOURNAMENT MODULE — Olympic System
  // ═══════════════════════════════════════════════════════════

  let tournamentState = {
    current: null,
    matches: [],
    players: []
  };

  const ROUND_NAMES = { 1: 'Четвертьфинал', 2: 'Полуфинал', 3: 'Финал' };
  const DIFFICULTY_LABELS = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный' };

  // ── Tournaments List Screen ──────────────────────────────────────────
  function renderTournaments() {
    const el = document.getElementById('tournaments-list');
    if (!el) return;
    el.innerHTML = '<div class="loading-spinner">Загрузка...</div>';

    socket.emit('get-tournaments', {}, (res) => {
      if (!res || !res.ok) {
        el.innerHTML = '<p style="text-align:center;color:var(--text-muted)">Ошибка загрузки</p>';
        return;
      }
      if (!res.tournaments || res.tournaments.length === 0) {
        el.innerHTML = `
          <div class="tournament-empty">
            <div style="font-size:3rem;margin-bottom:12px">🏆</div>
            <p>Пока нет активных турниров.</p>
            <p style="color:var(--text-muted);font-size:0.9rem">Турниры создаются администраторами.</p>
          </div>
        `;
        return;
      }
      el.innerHTML = res.tournaments.map(t => {
        const statusLabel = t.status === 'waiting' ? '⏳ Ожидание' : '⚡ Активен';
        const statusClass = t.status === 'waiting' ? 'status-waiting' : 'status-active';
        return `
          <div class="tournament-card" data-id="${t.id}">
            <div class="tc-header">
              <div class="tc-name">${t.name}</div>
              <span class="tc-status ${statusClass}">${statusLabel}</span>
            </div>
            <div class="tc-meta">
              ⚔️ Олимпийская система &nbsp;·&nbsp;
              📊 ${DIFFICULTY_LABELS[t.difficulty] || t.difficulty} &nbsp;·&nbsp;
              👥 ${t.playerCount}/${t.max_players}
            </div>
            <button class="btn btn-primary tc-join-btn" data-id="${t.id}">Открыть</button>
          </div>
        `;
      }).join('');

      el.querySelectorAll('.tc-join-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.dataset.id, 10);
          openTournamentLobby(id);
        });
      });
    });
  }

  // ── Tournament Lobby / Bracket Screen ─────────────────────────────────
  function openTournamentLobby(tournamentId, isAdminView = false) {
    socket.emit('get-tournament', { id: tournamentId }, (res) => {
      if (!res || !res.ok) { showToast('Турнир не найден', 'error'); return; }
      tournamentState.current = res.tournament;
      tournamentState.matches = res.matches;
      tournamentState.players = res.players;
      // isAdminView indicates we came from the admin dashboard link

      // Join the socket room for realtime updates
      socket.emit('join-tournament-room', { tournamentId });

      renderTournamentLobby();
      navigateTo('tournament-lobby');
    });
  }

  function renderTournamentLobby() {
    const t = tournamentState.current;
    if (!t) return;

    // Header
    const title = document.getElementById('tlobby-title');
    const subtitle = document.getElementById('tlobby-subtitle');
    if (title) title.textContent = t.name;
    if (subtitle) subtitle.textContent =
      `⚔️ Олимпийская · ${DIFFICULTY_LABELS[t.difficulty] || t.difficulty} · ${t.status === 'waiting' ? 'Ожидание участников' : 'Идёт турнир'}`;

    renderTournamentPlayers();

    if (t.status === 'active' || t.status === 'finished') {
      const bracketPanel = document.getElementById('tlobby-bracket-panel');
      if (bracketPanel) bracketPanel.style.display = '';
      renderBracket();
      const joinArea = document.getElementById('tlobby-join-area');
      if (joinArea) joinArea.style.display = 'none';
    }

    // Admin panel
    if (state.currentUser && state.currentUser.role === 'admin') {
      const adminPanel = document.getElementById('tlobby-admin-panel');
      if (adminPanel) adminPanel.style.display = '';
      renderAdminPanel();
    } else {
      const adminPanel = document.getElementById('tlobby-admin-panel');
      if (adminPanel) adminPanel.style.display = 'none';
    }

    // Join button
    const joinBtn = document.getElementById('tlobby-join-btn');
    if (joinBtn) {
      const alreadyJoined = tournamentState.players.some(
        p => p.username === (state.currentUser && state.currentUser.username)
      );
      if (t.status !== 'waiting' || alreadyJoined) {
        joinBtn.style.display = 'none';
      } else {
        joinBtn.style.display = '';
        joinBtn.onclick = () => {
          if (!state.currentUser) { openModal('login'); return; }
          socket.emit('join-tournament', {
            tournamentId: t.id,
            username: state.currentUser.username
          }, (res) => {
            if (!res.ok) { showToast(res.msg || 'Ошибка', 'error'); return; }
            tournamentState.players = res.players;
            renderTournamentPlayers();
            showToast('✅ Вы записаны в турнир!', 'success');
            joinBtn.style.display = 'none';
          });
        };
      }
    }
  }

  function renderTournamentPlayers() {
    const el = document.getElementById('tlobby-players');
    const countEl = document.getElementById('tlobby-count');
    if (!el) return;
    const players = tournamentState.players;
    if (countEl) countEl.textContent = players.length;

    if (players.length === 0) {
      el.innerHTML = '<p style="color:var(--text-muted)">Пока никто не записался</p>';
      return;
    }
    el.innerHTML = players.map((p, i) => {
      const statusIcon = p.status === 'winner' ? '🏆' : (p.status === 'eliminated' ? '❌' : '✅');
      const initial = p.username.charAt(0).toUpperCase();
      return `
        <div class="tp-row">
          <div class="tp-seed">#${i + 1}</div>
          <div class="tp-avatar">${initial}</div>
          <div class="tp-name" style="flex:1">${p.username}</div>
          <div class="tp-status">${statusIcon}</div>
        </div>
      `;
    }).join('');
  }

  function renderBracket() {
    const el = document.getElementById('bracket-wrap');
    if (!el) return;
    const matches = tournamentState.matches;

    const byRound = { 1: [], 2: [], 3: [] };
    matches.forEach(m => { if (byRound[m.round]) byRound[m.round].push(m); });

    const renderMatch = (m) => {
      const p1 = m.player1 || 'TBD';
      const p2 = m.player2 || 'TBD';
      const winnerClass1 = m.winner === m.player1 ? 'bracket-winner' : '';
      const winnerClass2 = m.winner === m.player2 ? 'bracket-winner' : '';
      const statusBadge = m.status === 'finished' ? '<span class="bracket-done">✓</span>' :
                          m.status === 'active'   ? '<span class="bracket-live">LIVE</span>' : '';
      return `
        <div class="bracket-match">
          ${statusBadge}
          <div class="bracket-player ${winnerClass1}">${p1}<span class="bracket-score">${m.score_p1 !== null ? m.score_p1 : ''}</span></div>
          <div class="bracket-player ${winnerClass2}">${p2}<span class="bracket-score">${m.score_p2 !== null ? m.score_p2 : ''}</span></div>
        </div>
      `;
    };

    el.innerHTML = `
      <div class="bracket-grid">
        <div class="bracket-round">
          <div class="bracket-round-label">Четвертьфинал</div>
          ${(byRound[1]).map(renderMatch).join('')}
        </div>
        <div class="bracket-round">
          <div class="bracket-round-label">Полуфинал</div>
          ${(byRound[2]).map(renderMatch).join('')}
        </div>
        <div class="bracket-round">
          <div class="bracket-round-label">Финал</div>
          ${(byRound[3]).map(renderMatch).join('')}
        </div>
      </div>
    `;
  }

  function renderAdminPanel() {
    const el = document.getElementById('admin-matches-list');
    if (!el) return;
    const matches = tournamentState.matches.filter(
      m => m.status === 'pending' && m.player1 && m.player2
    );

    if (matches.length === 0) {
      el.innerHTML = '<p style="color:var(--text-muted)">Нет матчей готовых к старту</p>';
      return;
    }
    el.innerHTML = matches.map(m => {
      const isStarted = !!m.room_code;
      return `
        <div class="admin-match-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; margin-bottom:8px">
          <span>${ROUND_NAMES[m.round]} — м.${m.match_number}: <strong>${m.player1}</strong> vs <strong>${m.player2}</strong></span>
          ${isStarted ? 
            `<span style="color:var(--accent-green); font-size:0.9rem">🎮 В процессе...</span>` : 
            `<button class="btn btn-primary btn-sm" data-match-id="${m.id}" id="start-match-btn-${m.id}">▶ Запустить вручную</button>`
          }
        </div>
      `;
    }).join('');

    el.querySelectorAll('[data-match-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const matchId = parseInt(btn.dataset.matchId, 10);
        btn.disabled = true;
        btn.textContent = '⏳ Запуск...';
        socket.emit('start-tournament-match', { matchId }, (res) => {
          if (!res.ok) {
            showToast(res.msg || 'Ошибка', 'error');
            btn.disabled = false;
            btn.textContent = '▶ Запустить вручную';
          } else {
            showToast('Матчи запущены!', 'success');
          }
        });
      });
    });
  }

  // ── Realtime tournament updates ───────────────────────────────────────
  socket.on('tournament-players-updated', (data) => {
    if (!tournamentState.current) return;
    tournamentState.players = data.players;
    renderTournamentPlayers();
  });

  socket.on('tournament-started', (data) => {
    tournamentState.current  = data.tournament;
    tournamentState.matches  = data.matches;
    tournamentState.players  = data.players;
    if ($('#screen-tournament-lobby.active')) {
      renderTournamentLobby();
    }
    showToast('🏆 Турнир начался!', 'success');
  });

  socket.on('tournament-updated', (data) => {
    tournamentState.current = data.tournament;
    tournamentState.matches = data.matches;
    tournamentState.players = data.players;
    if ($('#screen-tournament-lobby.active')) {
      renderBracket();
      renderAdminPanel();
      renderTournamentPlayers();
    }
    if (data.tournament.status === 'finished') {
      const winner = data.players.find(p => p.status === 'winner');
      if (winner) showToast(`🏆 Победитель турнира: ${winner.username}!`, 'success');
    }
  });

  // ── Bug 1.3: Tournament match auto-join fix ──
  // When server signals match ready, both players join the room automatically
  socket.on('tournament-match-ready', (data) => {
    // Bug 1.1 fix: use state.currentUser.username as fallback if myName is empty
    const me = state.myName || (state.currentUser && state.currentUser.username) || '';
    console.log(`[Tournament] match-ready event: player1=${data.player1}, player2=${data.player2}, me=${me}, roomCode=${data.roomCode}`);

    if (!me || (me !== data.player1 && me !== data.player2)) {
      console.log(`[Tournament] Not my match, skipping. me='${me}'`);
      return;
    }

    showToast(`⚔️ Ваш матч начинается! ${ROUND_NAMES[data.round] || 'Раунд ' + data.round}`, 'success');
    setTimeout(() => {
      // Bug 1.3 fix: use 'roomCode' key (matching server's data.roomCode parser)
      console.log(`[Tournament] Joining room ${data.roomCode} as ${me}`);
      
      // Fix: Set state variables specifically for the tournament match arena
      state.roomCode = data.roomCode;
      state.myName = me;
      state.myPlayerSlot = (data.player1 === me) ? 1 : 2;
      state.opponentName = (data.player1 === me) ? data.player2 : data.player1;
      state.isTournament = true;
      state.tournamentId = tournamentState.current ? tournamentState.current.id : null;

      socket.emit('join-room', { roomCode: data.roomCode, playerName: me });
      // join-room doesn't use a callback — navigate on room-update event
      // A one-time listener to catch the room-update for this match
      const onRoomUpdate = (roomData) => {
        if (roomData.code === data.roomCode) {
          socket.off('room-update', onRoomUpdate);
          console.log(`[Tournament] Successfully joined room ${data.roomCode}, navigating to lobby`);
          navigateTo('lobby');
        }
      };
      socket.on('room-update', onRoomUpdate);
      // Cleanup listener if room never responds
      setTimeout(() => socket.off('room-update', onRoomUpdate), 10000);
    }, 1500);
  });

  // Handle ?tournament=ID&admin=true URL params
  function checkTournamentURLParam() {
    const params = new URLSearchParams(window.location.search);
    const tid = params.get('tournament');
    const isAdmin = params.get('admin') === 'true';
    if (tid) {
      setTimeout(() => {
        openTournamentLobby(parseInt(tid, 10), isAdmin);
      }, 800);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ADMIN PANEL UI SYSTEM (Built-in)
  // ═══════════════════════════════════════════════════════════

  function renderAdminPanelUI() {
    initAdminTabs();
    loadAdminTournaments();
    loadAdminUsers();
  }

  function initAdminTabs() {
    const tabs = $$('.admin-tab-btn');
    const contents = $$('.admin-tab-content');
    
    // Set default tab visibility
    contents.forEach(c => c.style.display = 'none');
    const defaultTab = $('#admin-tab-users');
    if (defaultTab) defaultTab.style.display = 'block';

    tabs.forEach(btn => {
      btn.onclick = () => {
        const target = btn.dataset.tab;
        
        // UI Update (Buttons)
        tabs.forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
        });
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        
        // Content Visibility
        contents.forEach(c => {
          c.style.display = c.id === `admin-tab-${target}` ? 'block' : 'none';
        });

        // Specific Tab Data Reloading
        if (target === 'users') loadAdminUsers();
        if (target === 'tournaments') loadAdminTournaments();
      };
    });
  }

  const userSearchInput = $('#admin-user-search');
  if (userSearchInput) {
    let searchTimeout;
    userSearchInput.oninput = () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        loadAdminUsers(userSearchInput.value.trim());
      }, 400);
    };
  }

  const adminCreateBtn = $('#admin-create-btn');
  if (adminCreateBtn) {
    adminCreateBtn.addEventListener('click', () => {
      const name = $('#admin-t-name').value.trim();
      const difficulty = $('#admin-t-diff').value;
      if (!name) { showToast('Укажите название!', 'error'); return; }
      socket.emit('create-tournament', { name, difficulty }, (res) => {
        if (res.ok) {
          showToast(`Турнир создан: "${res.tournament.name}"`, 'success');
          $('#admin-t-name').value = '';
          loadAdminTournaments();
        } else {
          showToast(res.msg, 'error');
        }
      });
    });
  }

  const adminDcBtn = $('#admin-dc-btn');
  if (adminDcBtn) {
    adminDcBtn.addEventListener('click', () => {
      const grade = parseInt($('#admin-dc-grade').value);
      const text = $('#admin-dc-text').value.trim();
      const answer = $('#admin-dc-answer').value.trim();
      if (!text || !answer) { showToast('Заполните текст задачи и ответ', 'error'); return; }
      socket.emit('admin-set-challenge', { grade, text, answer }, (res) => {
        if (res.ok) {
          showToast(`Задача для ${grade} класса опубликована!`, 'success');
          $('#admin-dc-text').value = '';
          $('#admin-dc-answer').value = '';
        } else {
          showToast(res.msg || 'Ошибка публикации', 'error');
        }
      });
    });
  }
  // End of adminDcBtn block

  function loadAdminTournaments() {
    socket.emit('get-tournaments', {}, (res) => {
      const el = $('#admin-tournaments-list');
      if (!el) return;
      if (!res.ok || !res.tournaments.length) {
        el.innerHTML = '<p style="color:var(--text-muted)">Нет активных турниров</p>';
        return;
      }
      el.innerHTML = res.tournaments.map(t => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:12px;margin-bottom:8px;transition:all 0.3s ease;" class="admin-item">
          <div style="display:flex;flex-direction:column;gap:4px">
            <span style="font-size:1.1rem;font-weight:600;color:var(--text-primary)">${t.name}</span>
            <div style="display:flex;gap:12px;font-size:0.85rem;color:var(--text-muted)">
              <span>Статус: <span style="color:${t.status === 'active' ? '#10b981' : (t.status === 'waiting' ? '#f59e0b' : '#ef4444')}">${t.status.toUpperCase()}</span></span>
              <span>Игроков: ${t.playerCount}/${t.max_players}</span>
            </div>
          </div>
          <div style="display:flex;gap:10px">
            ${t.status === 'waiting' ? `<button class="btn btn-primary btn-sm" onclick="window.adminStartTournament(${t.id})">▶ Запустить</button>` : ''}
            <button class="btn btn-secondary btn-sm" onclick="window.adminOpenLobby(${t.id})">🔗 Лобби</button>
            <button class="btn btn-danger btn-sm" onclick="window.adminCancelTournament(${t.id})">✕ Отменить</button>
          </div>
        </div>
      `).join('');
    });
  }

  function loadAdminUsers(searchQuery = '') {
    socket.emit('admin-get-users', { search: searchQuery }, (res) => {
      const el = $('#admin-users-list');
      if (!el) return;
      if (!res.ok) {
        el.innerHTML = '<p style="color:#ef4444">Ошибка: ' + res.msg + '</p>';
        return;
      }
      el.innerHTML = res.users.map(u => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:12px;margin-bottom:8px;" class="admin-item">
          <div style="display:flex;align-items:center;gap:16px">
            <div style="width:40px;height:40px;border-radius:20px;background:var(--gradient-main);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.2rem;color:white;box-shadow:0 4px 12px rgba(99,102,241,0.3)">
              ${u.username.charAt(0).toUpperCase()}
            </div>
            <div style="display:flex;flex-direction:column;gap:2px">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-weight:700;font-size:1rem;color:var(--text-primary)">${u.username}</span>
                <span style="font-size:0.65rem;font-weight:800;padding:2px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:0.5px;
                  ${u.role === 'admin' ? 'background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.2)' : 'background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.2)'}">
                  ${u.role}
                </span>
                <span style="font-size:0.75rem;color:var(--text-muted)">• ${u.grade} класс</span>
              </div>
              <span style="font-size:0.8rem;color:var(--text-muted)">Игр: ${u.duelgames + u.sologames} (W:${u.wins} / L:${u.losses})</span>
            </div>
          </div>
          <div style="display:flex;gap:10px">
            ${u.role === 'admin' 
              ? `<button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="window.adminChangeRole('${u.username}', 'user')">Снять админа</button>`
              : `<button class="btn btn-ghost btn-sm" style="color:#34d399" onclick="window.adminChangeRole('${u.username}', 'admin')">Дать админа</button>`
            }
            <button class="btn btn-danger btn-sm" onclick="window.adminDeleteUser('${u.username}')">🗑️ Удалить</button>
          </div>
        </div>
      `).join('');
    });
  }

  window.adminStartTournament = function(id) {
    if (!confirm('Запустить формулу турнира (перемешивание игроков)?')) return;
    socket.emit('start-tournament', { tournamentId: id }, (res) => {
      if (res.ok) {
        showToast('Турнир запущен! Матчей ' + res.matches.length, 'success');
        loadAdminTournaments();
      } else showToast(res.msg, 'error');
    });
  };

  window.adminChangeRole = function(username, newRole) {
    if (!confirm(`Изменить права пользователя ${username} на ${newRole}?`)) return;
    socket.emit('admin-set-role', { username, role: newRole }, (res) => {
      if (res.ok) {
        showToast(`Роль ${username} изменена!`, 'success');
        loadAdminUsers();
      } else showToast(res.msg, 'error');
    });
  };

  window.adminOpenLobby = function(id) {
    openTournamentLobby(id, true);
  };

  window.adminDeleteUser = function(username) {
    if (!confirm(`Точно удалить пользователя ${username} НАВСЕГДА? Это действие нельзя отменить!`)) return;
    socket.emit('admin-delete-user', { username }, (res) => {
      if (res.ok) {
        showToast(`Пользователь ${username} удалён`, 'success');
        loadAdminUsers();
      } else showToast(res.msg, 'error');
    });
  };

  window.adminCancelTournament = function(id) {
    if (!confirm(`Вы уверены, что хотите отменить турнир #${id}?`)) return;
    socket.emit('admin-cancel-tournament', { tournamentId: id }, (res) => {
      if (res.ok) {
        showToast(`Турнир #${id} отменён`, 'success');
        loadAdminTournaments();
      } else showToast(res.msg, 'error');
    });
  };

  document.addEventListener('DOMContentLoaded', () => { init(); checkTournamentURLParam(); });
})();
