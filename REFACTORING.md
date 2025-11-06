# Summary Forge Refactoring Plan

## Goal
Break down the monolithic 1186-line `summary-forge.js` into focused, maintainable modules following KISS/DRY principles.

## New Structure

```
src/
├── index.js                      # Main ESM entry point ✅
├── core/
│   └── summary-forge.js         # Orchestrator (uses all services)
├── services/
│   ├── openai-service.js        # OpenAI API (summary + audio script)
│   ├── elevenlabs-service.js    # ElevenLabs TTS
│   ├── downloader-service.js    # Anna's Archive downloader
│   └── converter-service.js     # EPUB/PDF conversion
├── generators/
│   ├── output-generator.js      # Generate all output files
│   └── flashcards.js            # Flashcards ✅ (already modular)
└── utils/
    ├── file-utils.js            # File operations ✅
    ├── cost-tracker.js          # API cost tracking
    └── captcha-solver.js        # CAPTCHA solving

test/
├── unit/
│   ├── cost-tracker.test.js
│   ├── file-utils.test.js
│   ├── openai-service.test.js
│   ├── elevenlabs-service.test.js
│   └── flashcards.test.js
└── integration/
    └── summary-forge.test.js
```

## Breaking Changes (No Backward Compatibility)

1. **Import path changes:**
   - Old: `import { SummaryForge } from './src/summary-forge.js'`
   - New: `import { SummaryForge } from 'summary-forge'` or `from './src/index.js'`

2. **Constructor changes:**
   - Remove dotenv dependency from class
   - All config must be passed explicitly
   - No automatic .env loading in the class

3. **Method signatures:**
   - Cleaner, more focused methods
   - Better separation of concerns

## Implementation Order

1. ✅ Create utils (file-utils, cost-tracker, captcha-solver)
2. Create services (openai, elevenlabs, converter, downloader)
3. Create generators (output-generator)
4. Refactor core/summary-forge.js to use all services
5. Update tests
6. Update examples
7. Update README

## Principles

- **KISS**: Each module does ONE thing well
- **DRY**: No code duplication
- **Single Responsibility**: Each class/function has one job
- **Dependency Injection**: Pass dependencies, don't create them
- **Pure Functions**: Where possible, avoid side effects