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
    if (key === expectedChar) {
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
    this._emitUpdate();
  }

  _completeWord() {
    this.wordsCompleted++;

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

    return {
      currentWordIndex: this.currentWordIndex,
      currentCharIndex: this.currentCharIndex,
      typedBuffer: this.typedBuffer,
      wpm,
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
            state = this.typedBuffer[charIdx] === char ? 'correct' : 'incorrect';
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
}
