# Структура компонентов SciDuel

## 1. Основные страницы / Экраны
- [x] `screen-home` — Главная страница
- [x] `screen-community` — Сообщество
- [x] `screen-community-task-details` — Детали задачи и чат
- [x] `screen-theory` — Список тем теории
- [x] `screen-theory-topic` — Экран конкретной темы
- [x] `screen-practice` — Режим бесконечной практики
- [x] `screen-profile` — Профиль пользователя
- [x] `screen-settings` — Настройки
- [x] `screen-rules` — Правила
- [x] `screen-bots` — Выбор бота
- [x] `screen-solo-setup` — Настройка соло-режима
- [x] `screen-solo-arena` — Арена соло-режима
- [x] `screen-marathon` — Режим марафона
- [x] `screen-duel-setup` — Создание комнаты дуэли
- [x] `screen-lobby` — Лобби ожидания
- [x] `screen-matchmaking` — Поиск оппонента
- [x] `screen-duel-arena` — Арена дуэли
- [x] `screen-results` — Экран результатов матча
- [x] `screen-leaderboard` — Таблица лидеров
- [x] `screen-development` — Заглушка «В разработке»

## 2. Переиспользуемые UI-компоненты
- [x] `Button` — `.btn` (различные варианты: primary, secondary, ghost, danger, success)
- [x] `Modal` — `.modal-overlay` и функция `openModal`
- [x] `Toast` — `showToast` для уведомлений
- [x] `MathKeyboard` — `#math-keyboard` (виртуальная клавиатура)
- [x] `QuoteCard` — `.quote-card` на главной
- [x] `FeatureCard` — `.feature-card` / `.mode-card`
- [x] `ActivityItem` — Элемент живой ленты
- [x] `UserAvatar` — `.user-avatar` (круг с инициалом)
- [x] `LevelBadge` — `.level-badge`
- [x] `Timer` — `.duel-timer`, `.solo-timer`

## 3. Подозрительные CSS-правила
- [x] `.screen { padding-top: 80px; }` — Жесткая привязка к высоте навбара (магическое число).
- [x] `.hero { padding: 60px 24px; }` — Магические отступы.
- [x] `.activity-feed-section` — Инлайновые стили в HTML (margin: 48px auto).
- [x] `.modal { padding: 40px; }` — Ручное управление padding.
- [x] Множество `margin-bottom: 24px`, `32px`, `48px` — дублирование, не использующее переменные.

## 4. Цветовая схема (текущая и планируемая)
- [x] Основной фон: `var(--bg-primary)` (#0a0e1a)
- [x] Акцентный синий: `var(--accent-blue)` (#3b82f6)
- [x] Акцентный фиолетовый: `var(--accent-purple)` (#8b5cf6)
- [x] Текст основной: `var(--text-primary)` (#f0f4ff)
- [x] Стекло: `var(--bg-glass)`
