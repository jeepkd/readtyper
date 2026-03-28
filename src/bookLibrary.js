/**
 * Book Library — localStorage-based book management
 */

const LIBRARY_KEY = 'readtyper_library';
const PROGRESS_KEY = 'readtyper_progress';

/**
 * Get all books from library
 * @returns {Array}
 */
export function getLibrary() {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Save a parsed book to library (stores metadata + chapters)
 */
export function saveBook(book) {
  const library = getLibrary();

  // Store book data with chapters
  library.push(book);
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));

  // Initialize progress
  const progress = getProgress();
  progress[book.id] = {
    currentChapter: 0,
    currentWord: 0,
    completedChapters: [],
    totalWordsTyped: 0,
    sessions: [],
  };
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

/**
 * Delete a book from library
 */
export function deleteBook(bookId) {
  let library = getLibrary();
  library = library.filter((b) => b.id !== bookId);
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));

  const progress = getProgress();
  delete progress[bookId];
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

/**
 * Get a specific book by ID
 */
export function getBook(bookId) {
  const library = getLibrary();
  return library.find((b) => b.id === bookId) || null;
}

/**
 * Get all progress data
 */
export function getProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Get progress for a specific book
 */
export function getBookProgress(bookId) {
  const progress = getProgress();
  return (
    progress[bookId] || {
      currentChapter: 0,
      currentWord: 0,
      completedChapters: [],
      totalWordsTyped: 0,
      sessions: [],
    }
  );
}

/**
 * Update progress for a specific book
 */
export function updateBookProgress(bookId, updates) {
  const progress = getProgress();
  if (!progress[bookId]) {
    progress[bookId] = {
      currentChapter: 0,
      currentWord: 0,
      completedChapters: [],
      totalWordsTyped: 0,
      sessions: [],
    };
  }
  Object.assign(progress[bookId], updates);
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

/**
 * Add a session record
 */
export function addSession(bookId, session) {
  const progress = getProgress();
  if (!progress[bookId]) return;
  if (!progress[bookId].sessions) progress[bookId].sessions = [];
  progress[bookId].sessions.push({
    ...session,
    date: Date.now(),
  });
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

/**
 * Calculate overall book progress percentage
 */
export function calcBookProgressPercent(book, bookProgress) {
  if (!book || !book.chapters || book.totalWords === 0) return 0;

  let wordsBeforeChapter = 0;
  for (let i = 0; i < bookProgress.currentChapter; i++) {
    wordsBeforeChapter += book.chapters[i].words.length;
  }
  const totalDone = wordsBeforeChapter + (bookProgress.currentWord || 0);
  return Math.min(100, Math.round((totalDone / book.totalWords) * 100));
}
