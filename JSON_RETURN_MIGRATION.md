# JSON Return Type Migration Guide

## Overview

This document describes the refactoring of all ESM methods to return JSON objects instead of mixed return types. This change enables better API integration, CLI usage, and JSON REST API development.

## Completed Refactorings

### 1. Config Utility Functions (`src/utils/config.js`)

#### `getConfigPath()`
**Before:** Returns string path
**After:** Returns JSON object
```javascript
{
  success: true,
  path: "/home/user/.config/summary-forge/settings.json",
  directory: "/home/user/.config/summary-forge"
}
```

#### `hasConfig()`
**Before:** Returns boolean
**After:** Returns JSON object
```javascript
{
  success: true,
  exists: true,
  path: "/home/user/.config/summary-forge/settings.json"
}
```

#### `loadConfig(options)`
**Before:** Returns config object or null
**After:** Returns JSON object with metadata
```javascript
{
  success: true,
  source: "file_with_env_fallback",
  path: "/home/user/.config/summary-forge/settings.json",
  config: { /* config data */ }
}
```

#### `saveConfig(config)`
**Before:** Returns void (throws on error)
**After:** Returns JSON object
```javascript
{
  success: true,
  path: "/home/user/.config/summary-forge/settings.json",
  message: "Configuration saved successfully"
}
```

#### `deleteConfig()`
**Before:** Returns void (throws on error)
**After:** Returns JSON object
```javascript
{
  success: true,
  path: "/home/user/.config/summary-forge/settings.json",
  message: "Configuration deleted successfully",
  wasDeleted: true
}
```

### 2. Flashcards Functions (`src/flashcards.js`)

#### `extractFlashcards(markdown, options)`
**Before:** Returns array of flashcard objects
**After:** Returns JSON object with metadata
```javascript
{
  success: true,
  flashcards: [
    { question: "...", answer: "...", source: "qa" }
  ],
  count: 25,
  maxCards: 100,
  patterns: {
    qaFormat: 15,
    definitions: 8,
    headers: 2
  }
}
```

#### `generateFlashcardsPDF(flashcards, outputPath, options)`
**Before:** Returns string path (throws on error)
**After:** Returns JSON object
```javascript
{
  success: true,
  path: "/path/to/flashcards.pdf",
  count: 25,
  pages: 6,
  message: "Flashcards PDF generated successfully"
}
```

## Migration Strategy for SummaryForge Class

The `SummaryForge` class has many methods that need refactoring. The strategy is:

### Core Principles
1. **Backward Compatibility**: Maintain the existing object structure in return values
2. **Consistent Format**: All methods return `{ success, ...data, error?, message? }`
3. **Error Handling**: Errors return JSON instead of throwing (where appropriate)
4. **Metadata**: Include useful metadata (timestamps, counts, paths, etc.)

### Methods to Refactor

#### Search Methods
- `searchBookByTitle(title)` → Returns `{ success, results, count, query }`
- `searchAnnasArchive(query, options)` → Returns `{ success, results, count, query, options }`
- `search1lib(query, options)` → Returns `{ success, results, count, query, options }`

#### Download Methods
- `downloadFromAnnasArchive(asin, outputDir, bookTitle)` → Returns `{ success, filepath, directory, title, asin, format, converted, message }`
- `downloadFrom1lib(bookUrl, outputDir, bookTitle, downloadUrl)` → Returns `{ success, filepath, directory, title, format, message }`
- `search1libAndDownload(query, searchOptions, outputDir, selectCallback)` → Returns `{ success, results, download: { filepath, directory, ... } }`

#### Processing Methods
- `processFile(filePath, asin)` → Returns `{ success, basename, dirName, markdown, files, directory, archive, hasAudio, asin, costs, message }`
- `processWebPage(url, outputDir)` → Returns `{ success, basename, dirName, markdown, files, directory, archive, hasAudio, url, title, costs, message }`

#### Generation Methods
- `generateSummary(pdfPath)` → Returns `{ success, markdown, length, method, costs, message }`
- `generateAudioScript(markdown)` → Returns `{ success, script, length, costs, message }`
- `generateAudio(text, outputPath)` → Returns `{ success, path, size, duration, costs, message }`
- `generateOutputFiles(markdown, basename, outputDir)` → Returns `{ success, files: { summaryMd, summaryTxt, ... }, message }`

#### Utility Methods
- `getCostSummary()` → Already returns JSON ✓
- `convertEpubToPdf(epubPath)` → Returns `{ success, pdfPath, originalPath, message }`

## Usage Examples

### Before (Old API)
```javascript
const config = await loadConfig();
if (!config) {
  console.error('No config found');
  return;
}
console.log(config.openaiApiKey);
```

### After (New API)
```javascript
const result = await loadConfig();
if (!result.success) {
  console.error('Failed to load config:', result.error);
  return;
}
console.log(result.config.openaiApiKey);
```

### REST API Usage
```javascript
app.get('/api/config', async (req, res) => {
  const result = await loadConfig();
  res.json(result);
});

app.post('/api/flashcards/extract', async (req, res) => {
  const result = extractFlashcards(req.body.markdown, req.body.options);
  res.json(result);
});
```

## Benefits

1. **Consistent API**: All methods return the same structure
2. **Better Error Handling**: Errors are part of the response, not exceptions
3. **REST API Ready**: JSON responses work directly with HTTP APIs
4. **CLI Friendly**: Easy to parse and display in CLI tools
5. **Type Safety**: Clear structure for TypeScript users
6. **Debugging**: More context in responses (source, paths, counts, etc.)

## Next Steps

1. ✅ Refactor config.js utility functions
2. ✅ Refactor flashcards.js functions
3. 🔄 Refactor SummaryForge class methods
4. ⏳ Update tests to match new JSON return format
5. ⏳ Update documentation and examples
6. ⏳ Verify all changes work correctly