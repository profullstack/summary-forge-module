# Summary Forge Modular Refactoring Plan

## Current State
- Single file: `src/summary-forge.js` (~3260 lines)
- Monolithic `SummaryForge` class with many responsibilities
- Difficult to maintain and test

## Target Modular Structure

```
src/
├── summary-forge.js          # Main class (orchestrator)
├── core/
│   ├── search.js            # Search functionality
│   ├── download.js          # Download functionality  
│   ├── processing.js        # File processing
│   └── generation.js        # Content generation
├── utils/
│   ├── browser.js           # Already exists
│   ├── captcha-solver.js    # Already exists
│   ├── config.js            # Already exists ✓
│   ├── cost-tracker.js      # Already exists
│   ├── directory-protection.js  # Already exists
│   ├── file-utils.js        # Already exists
│   ├── pdf-chunker.js       # Already exists
│   └── web-page.js          # Already exists
└── index.js                 # Main exports ✓
```

## Module Breakdown

### 1. `src/core/search.js`
**Responsibilities:** Book search across different platforms
**Methods:**
- `searchBookByTitle(apiKey, title)` → JSON
- `searchAnnasArchive(query, options, proxyConfig)` → JSON
- `search1lib(query, options, proxyConfig)` → JSON

**Dependencies:**
- puppeteer
- Proxy configuration
- DDoS-Guard bypass logic

### 2. `src/core/download.js`
**Responsibilities:** Download books from various sources
**Methods:**
- `downloadFromAnnasArchive(config, asin, outputDir, bookTitle)` → JSON
- `downloadFrom1lib(config, bookUrl, outputDir, bookTitle, downloadUrl)` → JSON
- `search1libAndDownload(config, query, searchOptions, outputDir, selectCallback)` → JSON
- `convertEpubToPdf(epubPath)` → JSON

**Dependencies:**
- puppeteer
- Proxy configuration
- DDoS-Guard bypass
- CAPTCHA solving
- File system operations

### 3. `src/core/processing.js`
**Responsibilities:** Process files and generate summaries
**Methods:**
- `processFile(config, filePath, asin)` → JSON
- `processWebPage(config, url, outputDir)` → JSON
- `createBundle(files, archiveName)` → JSON

**Dependencies:**
- OpenAI API
- PDF parsing
- File system operations
- Generation module

### 4. `src/core/generation.js`
**Responsibilities:** Generate various output formats
**Methods:**
- `generateSummary(openaiClient, pdfPath, options)` → JSON
- `generateWebPageSummary(openaiClient, pdfPath, pageTitle, url, options)` → JSON
- `generateAudioScript(openaiClient, markdown, options)` → JSON
- `generateAudio(elevenlabsClient, text, outputPath, options)` → JSON
- `generateOutputFiles(markdown, basename, outputDir, options)` → JSON

**Dependencies:**
- OpenAI API
- ElevenLabs API
- Pandoc
- Flashcards module

### 5. `src/summary-forge.js` (Refactored)
**Responsibilities:** Orchestrate all modules, manage configuration
**Structure:**
```javascript
export class SummaryForge {
  constructor(config) {
    // Initialize clients and configuration
    this.config = config;
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    this.elevenlabs = config.elevenlabsApiKey ? new ElevenLabsClient(...) : null;
    this.costs = { openai: 0, elevenlabs: 0, rainforest: 0, total: 0 };
  }

  // Delegate to search module
  async searchBookByTitle(title) {
    return searchBookByTitle(this.rainforestApiKey, title);
  }

  async searchAnnasArchive(query, options) {
    return searchAnnasArchive(query, options, this.getProxyConfig());
  }

  // Delegate to download module
  async downloadFromAnnasArchive(asin, outputDir, bookTitle) {
    return downloadFromAnnasArchive(this.config, asin, outputDir, bookTitle);
  }

  // Delegate to processing module
  async processFile(filePath, asin) {
    return processFile(this.config, filePath, asin);
  }

  // Delegate to generation module
  async generateSummary(pdfPath) {
    return generateSummary(this.openai, pdfPath, this.getGenerationOptions());
  }

  // Helper methods
  getProxyConfig() { ... }
  getGenerationOptions() { ... }
  getCostSummary() { ... }
}
```

## Migration Strategy

### Phase 1: Extract Search Module ✓
1. Create `src/core/search.js`
2. Move search methods with JSON returns
3. Update `SummaryForge` to delegate to search module
4. Test search functionality

### Phase 2: Extract Download Module
1. Create `src/core/download.js`
2. Move download methods with JSON returns
3. Update `SummaryForge` to delegate to download module
4. Test download functionality

### Phase 3: Extract Generation Module
1. Create `src/core/generation.js`
2. Move generation methods with JSON returns
3. Update `SummaryForge` to delegate to generation module
4. Test generation functionality

### Phase 4: Extract Processing Module
1. Create `src/core/processing.js`
2. Move processing methods with JSON returns
3. Update `SummaryForge` to delegate to processing module
4. Test processing functionality

### Phase 5: Finalize
1. Update all imports in `src/index.js`
2. Update tests
3. Update documentation
4. Verify all functionality works

## Benefits

1. **Maintainability**: Smaller, focused modules are easier to understand and modify
2. **Testability**: Each module can be tested independently
3. **Reusability**: Modules can be used independently or in different combinations
4. **Separation of Concerns**: Clear boundaries between different functionalities
5. **JSON API**: All methods return consistent JSON format
6. **Scalability**: Easy to add new features or modify existing ones

## JSON Return Format Standard

All methods follow this pattern:
```javascript
// Success
{
  success: true,
  ...data,
  message: "Operation completed successfully"
}

// Error
{
  success: false,
  error: "Error message",
  message: "Operation failed",
  ...partialData
}