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

// ========== DOM REFERENCES ==========
const $ = (id) => document.getElementById(id);

const libraryView = $('library-view');
const typingView = $('typing-view');
const fileInput = $('file-input');
const booksGrid = $('books-grid');
const emptyLibrary = $('empty-library');
const backBtn = $('back-to-library');

// Stats
const statWpm = $('stat-wpm');
const statAccuracy = $('stat-accuracy');
const statErrors = $('stat-errors');
const statTime = $('stat-time');
const statWordsTyped = $('stat-words-typed');
const statEta = $('stat-eta');

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
    engine.handleKey(e);
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
    if (typingView.classList.contains('active') && !e.target.closest('.sidebar') && !e.target.closest('.dictionary-panel') && !e.target.closest('.modal')) {
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
  engine = new TypingEngine();
  engine.load(chapter.words, startWord);

  engine.onUpdate = (state) => {
    renderTextDisplay();
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
          updateDictCard(i, w);
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
  renderTextDisplay();
  loadDictionary(chapter.words);

  // Focus input
  setTimeout(() => typingInput.focus(), 100);
}

function renderTextDisplay() {
  const renderData = engine.getRenderData();
  const currentIdx = engine.getState().currentWordIndex;

  // Only render a window of words around current position for performance
  const WINDOW_BEFORE = 50;
  const WINDOW_AFTER = 100;
  const startIdx = Math.max(0, currentIdx - WINDOW_BEFORE);
  const endIdx = Math.min(renderData.length, currentIdx + WINDOW_AFTER);

  let html = '';
  if (startIdx > 0) {
    html += '<span class="word typed" style="opacity:0.3">…&nbsp;</span>';
  }

  for (let i = startIdx; i < endIdx; i++) {
    const w = renderData[i];
    const classes = ['word'];
    if (w.isCurrent) classes.push('current');
    if (w.isTyped) classes.push('typed');
    if (w.hasError) classes.push('has-error');

    const charsHtml = w.chars
      .map((c) => `<span class="char ${c.state}">${escapeHtml(c.char)}</span>`)
      .join('');

    html += `<span class="${classes.join(' ')}" data-word-idx="${w.wordIdx}">${charsHtml}</span>`;
  }

  if (endIdx < renderData.length) {
    html += '<span class="word" style="opacity:0.3">&nbsp;…</span>';
  }

  textDisplay.innerHTML = html;

  // Scroll current word into view
  const currentWordEl = textDisplay.querySelector('.word.current');
  if (currentWordEl) {
    currentWordEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function updateStats(state) {
  statWpm.textContent = state.wpm;
  statAccuracy.textContent = `${state.accuracy}%`;
  statErrors.textContent = state.errorCount;
  statWordsTyped.textContent = state.wordsCompleted;

  const elapsed = state.elapsed;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  statTime.textContent = `${mins}:${String(secs).padStart(2, '0')}`;

  // ETA
  const wordsRemaining = state.totalWords - state.currentWordIndex;
  const totalRemaining = getTotalRemainingWords();
  statEta.textContent = estimateTimeToFinish(totalRemaining, state.wpm);

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

// ========== DICTIONARY PANEL ==========

async function loadDictionary(words) {
  // Create unique word list preserving order of appearance
  const seen = new Set();
  const uniqueWords = [];
  for (const w of words) {
    const clean = w.toLowerCase().replace(/[^a-z'-]/g, '');
    if (clean.length >= 2 && !seen.has(clean)) {
      seen.add(clean);
      uniqueWords.push({ original: w, clean });
    }
  }

  // Build word-to-index mapping for the words array
  const wordToFirstIndex = {};
  words.forEach((w, i) => {
    const clean = w.toLowerCase().replace(/[^a-z'-]/g, '');
    if (clean.length >= 2 && !(clean in wordToFirstIndex)) {
      wordToFirstIndex[clean] = i;
    }
  });

  // Render placeholder cards
  dictList.innerHTML = uniqueWords
    .map(({ original, clean }, i) => {
      return `
        <div class="dict-word-card loading" id="dict-card-${clean}" data-word="${clean}" data-word-idx="${wordToFirstIndex[clean] || 0}">
          <div class="dict-word-text">${escapeHtml(original)}</div>
        </div>
      `;
    })
    .join('');

  // Add click handlers
  dictList.querySelectorAll('.dict-word-card').forEach((card) => {
    card.addEventListener('click', () => {
      const wordIdx = parseInt(card.dataset.wordIdx, 10);
      jumpToWord(wordIdx);
    });
  });

  // Fetch definitions batch
  const cleanWords = uniqueWords.map((w) => w.clean);
  dictDefinitions = await fetchDefinitionsBatch(cleanWords);

  // Update cards with definitions
  for (const { clean } of uniqueWords) {
    updateDictCard(null, clean);
  }

  // Highlight initial word
  highlightDictWord(engine.currentWordIndex);
}

function updateDictCard(wordIdx, word) {
  const clean = word.toLowerCase().replace(/[^a-z'-]/g, '');
  const card = document.getElementById(`dict-card-${clean}`);
  if (!card) return;

  const def = getCachedDefinition(word) || dictDefinitions[clean];
  card.classList.remove('loading');

  if (!def) {
    card.innerHTML = `<div class="dict-word-text">${escapeHtml(word)}</div><div class="dict-def" style="color:var(--text-muted);font-style:italic;">No definition available</div>`;
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
  if (!currentBook) return;
  const chapter = currentBook.chapters[currentChapterIdx];
  if (!chapter || wordIdx >= chapter.words.length) return;

  const word = chapter.words[wordIdx];
  const clean = word.toLowerCase().replace(/[^a-z'-]/g, '');

  // Remove previous highlight
  dictList.querySelectorAll('.dict-word-card.active').forEach((c) => c.classList.remove('active'));

  const card = document.getElementById(`dict-card-${clean}`);
  if (card) {
    card.classList.add('active');
  }
}

function scrollDictToWord(wordIdx) {
  if (!currentBook) return;
  const chapter = currentBook.chapters[currentChapterIdx];
  if (!chapter || wordIdx >= chapter.words.length) return;

  const word = chapter.words[wordIdx];
  const clean = word.toLowerCase().replace(/[^a-z'-]/g, '');

  const card = document.getElementById(`dict-card-${clean}`);
  if (card) {
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function jumpToWord(wordIdx) {
  // This reloads the chapter from the target word
  engine.load(currentBook.chapters[currentChapterIdx].words, wordIdx);

  engine.onUpdate = (state) => {
    renderTextDisplay();
    updateStats(state);
    saveCurrentProgress();
  };

  engine.onWordComplete = (wi, word) => {
    addDailyWords(1);
    updateHeaderStats();
    recordActivity();
    scrollDictToWord(engine.currentWordIndex);
    highlightDictWord(engine.currentWordIndex);

    const chapter = currentBook.chapters[currentChapterIdx];
    const lookAhead = 5;
    for (let i = engine.currentWordIndex; i < Math.min(engine.currentWordIndex + lookAhead, chapter.words.length); i++) {
      const w = chapter.words[i];
      if (!getCachedDefinition(w)) {
        fetchDefinition(w).then(() => updateDictCard(i, w));
      }
    }
  };

  engine.onChapterComplete = () => completeChapter();

  saveCurrentProgress();
  renderTextDisplay();
  highlightDictWord(wordIdx);
  scrollDictToWord(wordIdx);
  typingInput.focus();
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
