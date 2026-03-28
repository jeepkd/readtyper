/**
 * ReadTyper — Main Application Module
 * Ties together all modules and manages UI state
 */

import './index.css';
import { parseBook } from './bookParser.js';
import {
  getLibrary,
  saveBook,
  deleteBook,
  getBook,
  getBookProgress,
  updateBookProgress,
  addSession,
  calcBookProgressPercent,
} from './bookLibrary.js';
import { TypingEngine } from './typingEngine.js';
import { fetchDefinition, getCachedDefinition, fetchDefinitionsBatch } from './dictionary.js';
import {
  recordActivity,
  getCurrentStreak,
  getDailyGoal,
  setDailyGoal,
  getDailyGoalPercent,
  addDailyWords,
  checkMilestone,
  getCompletedBooksCount,
  incrementCompletedBooks,
  estimateTimeToFinish,
} from './progress.js';

// ========== STATE ==========
let currentBookId = null;
let currentBook = null;
let currentChapterIdx = 0;
let engine = new TypingEngine();
let dictDefinitions = {};
let sessionStartTime = null;
let sessionWordsAtStart = 0;
let lastRenderedWordIdx = -1;

// ========== DOM REFERENCES ==========
const $ = (id) => document.getElementById(id);

const libraryView = $('library-view');
const typingView = $('typing-view');
const fileInput = $('file-input');
const booksGrid = $('books-grid');
const emptyLibrary = $('empty-library');
const backBtn = $('back-to-library');

// Stats (sidebar)
const statWpm = $('stat-wpm');
const statAccuracy = $('stat-accuracy');
const statErrors = $('stat-errors');
const statTime = $('stat-time');
const statWordsTyped = $('stat-words-typed');
const statEta = $('stat-eta');

// Real-time stats (above typing area)
const rtWpm = $('rt-wpm');
const rtAccuracy = $('rt-accuracy');
const rtTime = $('rt-time');
const rtWords = $('rt-words');
const rtLiveWpm = $('rt-live-wpm');

// Chapter stats
const chBestWpm = $('ch-best-wpm');
const chBestAccuracy = $('ch-best-accuracy');
const chTotalTime = $('ch-total-time');
const chSessions = $('ch-sessions');

// Book info
const bookTitle = $('current-book-title');
const bookAuthor = $('current-book-author');
const bookProgressFill = $('book-progress-fill');
const bookProgressText = $('book-progress-text');

// Typing
const textDisplay = $('text-display');
const typingInput = $('typing-input');

// Chapter nav
const chapterList = $('chapter-list');

// Dictionary
const dictList = $('dict-list');

// Header stats
const streakCount = $('streak-count');
const booksCompletedCount = $('books-completed-count');
const goalRingFill = $('goal-ring-fill');
const goalProgressText = $('goal-progress-text');

// Settings
const settingsModal = $('settings-modal');
const settingsClose = $('settings-close');
const dailyGoalInput = $('daily-goal-input');

// Toast
const milestoneToast = $('milestone-toast');
const toastMessage = $('toast-message');

// ========== INITIALIZATION ==========
function init() {
  renderLibrary();
  updateHeaderStats();

  // Event listeners
  fileInput.addEventListener('change', handleFileImport);
  backBtn.addEventListener('click', goToLibrary);

  // Focus typing input when clicking on text display
  textDisplay.addEventListener('click', () => {
    typingInput.focus();
  });

  // Typing input handler
  typingInput.addEventListener('keydown', (e) => {
    // Skip shortcuts
    if (e.ctrlKey && e.key === 'ArrowRight') {
      e.preventDefault();
      if (e.shiftKey) {
        skipToNextSentence();
      } else {
        skipWords(10);
      }
      return;
    }
    engine.handleKey(e);
  });

  // Skip buttons
  $('skip-10').addEventListener('click', () => {
    skipWords(10);
    typingInput.focus();
  });
  $('skip-sentence').addEventListener('click', () => {
    skipToNextSentence();
    typingInput.focus();
  });
  $('skip-n').addEventListener('click', () => {
    const n = parseInt($('skip-count').value, 10) || 10;
    skipWords(n);
    typingInput.focus();
  });

  // Settings
  dailyGoalInput.value = getDailyGoal();
  if (settingsClose) {
    settingsClose.addEventListener('click', () => {
      settingsModal.classList.remove('visible');
    });
  }
  dailyGoalInput.addEventListener('change', () => {
    setDailyGoal(parseInt(dailyGoalInput.value, 10) || 500);
    updateHeaderStats();
  });

  // Keep typing input focused
  document.addEventListener('click', (e) => {
    if (typingView.classList.contains('active') && !e.target.closest('.sidebar') && !e.target.closest('.dictionary-panel') && !e.target.closest('.modal') && !e.target.closest('.skip-controls')) {
      typingInput.focus();
    }
  });
}

// ========== LIBRARY VIEW ==========

function renderLibrary() {
  const library = getLibrary();

  if (library.length === 0) {
    booksGrid.innerHTML = '';
    emptyLibrary.classList.add('visible');
    return;
  }

  emptyLibrary.classList.remove('visible');

  booksGrid.innerHTML = library
    .map((book) => {
      const progress = getBookProgress(book.id);
      const percent = calcBookProgressPercent(book, progress);
      const chaptersComplete = progress.completedChapters ? progress.completedChapters.length : 0;

      return `
      <div class="book-card" data-book-id="${book.id}">
        <div class="book-card-actions">
          <button class="delete-book-btn" data-delete-id="${book.id}" title="Delete book">&times;</button>
        </div>
        <div class="book-card-header">
          <div>
            <div class="book-card-title">${escapeHtml(book.title)}</div>
            <div class="book-card-author">${escapeHtml(book.author)}</div>
          </div>
          <span class="book-card-format">${book.format}</span>
        </div>
        <div class="book-card-stats">
          <span>📄 ${book.chapters.length} chapters</span>
          <span>📝 ${formatNumber(book.totalWords)} words</span>
          <span>✅ ${chaptersComplete}/${book.chapters.length}</span>
        </div>
        <div class="book-card-progress">
          <div class="book-card-progress-fill" style="width: ${percent}%"></div>
        </div>
        <div class="book-card-progress-text">${percent}% complete</div>
      </div>
    `;
    })
    .join('');

  // Card click handlers
  booksGrid.querySelectorAll('.book-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.delete-book-btn')) return;
      const bookId = card.dataset.bookId;
      openBook(bookId);
    });
  });

  // Delete buttons
  booksGrid.querySelectorAll('.delete-book-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteId;
      if (confirm('Delete this book from your library?')) {
        deleteBook(id);
        renderLibrary();
      }
    });
  });
}

async function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const book = await parseBook(file);
    saveBook(book);
    renderLibrary();
    updateHeaderStats();
  } catch (err) {
    console.error('Failed to parse book:', err);
    alert('Failed to parse the book. Please make sure it\'s a valid EPUB or TXT file.');
  }

  fileInput.value = ''; // Reset input
}

// ========== TYPING VIEW ==========

function openBook(bookId) {
  currentBook = getBook(bookId);
  if (!currentBook) return;

  currentBookId = bookId;
  const progress = getBookProgress(bookId);
  currentChapterIdx = progress.currentChapter || 0;

  // Ensure chapter index is valid
  if (currentChapterIdx >= currentBook.chapters.length) {
    currentChapterIdx = 0;
  }

  showView('typing');
  loadChapter(currentChapterIdx, progress.currentWord || 0);
}

function loadChapter(chapterIdx, startWord = 0) {
  currentChapterIdx = chapterIdx;
  const chapter = currentBook.chapters[chapterIdx];
  if (!chapter) return;

  // Setup engine
  engine.destroy();
  engine = new TypingEngine();
  engine.load(chapter.words, startWord);
  lastRenderedWordIdx = -1;

  engine.onUpdate = (state) => {
    updateWordDisplay();
    updateStats(state);
    saveCurrentProgress();
  };

  engine.onWordComplete = (wordIdx, word) => {
    addDailyWords(1);
    updateHeaderStats();
    recordActivity();

    // Scroll dictionary to current word
    scrollDictToWord(engine.currentWordIndex);
    highlightDictWord(engine.currentWordIndex);

    // Fetch definition for upcoming words
    const lookAhead = 5;
    for (let i = engine.currentWordIndex; i < Math.min(engine.currentWordIndex + lookAhead, chapter.words.length); i++) {
      const w = chapter.words[i];
      if (!getCachedDefinition(w)) {
        fetchDefinition(w).then(() => {
          updateDictCardByIdx(i);
        });
      }
    }
  };

  engine.onChapterComplete = () => {
    completeChapter();
  };

  sessionStartTime = Date.now();
  sessionWordsAtStart = engine.currentWordIndex;

  // Update UI
  updateBookInfo();
  renderChapterNav();
  updateChapterStats();
  initialRenderTextDisplay();
  loadDictionary(chapter.words);

  // Focus input
  setTimeout(() => typingInput.focus(), 100);
}

/**
 * Build the full text display once. Each word gets a stable DOM element.
 */
function initialRenderTextDisplay() {
  const chapter = currentBook.chapters[currentChapterIdx];
  const words = chapter.words;
  const startWord = engine.currentWordIndex;

  let html = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const isTyped = i < startWord;
    const isCurrent = i === startWord;
    const classes = ['word'];
    if (isCurrent) classes.push('current');
    if (isTyped) classes.push('typed');

    const charsHtml = word
      .split('')
      .map((char, ci) => {
        let state = 'upcoming';
        if (isTyped) state = 'correct';
        else if (isCurrent && ci === 0) state = 'cursor';
        return `<span class="char ${state}">${escapeHtml(char)}</span>`;
      })
      .join('');

    html += `<span class="${classes.join(' ')}" id="word-${i}" data-word-idx="${i}">${charsHtml}</span>`;
  }

  textDisplay.innerHTML = html;
  lastRenderedWordIdx = startWord;
  scrollCurrentWordIntoView();
}

/**
 * Incrementally update only the affected word elements (no full re-render).
 */
function updateWordDisplay() {
  const state = engine.getState();
  const chapter = currentBook.chapters[currentChapterIdx];
  const words = chapter.words;
  const currIdx = state.currentWordIndex;

  // If we moved to a new word, finalize the previous one
  if (lastRenderedWordIdx !== currIdx && lastRenderedWordIdx >= 0 && lastRenderedWordIdx < words.length) {
    const prevEl = document.getElementById(`word-${lastRenderedWordIdx}`);
    if (prevEl) {
      prevEl.className = engine.wordErrors[lastRenderedWordIdx] ? 'word typed has-error' : 'word typed';
      const prevWord = words[lastRenderedWordIdx];
      prevEl.innerHTML = prevWord
        .split('')
        .map((c) => `<span class="char correct">${escapeHtml(c)}</span>`)
        .join('');
    }
  }

  // Update current word's character states
  if (currIdx < words.length) {
    const currEl = document.getElementById(`word-${currIdx}`);
    if (currEl) {
      currEl.className = 'word current';
      const word = words[currIdx];
      currEl.innerHTML = word
        .split('')
        .map((char, ci) => {
          let charState = 'upcoming';
          if (ci < state.typedBuffer.length) {
            charState = state.typedBuffer[ci] === char ? 'correct' : 'incorrect';
          } else if (ci === state.typedBuffer.length) {
            charState = 'cursor';
          }
          return `<span class="char ${charState}">${escapeHtml(char)}</span>`;
        })
        .join('');
    }

    // Only scroll when word changes (not on every char)
    if (lastRenderedWordIdx !== currIdx) {
      scrollCurrentWordIntoView();
    }
  }

  lastRenderedWordIdx = currIdx;
}

function scrollCurrentWordIntoView() {
  const el = textDisplay.querySelector('.word.current');
  if (el) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function updateStats(state) {
  const elapsed = state.elapsed;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;

  // Sidebar stats
  statWpm.textContent = state.wpm;
  statAccuracy.textContent = `${state.accuracy}%`;
  statErrors.textContent = state.errorCount;
  statWordsTyped.textContent = state.wordsCompleted;
  statTime.textContent = timeStr;

  // ETA
  const totalRemaining = getTotalRemainingWords();
  statEta.textContent = estimateTimeToFinish(totalRemaining, state.wpm);

  // Real-time stats bar
  rtWpm.textContent = state.wpm;
  rtAccuracy.textContent = `${state.accuracy}%`;
  rtTime.textContent = timeStr;
  rtWords.textContent = state.wordsCompleted;
  rtLiveWpm.textContent = state.liveWpm !== null ? state.liveWpm : '—';

  // Update book progress
  const progress = getBookProgress(currentBookId);
  const percent = calcBookProgressPercent(currentBook, progress);
  bookProgressFill.style.width = `${percent}%`;
  bookProgressText.textContent = `${percent}%`;

  // Check milestones
  const milestone = checkMilestone(percent, currentBookId);
  if (milestone) {
    showMilestoneToast(milestone);
  }
}

function getTotalRemainingWords() {
  if (!currentBook) return 0;
  let remaining = 0;
  for (let i = currentChapterIdx; i < currentBook.chapters.length; i++) {
    if (i === currentChapterIdx) {
      remaining += currentBook.chapters[i].words.length - engine.currentWordIndex;
    } else {
      remaining += currentBook.chapters[i].words.length;
    }
  }
  return remaining;
}

function saveCurrentProgress() {
  if (!currentBookId) return;
  updateBookProgress(currentBookId, {
    currentChapter: currentChapterIdx,
    currentWord: engine.currentWordIndex,
  });
}

function completeChapter() {
  const progress = getBookProgress(currentBookId);
  if (!progress.completedChapters) progress.completedChapters = [];
  if (!progress.completedChapters.includes(currentChapterIdx)) {
    progress.completedChapters.push(currentChapterIdx);
  }

  // Save session
  const state = engine.getState();
  addSession(currentBookId, {
    chapter: currentChapterIdx,
    wpm: state.wpm,
    accuracy: state.accuracy,
    errors: state.errorCount,
    wordsTyped: state.wordsCompleted,
    duration: state.elapsed,
  });

  // Move to next chapter
  const nextChapter = currentChapterIdx + 1;
  if (nextChapter < currentBook.chapters.length) {
    progress.currentChapter = nextChapter;
    progress.currentWord = 0;
    updateBookProgress(currentBookId, progress);
    loadChapter(nextChapter, 0);
  } else {
    // Book complete!
    incrementCompletedBooks();
    updateHeaderStats();
    checkMilestone(100, currentBookId);
    showMilestoneToast(100);

    progress.currentChapter = 0;
    progress.currentWord = 0;
    updateBookProgress(currentBookId, progress);

    setTimeout(() => {
      alert('🎉 Congratulations! You\'ve finished the book!');
      goToLibrary();
    }, 1500);
  }
}

// ========== CHAPTER STATS ==========

function updateChapterStats() {
  const progress = getBookProgress(currentBookId);
  const sessions = (progress.sessions || []).filter(
    (s) => s.chapter === currentChapterIdx
  );

  if (sessions.length === 0) {
    chBestWpm.textContent = '—';
    chBestAccuracy.textContent = '—';
    chTotalTime.textContent = '—';
    chSessions.textContent = '0';
    return;
  }

  const bestWpm = Math.max(...sessions.map((s) => s.wpm || 0));
  const bestAcc = Math.max(...sessions.map((s) => s.accuracy || 0));
  const totalSecs = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);

  chBestWpm.textContent = bestWpm;
  chBestAccuracy.textContent = `${bestAcc}%`;
  chSessions.textContent = sessions.length;

  if (totalSecs < 60) {
    chTotalTime.textContent = `${Math.round(totalSecs)}s`;
  } else {
    const mins = Math.floor(totalSecs / 60);
    const secs = Math.round(totalSecs % 60);
    chTotalTime.textContent = `${mins}m ${secs}s`;
  }
}

// ========== CHAPTER NAVIGATION ==========

function renderChapterNav() {
  if (!currentBook) return;
  const progress = getBookProgress(currentBookId);

  chapterList.innerHTML = currentBook.chapters
    .map((ch, i) => {
      const classes = ['chapter-item'];
      if (i === currentChapterIdx) classes.push('active');
      if (progress.completedChapters && progress.completedChapters.includes(i)) {
        classes.push('completed');
      }
      return `<li class="${classes.join(' ')}" data-chapter="${i}">${escapeHtml(ch.title)}</li>`;
    })
    .join('');

  chapterList.querySelectorAll('.chapter-item').forEach((item) => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.chapter, 10);
      updateBookProgress(currentBookId, {
        currentChapter: idx,
        currentWord: 0,
      });
      loadChapter(idx, 0);
    });
  });
}

function updateBookInfo() {
  if (!currentBook) return;
  bookTitle.textContent = currentBook.title;
  bookAuthor.textContent = currentBook.author;
  const progress = getBookProgress(currentBookId);
  const percent = calcBookProgressPercent(currentBook, progress);
  bookProgressFill.style.width = `${percent}%`;
  bookProgressText.textContent = `${percent}%`;
}

async function loadDictionary(words) {
  // Create one card per word occurrence, in text order
  dictList.innerHTML = words
    .map((w, i) => {
      const clean = w.toLowerCase().replace(/[^a-z'-]/g, '');
      if (clean.length < 2) return `<div class="dict-word-card" id="dict-card-idx-${i}" style="display:none"></div>`;
      return `
        <div class="dict-word-card loading" id="dict-card-idx-${i}" data-word="${clean}" data-word-idx="${i}">
          <div class="dict-word-text">${escapeHtml(w)}</div>
        </div>
      `;
    })
    .join('');

  // Add click handlers
  dictList.querySelectorAll('.dict-word-card[data-word-idx]').forEach((card) => {
    card.addEventListener('click', () => {
      const wordIdx = parseInt(card.dataset.wordIdx, 10);
      jumpToWord(wordIdx);
    });
  });

  // Batch fetch unique definitions
  const uniqueClean = [...new Set(
    words.map((w) => w.toLowerCase().replace(/[^a-z'-]/g, '')).filter((w) => w.length >= 2)
  )];
  dictDefinitions = await fetchDefinitionsBatch(uniqueClean);

  // Update all cards with fetched definitions
  words.forEach((w, i) => updateDictCardByIdx(i));

  // Highlight initial word
  highlightDictWord(engine.currentWordIndex);
}

function updateDictCardByIdx(idx) {
  const card = document.getElementById(`dict-card-idx-${idx}`);
  if (!card || !card.dataset.word) return;

  const clean = card.dataset.word;
  const def = getCachedDefinition(clean) || dictDefinitions[clean];
  card.classList.remove('loading');

  if (!def) {
    card.innerHTML = `<div class="dict-word-text">${escapeHtml(clean)}</div><div class="dict-def" style="color:var(--text-muted);font-style:italic;">No definition available</div>`;
    return;
  }

  let html = `<div class="dict-word-text">${escapeHtml(def.word)}</div>`;
  if (def.phonetic) {
    html += `<div class="dict-phonetic">${escapeHtml(def.phonetic)}</div>`;
  }

  for (const meaning of def.meanings.slice(0, 2)) {
    html += `<div class="dict-meaning">`;
    html += `<div class="dict-pos">${escapeHtml(meaning.partOfSpeech)}</div>`;
    for (const d of meaning.definitions.slice(0, 2)) {
      html += `<div class="dict-def">${escapeHtml(d)}</div>`;
    }
    html += `</div>`;
  }

  card.innerHTML = html;
}

function highlightDictWord(wordIdx) {
  // Remove previous highlight
  dictList.querySelectorAll('.dict-word-card.active').forEach((c) => c.classList.remove('active'));

  const card = document.getElementById(`dict-card-idx-${wordIdx}`);
  if (card) {
    card.classList.add('active');
  }
}

function scrollDictToWord(wordIdx) {
  const card = document.getElementById(`dict-card-idx-${wordIdx}`);
  if (card) {
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function jumpToWord(wordIdx) {
  // Reload engine from the target word
  engine.load(currentBook.chapters[currentChapterIdx].words, wordIdx);
  lastRenderedWordIdx = -1;

  const chapter = currentBook.chapters[currentChapterIdx];

  engine.onUpdate = (state) => {
    updateWordDisplay();
    updateStats(state);
    saveCurrentProgress();
  };

  engine.onWordComplete = (wi, word) => {
    addDailyWords(1);
    updateHeaderStats();
    recordActivity();
    scrollDictToWord(engine.currentWordIndex);
    highlightDictWord(engine.currentWordIndex);

    const lookAhead = 5;
    for (let i = engine.currentWordIndex; i < Math.min(engine.currentWordIndex + lookAhead, chapter.words.length); i++) {
      const w = chapter.words[i];
      if (!getCachedDefinition(w)) {
        fetchDefinition(w).then(() => updateDictCardByIdx(i));
      }
    }
  };

  engine.onChapterComplete = () => completeChapter();

  saveCurrentProgress();
  initialRenderTextDisplay();
  highlightDictWord(wordIdx);
  scrollDictToWord(wordIdx);
  typingInput.focus();
}

// ========== SKIP CONTROLS ==========

function skipWords(count) {
  if (!currentBook) return;
  const chapter = currentBook.chapters[currentChapterIdx];
  const currentIdx = engine.currentWordIndex;
  const targetIdx = Math.min(currentIdx + count, chapter.words.length);

  if (targetIdx <= currentIdx) return;

  // Mark skipped words as typed in DOM
  for (let i = currentIdx; i < targetIdx; i++) {
    const el = document.getElementById(`word-${i}`);
    if (el) {
      el.className = 'word typed';
      const word = chapter.words[i];
      el.innerHTML = word
        .split('')
        .map((c) => `<span class="char correct">${escapeHtml(c)}</span>`)
        .join('');
    }
  }

  // Jump the engine forward
  jumpToWord(targetIdx < chapter.words.length ? targetIdx : chapter.words.length - 1);
}

function skipToNextSentence() {
  if (!currentBook) return;
  const chapter = currentBook.chapters[currentChapterIdx];
  const words = chapter.words;
  const currentIdx = engine.currentWordIndex;

  // Find next word that follows a sentence-ending punctuation
  let targetIdx = currentIdx + 1;
  for (let i = currentIdx; i < words.length; i++) {
    const word = words[i];
    const lastChar = word[word.length - 1];
    if (lastChar === '.' || lastChar === '!' || lastChar === '?') {
      targetIdx = i + 1;
      break;
    }
  }

  if (targetIdx >= words.length) targetIdx = words.length - 1;
  if (targetIdx <= currentIdx) return;

  skipWords(targetIdx - currentIdx);
}

// ========== VIEW MANAGEMENT ==========

function showView(view) {
  libraryView.classList.toggle('active', view === 'library');
  typingView.classList.toggle('active', view === 'typing');
}

function goToLibrary() {
  // Save session before leaving
  if (currentBookId && engine.isActive) {
    const state = engine.getState();
    addSession(currentBookId, {
      chapter: currentChapterIdx,
      wpm: state.wpm,
      accuracy: state.accuracy,
      errors: state.errorCount,
      wordsTyped: state.wordsCompleted,
      duration: state.elapsed,
    });
  }

  currentBookId = null;
  currentBook = null;
  showView('library');
  renderLibrary();
  updateHeaderStats();
}

// ========== HEADER STATS ==========

function updateHeaderStats() {
  streakCount.textContent = getCurrentStreak();
  booksCompletedCount.textContent = getCompletedBooksCount();

  const goalPercent = getDailyGoalPercent();
  goalRingFill.setAttribute('stroke-dasharray', `${goalPercent}, 100`);
  goalProgressText.textContent = `${goalPercent}%`;
}

// ========== MILESTONE TOAST ==========

function showMilestoneToast(percent) {
  const messages = {
    25: '🎉 25% done! A quarter of the way through!',
    50: '🔥 Halfway there! 50% complete!',
    75: '⚡ 75% done! The home stretch!',
    100: '🏆 Book complete! Amazing achievement!',
  };

  toastMessage.textContent = messages[percent] || `${percent}% milestone reached!`;
  milestoneToast.classList.add('visible');

  setTimeout(() => {
    milestoneToast.classList.remove('visible');
  }, 4000);
}

// ========== UTILITIES ==========

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatNumber(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ========== BOOT ==========
init();
