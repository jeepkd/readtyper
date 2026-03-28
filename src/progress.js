/**
 * Progress & Motivation — streaks, goals, milestones
 */

const STREAK_KEY = 'readtyper_streak';
const GOAL_KEY = 'readtyper_goal';
const DAILY_KEY = 'readtyper_daily';
const COMPLETED_BOOKS_KEY = 'readtyper_completed_books';

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ========== STREAKS ==========

export function getStreakData() {
  try {
    return JSON.parse(localStorage.getItem(STREAK_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Record activity for today and update streak
 */
export function recordActivity() {
  const data = getStreakData();
  const todayStr = today();

  if (data.lastActiveDate === todayStr) {
    return data; // Already recorded today
  }

  if (data.lastActiveDate === yesterday()) {
    // Continuing streak
    data.currentStreak = (data.currentStreak || 0) + 1;
  } else if (data.lastActiveDate !== todayStr) {
    // Streak broken or first day
    data.currentStreak = 1;
  }

  data.lastActiveDate = todayStr;
  data.longestStreak = Math.max(data.longestStreak || 0, data.currentStreak);
  localStorage.setItem(STREAK_KEY, JSON.stringify(data));
  return data;
}

export function getCurrentStreak() {
  const data = getStreakData();
  const todayStr = today();
  const yesterdayStr = yesterday();

  if (data.lastActiveDate === todayStr || data.lastActiveDate === yesterdayStr) {
    return data.currentStreak || 0;
  }
  return 0;
}

// ========== DAILY GOALS ==========

export function getDailyGoal() {
  try {
    return parseInt(localStorage.getItem(GOAL_KEY) || '500', 10);
  } catch {
    return 500;
  }
}

export function setDailyGoal(words) {
  localStorage.setItem(GOAL_KEY, String(words));
}

export function getDailyProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(DAILY_KEY) || '{}');
    if (data.date !== today()) {
      return { date: today(), wordsTyped: 0 };
    }
    return data;
  } catch {
    return { date: today(), wordsTyped: 0 };
  }
}

export function addDailyWords(count) {
  const data = getDailyProgress();
  data.date = today();
  data.wordsTyped = (data.wordsTyped || 0) + count;
  localStorage.setItem(DAILY_KEY, JSON.stringify(data));
  return data;
}

export function getDailyGoalPercent() {
  const goal = getDailyGoal();
  const progress = getDailyProgress();
  if (goal <= 0) return 100;
  return Math.min(100, Math.round((progress.wordsTyped / goal) * 100));
}

// ========== MILESTONES ==========

const MILESTONE_THRESHOLDS = [25, 50, 75, 100];

/**
 * Check if a milestone has been reached
 * @param {number} progressPercent - current book progress percentage
 * @param {string} bookId
 * @returns {number|null} - milestone percentage or null
 */
export function checkMilestone(progressPercent, bookId) {
  const key = `readtyper_milestones_${bookId}`;
  let reached;
  try {
    reached = JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    reached = [];
  }

  for (const threshold of MILESTONE_THRESHOLDS) {
    if (progressPercent >= threshold && !reached.includes(threshold)) {
      reached.push(threshold);
      localStorage.setItem(key, JSON.stringify(reached));
      return threshold;
    }
  }
  return null;
}

// ========== COMPLETED BOOKS ==========

export function getCompletedBooksCount() {
  try {
    return parseInt(localStorage.getItem(COMPLETED_BOOKS_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

export function incrementCompletedBooks() {
  const count = getCompletedBooksCount() + 1;
  localStorage.setItem(COMPLETED_BOOKS_KEY, String(count));
  return count;
}

/**
 * Estimate time remaining to finish book
 * @param {number} wordsRemaining
 * @param {number} currentWpm
 * @returns {string} formatted time
 */
export function estimateTimeToFinish(wordsRemaining, currentWpm) {
  if (!currentWpm || currentWpm <= 0) return '—';
  const minutes = wordsRemaining / currentWpm;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}
