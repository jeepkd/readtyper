/**
 * Book Parser — handles EPUB and TXT file parsing
 */
import ePub from 'epubjs';

/**
 * Parse an uploaded file (EPUB or TXT) into a normalized book object
 * @param {File} file
 * @returns {Promise<{id: string, title: string, author: string, format: string, chapters: Array<{title: string, text: string, words: string[]}>}>}
 */
export async function parseBook(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'epub') {
    return parseEpub(file);
  } else {
    return parseTxt(file);
  }
}

async function parseEpub(file) {
  const arrayBuffer = await file.arrayBuffer();
  const book = ePub(arrayBuffer);
  await book.ready;

  const metadata = await book.loaded.metadata;
  const spine = book.spine;

  const chapters = [];

  // Iterate through spine items to get chapter content
  for (let i = 0; i < spine.items.length; i++) {
    const item = spine.items[i];
    const doc = await book.load(item.href);

    let text = '';
    if (doc && doc.body) {
      text = doc.body.textContent || '';
    } else if (typeof doc === 'string') {
      text = doc.replace(/<[^>]*>/g, ' ');
    }

    text = cleanText(text);
    if (text.length < 10) continue; // Skip near-empty chapters

    // Try to extract title from navigation or use index
    let title = `Chapter ${chapters.length + 1}`;

    chapters.push({
      title,
      text,
      words: extractWords(text),
    });
  }

  // Try to get chapter titles from navigation
  try {
    const nav = await book.loaded.navigation;
    if (nav && nav.toc) {
      nav.toc.forEach((tocItem, i) => {
        if (chapters[i]) {
          chapters[i].title = tocItem.label.trim() || chapters[i].title;
        }
      });
    }
  } catch (e) {
    // Navigation may not be available, use defaults
  }

  const id = generateId();

  return {
    id,
    title: metadata.title || file.name.replace(/\.epub$/i, ''),
    author: metadata.creator || 'Unknown Author',
    format: 'epub',
    chapters,
    totalWords: chapters.reduce((sum, ch) => sum + ch.words.length, 0),
    fileName: file.name,
    importedAt: Date.now(),
  };
}

async function parseTxt(file) {
  const text = await file.text();
  const id = generateId();

  // Split into chapters by double newlines or horizontal rules
  const rawChapters = text.split(/\n{3,}|\r\n{3,}|(?:^|\n)[-=]{3,}(?:\n|$)/);

  const chapters = rawChapters
    .map((chText, i) => {
      const cleaned = cleanText(chText);
      if (cleaned.length < 10) return null;
      return {
        title: `Section ${i + 1}`,
        text: cleaned,
        words: extractWords(cleaned),
      };
    })
    .filter(Boolean);

  // If no good splits found, treat entire text as one chapter
  if (chapters.length === 0) {
    const cleaned = cleanText(text);
    chapters.push({
      title: 'Full Text',
      text: cleaned,
      words: extractWords(cleaned),
    });
  }

  return {
    id,
    title: file.name.replace(/\.(txt|text)$/i, ''),
    author: 'Unknown Author',
    format: 'txt',
    chapters,
    totalWords: chapters.reduce((sum, ch) => sum + ch.words.length, 0),
    fileName: file.name,
    importedAt: Date.now(),
  };
}

function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200F\uFEFF]/g, '') // Remove zero-width chars
    .trim();
}

function extractWords(text) {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
