/**
 * Dictionary — fetches definitions from Free Dictionary API with caching
 */

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const CACHE_KEY = 'readtyper_dict_cache';

// In-memory cache for current session
let memCache = {};

// Load cached definitions from localStorage
function loadCache() {
  try {
    memCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    memCache = {};
  }
}

function saveCache() {
  try {
    // Limit cache size to 2000 words
    const keys = Object.keys(memCache);
    if (keys.length > 2000) {
      const toRemove = keys.slice(0, keys.length - 2000);
      toRemove.forEach((k) => delete memCache[k]);
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(memCache));
  } catch {
    // localStorage might be full
  }
}

loadCache();

/**
 * Fetch definition for a word
 * @param {string} word
 * @returns {Promise<{word: string, phonetic: string, meanings: Array<{partOfSpeech: string, definitions: string[]}>} | null>}
 */
export async function fetchDefinition(word) {
  const cleanWord = word.toLowerCase().replace(/[^a-z'-]/g, '');
  if (!cleanWord || cleanWord.length < 2) return null;

  // Check cache
  if (memCache[cleanWord]) {
    return memCache[cleanWord];
  }

  try {
    const res = await fetch(`${API_BASE}${encodeURIComponent(cleanWord)}`);
    if (!res.ok) {
      memCache[cleanWord] = null;
      return null;
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      memCache[cleanWord] = null;
      return null;
    }

    const entry = data[0];

    // Find the best audio URL from phonetics
    const audioUrl = (entry.phonetics || [])
      .map((p) => p.audio)
      .find((a) => a && a.length > 0) || '';

    const result = {
      word: entry.word || cleanWord,
      phonetic: entry.phonetic || (entry.phonetics && entry.phonetics[0]?.text) || '',
      audio: audioUrl,
      meanings: (entry.meanings || []).map((m) => ({
        partOfSpeech: m.partOfSpeech || '',
        definitions: (m.definitions || []).slice(0, 2).map((d) => d.definition),
      })),
    };

    memCache[cleanWord] = result;
    saveCache();

    return result;
  } catch {
    return null;
  }
}

/**
 * Batch fetch definitions for multiple words
 * Fetches in parallel with rate limiting
 */
export async function fetchDefinitionsBatch(words) {
  // Deduplicate and clean
  const uniqueWords = [...new Set(words.map((w) => w.toLowerCase().replace(/[^a-z'-]/g, '')).filter((w) => w.length >= 2))];

  const results = {};

  // Check cache first
  const uncached = [];
  for (const word of uniqueWords) {
    if (memCache[word] !== undefined) {
      results[word] = memCache[word];
    } else {
      uncached.push(word);
    }
  }

  // Fetch uncached words in small batches to avoid overwhelming the API
  const BATCH_SIZE = 5;
  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    const batch = uncached.slice(i, i + BATCH_SIZE);
    const promises = batch.map((w) => fetchDefinition(w));
    const batchResults = await Promise.all(promises);
    batch.forEach((w, idx) => {
      results[w] = batchResults[idx];
    });

    // Small delay between batches
    if (i + BATCH_SIZE < uncached.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}

/**
 * Get cached definition (sync, for already-fetched words)
 */
export function getCachedDefinition(word) {
  const cleanWord = word.toLowerCase().replace(/[^a-z'-]/g, '');
  return memCache[cleanWord] || null;
}
