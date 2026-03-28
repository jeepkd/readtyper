/**
 * Typing Engine — core typing logic with character-level comparison
 */

export class TypingEngine {
  constructor() {
    this.words = [];
    this.currentWordIndex = 0;
    this.currentCharIndex = 0;
    this.typedBuffer = '';
    this.startTime = null;
    this.totalKeystrokes = 0;
    this.correctKeystrokes = 0;
    this.errorCount = 0;
    this.wordsCompleted = 0;
    this.wordErrors = {}; // { wordIndex: errorCount }
    this.isActive = false;
    this.onUpdate = null;
    this.onWordComplete = null;
    this.onChapterComplete = null;
  }

  /**
   * Load a set of words for typing
   * @param {string[]} words
   * @param {number} startWordIndex - resume from this word
   */
  load(words, startWordIndex = 0) {
    if (this._timer) clearInterval(this._timer);
    this.words = words;
    this.currentWordIndex = startWordIndex;
    this.currentCharIndex = 0;
    this.typedBuffer = '';
    this.startTime = null;
    this.totalKeystrokes = 0;
    this.correctKeystrokes = 0;
    this.errorCount = 0;
    this.wordsCompleted = 0;
    this.wordErrors = {};
    this.isActive = false;
    this.recentWordTimestamps = []; // for rolling WPM

    // Keep stats updating every second (for timer/WPM)
    this._timer = setInterval(() => {
      if (this.startTime) {
        this._emitUpdate();
      }
    }, 1000);
  }

  destroy() {
    if (this._timer) clearInterval(this._timer);
  }

  /**
   * Handle a keypress event
   * @param {KeyboardEvent} e
   */
  handleKey(e) {
    if (!this.words.length) return;
    if (this.currentWordIndex >= this.words.length) return;

    // Start timer on first keystroke
    if (!this.startTime) {
      this.startTime = Date.now();
      this.isActive = true;
    }

    const key = e.key;
    const currentWord = this.words[this.currentWordIndex];

    if (key === 'Backspace') {
      e.preventDefault();
      if (this.typedBuffer.length > 0) {
        this.typedBuffer = this.typedBuffer.slice(0, -1);
        this.currentCharIndex = Math.max(0, this.currentCharIndex - 1);
      }
      this._emitUpdate();
      return;
    }

    // Tab and other non-char keys
    if (key.length > 1 && key !== ' ') return;

    e.preventDefault();
    this.totalKeystrokes++;

    if (key === ' ') {
      // Only complete the word when all characters have been typed
      const currentWord = this.words[this.currentWordIndex];
      if (this.typedBuffer.length >= currentWord.length) {
        this._completeWord();
      }
      return;
    }

    // Regular character
    const expectedChar = currentWord[this.currentCharIndex];
    if (TypingEngine._charsMatch(key, expectedChar)) {
      this.correctKeystrokes++;
    } else {
      this.errorCount++;
      if (!this.wordErrors[this.currentWordIndex]) {
        this.wordErrors[this.currentWordIndex] = 0;
      }
      this.wordErrors[this.currentWordIndex]++;
    }

    this.typedBuffer += key;
    this.currentCharIndex = this.typedBuffer.length;

    // Auto-complete the last word when fully typed (no space needed)
    if (
      this.currentWordIndex === this.words.length - 1 &&
      this.typedBuffer.length >= currentWord.length
    ) {
      this._completeWord();
      return;
    }

    this._emitUpdate();
  }

  _completeWord() {
    this.wordsCompleted++;
    this.recentWordTimestamps.push(Date.now());

    if (this.onWordComplete) {
      this.onWordComplete(this.currentWordIndex, this.words[this.currentWordIndex]);
    }

    this.currentWordIndex++;
    this.currentCharIndex = 0;
    this.typedBuffer = '';

    // Check if chapter is done
    if (this.currentWordIndex >= this.words.length) {
      this.isActive = false;
      if (this.onChapterComplete) {
        this.onChapterComplete();
      }
    }

    this._emitUpdate();
  }

  _emitUpdate() {
    if (this.onUpdate) {
      this.onUpdate(this.getState());
    }
  }

  getState() {
    const elapsed = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;
    const minutes = elapsed / 60;
    const wpm = minutes > 0 ? Math.round(this.wordsCompleted / minutes) : 0;
    const accuracy =
      this.totalKeystrokes > 0
        ? Math.round((this.correctKeystrokes / this.totalKeystrokes) * 100)
        : 100;

    // Rolling WPM (last 15 seconds)
    const now = Date.now();
    const windowMs = 15000;
    const recentStamps = this.recentWordTimestamps.filter((t) => now - t < windowMs);
    const liveWpm =
      recentStamps.length >= 2
        ? Math.round((recentStamps.length / ((now - recentStamps[0]) / 1000)) * 60)
        : null;

    return {
      currentWordIndex: this.currentWordIndex,
      currentCharIndex: this.currentCharIndex,
      typedBuffer: this.typedBuffer,
      wpm,
      liveWpm,
      accuracy,
      errorCount: this.errorCount,
      wordsCompleted: this.wordsCompleted,
      totalWords: this.words.length,
      elapsed,
      isActive: this.isActive,
      wordErrors: this.wordErrors,
    };
  }

  /**
   * Get render data for the text display
   * Returns array of word objects with character states
   */
  getRenderData() {
    return this.words.map((word, wordIdx) => {
      const chars = word.split('').map((char, charIdx) => {
        let state = 'upcoming';

        if (wordIdx < this.currentWordIndex) {
          // Already typed word
          state = 'correct'; // default for completed
        } else if (wordIdx === this.currentWordIndex) {
          // Current word
          if (charIdx < this.typedBuffer.length) {
            state = TypingEngine._charsMatch(this.typedBuffer[charIdx], char) ? 'correct' : 'incorrect';
          } else if (charIdx === this.typedBuffer.length) {
            state = 'cursor';
          }
        }

        return { char, state };
      });

      // For completed words, check if there were errors
      const hadErrors = wordIdx < this.currentWordIndex && this.wordErrors[wordIdx] > 0;

      return {
        word,
        wordIdx,
        chars,
        isCurrent: wordIdx === this.currentWordIndex,
        isTyped: wordIdx < this.currentWordIndex,
        hasError: hadErrors,
      };
    });
  }

  /**
   * Check if a typed key matches an expected character,
   * accounting for typographic equivalents (smart quotes, dashes, etc.)
   */
  static _charsMatch(typed, expected) {
    if (typed === expected) return true;

    const normalExpected = CHAR_EQUIVALENTS[expected];
    if (normalExpected && normalExpected === typed) return true;

    // Also check reverse: typed is the fancy char, expected is plain
    const normalTyped = CHAR_EQUIVALENTS[typed];
    if (normalTyped && normalTyped === expected) return true;

    return false;
  }
}

/**
 * Map of typographic/Unicode characters → standard keyboard equivalents.
 * If the book text has a fancy char, typing the plain version counts as correct.
 */
const CHAR_EQUIVALENTS = {
  // Smart/curly quotes → straight quotes
  '\u201C': '"',  // "
  '\u201D': '"',  // "
  '\u201E': '"',  // „
  '\u201F': '"',  // ‟
  '\u2018': "'",  // '
  '\u2019': "'",  // '
  '\u201A': "'",  // ‚
  '\u201B': "'",  // ‛

  // Dashes → hyphen
  '\u2014': '-',  // — (em dash)
  '\u2013': '-',  // – (en dash)
  '\u2012': '-',  // ‒ (figure dash)
  '\u2015': '-',  // ― (horizontal bar)

  // Ellipsis
  '\u2026': '.',  // … → .

  // Spaces
  '\u00A0': ' ',  // non-breaking space
  '\u2002': ' ',  // en space
  '\u2003': ' ',  // em space
  '\u2009': ' ',  // thin space

  // Other common ones
  '\u00B7': '.',  // · (middle dot)
  '\u2022': '*',  // • (bullet)
  '\u00D7': 'x',  // × (multiplication sign)
  '\u2032': "'",  // ′ (prime)
  '\u2033': '"',  // ″ (double prime)
  '\u00AB': '"',  // « (left guillemet)
  '\u00BB': '"',  // » (right guillemet)
  '\u2039': '<',  // ‹ (single left guillemet)
  '\u203A': '>',  // › (single right guillemet)
};
