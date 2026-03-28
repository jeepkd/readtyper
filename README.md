# ReadTyper

Practice touch typing by reading your favorite books. Import EPUB or TXT files, type through them word by word, and learn vocabulary along the way.

## Features

- **📚 Book Library** — Import and manage EPUB & TXT files with progress tracking
- **⌨️ Touch Typing** — Character-level feedback (correct/incorrect), cursor tracking, auto-advance
- **📖 Dictionary Panel** — Live definitions from [Free Dictionary API](https://dictionaryapi.dev/) with auto-scroll to current word
- **📊 Real-time Stats** — Live WPM (rolling 15s window), session WPM, accuracy, errors, time elapsed
- **🧭 Chapter Navigation** — Jump between chapters, track per-chapter best WPM & accuracy
- **🔥 Daily Streaks** — Track consecutive days of typing practice
- **🎯 Daily Goals** — Set a word target per day with visual progress ring
- **🏆 Milestones** — Celebrations at 25%, 50%, 75%, and 100% of each book
- **💾 Progress Saving** — All progress stored in localStorage, resume where you left off

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Usage

1. Click **Import Book** to upload an EPUB or TXT file
2. Click a book card to start typing
3. Type through the text — correct characters turn green, errors turn red
4. Press **Space** to advance to the next word (only after completing the current word)
5. The dictionary panel on the right shows definitions and auto-scrolls as you type
6. Click any word in the dictionary panel to jump to it

## Tech Stack

- [Vite](https://vitejs.dev/) — Build tool & dev server
- [epubjs](https://github.com/futurepress/epub.js/) — EPUB parsing
- [Free Dictionary API](https://dictionaryapi.dev/) — Word definitions
- Vanilla JS + CSS — No framework dependencies

## Project Structure

```
readtyper/
├── index.html              # Main HTML (library + typing views)
├── vite.config.js           # Vite configuration
├── package.json
└── src/
    ├── index.css            # Design system (dark theme, components)
    ├── main.js              # App orchestrator (UI, events, state)
    ├── bookParser.js        # EPUB & TXT file parsing
    ├── bookLibrary.js       # localStorage book/progress management
    ├── typingEngine.js      # Core typing logic & stats
    ├── dictionary.js        # Free Dictionary API with caching
    └── progress.js          # Streaks, goals, milestones
```

## License

MIT
