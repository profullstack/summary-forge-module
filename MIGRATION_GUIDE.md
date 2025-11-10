# Migration Guide: JSON API Update

**Version:** 1.4.0 → 1.5.0  
**Date:** 2025-11-10  
**Breaking Changes:** Minimal (error handling only)

---

## Overview

All methods in the `SummaryForge` class now return consistent JSON objects instead of mixed return types. This enables better error handling, REST API integration, and a more predictable developer experience.

---

## What Changed

### New Return Format

All methods now return:

```javascript
{
  success: true | false,  // Indicates if operation succeeded
  ...data,                // Method-specific data fields
  error?: string,         // Error message (only when success is false)
  message?: string        // Success message (optional)
}
```

### Error Handling

**Before:** Methods threw exceptions on errors  
**After:** Methods return JSON with `success: false` and `error` field

---

## Migration Steps

### 1. Update Error Handling

**Old Code (throws exceptions):**
```javascript
try {
  const results = await forge.searchBookByTitle('Clean Code');
  console.log('Found:', results.length);
} catch (error) {
  console.error('Error:', error.message);
}
```

**New Code (JSON responses):**
```javascript
const result = await forge.searchBookByTitle('Clean Code');
if (result.success) {
  console.log(`Found ${result.count} books`);
  console.log('Results:', result.results);
} else {
  console.error('Search failed:', result.error);
}
```

### 2. Update Field Access

Some methods now wrap data in sub-objects:

**`generateOutputFiles()` - Files wrapped:**
```javascript
// Old
const outputs = await forge.generateOutputFiles(markdown, basename, dir);
console.log(outputs.summaryMd);

// New
const result = await forge.generateOutputFiles(markdown, basename, dir);
if (result.success) {
  console.log(result.files.summaryMd);
}
```

**`loadConfig()` - Config wrapped:**
```javascript
// Old
const config = await loadConfig();
console.log(config.openaiApiKey);

// New
const result = await loadConfig();
if (result.success) {
  console.log(result.config.openaiApiKey);
}
```

### 3. Update Method Calls

**Search Methods:**
```javascript
// Old
const results = await forge.searchAnnasArchive('query');
results.forEach(r => console.log(r.title));

// New
const result = await forge.searchAnnasArchive('query');
if (result.success) {
  result.results.forEach(r => console.log(r.title));
}
```

**Download Methods:**
```javascript
// Old
const download = await forge.downloadFromAnnasArchive(asin, '.');
console.log('Downloaded:', download.filepath);

// New
const result = await forge.downloadFromAnnasArchive(asin, '.');
if (result.success) {
  console.log('Downloaded:', result.filepath);
} else {
  console.error('Download failed:', result.error);
}
```

**Generation Methods:**
```javascript
// Old
const markdown = await forge.generateSummary('./book.pdf');
console.log('Summary:', markdown.length);

// New
const result = await forge.generateSummary('./book.pdf');
if (result.success) {
  console.log('Summary:', result.markdown.length);
  console.log('Method used:', result.method);
} else {
  console.error('Generation failed:', result.error);
}
```

---

## Method-by-Method Changes

### Search Methods

#### `searchBookByTitle(title)`
```javascript
// Old return: Array of results (throws on error)
// New return: { success, results, count, query, message, error? }

// Migration:
const result = await forge.searchBookByTitle('title');
const results = result.success ? result.results : [];
```

#### `searchAnnasArchive(query, options)`
```javascript
// Old return: Array of results (throws on error)
// New return: { success, results, count, query, options, message, error? }

// Migration:
const result = await forge.searchAnnasArchive('query');
const results = result.success ? result.results : [];
```

#### `search1lib(query, options)`
```javascript
// Old return: Array of results (throws on error)
// New return: { success, results, count, query, options, message, error? }

// Migration:
const result = await forge.search1lib('query');
const results = result.success ? result.results : [];
```

### Download Methods

#### `downloadFromAnnasArchive(asin, outputDir, bookTitle)`
```javascript
// Old return: { filepath, directory, ... } (throws on error)
// New return: { success, filepath, directory, asin, format, message, error? }

// Migration:
const result = await forge.downloadFromAnnasArchive(asin, '.');
if (result.success) {
  const filepath = result.filepath;
}
```

#### `downloadFrom1lib(bookUrl, outputDir, bookTitle, downloadUrl)`
```javascript
// Old return: { filepath, directory, ... } (throws on error)
// New return: { success, filepath, directory, title, format, message, error? }

// Migration:
const result = await forge.downloadFrom1lib(url, '.');
if (result.success) {
  const filepath = result.filepath;
}
```

#### `convertEpubToPdf(epubPath)`
```javascript
// Old return: String path to PDF (throws on error)
// New return: { success, pdfPath, originalPath, message, error? }

// Migration:
const result = await forge.convertEpubToPdf('./book.epub');
const pdfPath = result.success ? result.pdfPath : null;
```

### Generation Methods

#### `generateSummary(pdfPath)`
```javascript
// Old return: String markdown (throws on error)
// New return: { success, markdown, length, method, chunks?, message, error? }

// Migration:
const result = await forge.generateSummary('./book.pdf');
const markdown = result.success ? result.markdown : null;
```

#### `generateAudioScript(markdown)`
```javascript
// Old return: String script
// New return: { success, script, length, message }

// Migration:
const result = await forge.generateAudioScript(markdown);
const script = result.success ? result.script : null;
```

#### `generateAudio(text, outputPath)`
```javascript
// Old return: String path or null
// New return: { success, path, size, duration, message, error? }

// Migration:
const result = await forge.generateAudio(text, './output.mp3');
const audioPath = result.success ? result.path : null;
```

#### `generateOutputFiles(markdown, basename, outputDir)`
```javascript
// Old return: { summaryMd, summaryTxt, ... }
// New return: { success, files: { summaryMd, summaryTxt, ... }, message }

// Migration:
const result = await forge.generateOutputFiles(markdown, basename, dir);
const files = result.success ? result.files : null;
```

#### `createBundle(files, archiveName)`
```javascript
// Old return: String archive path (throws on error)
// New return: { success, path, files, message, error? }

// Migration:
const result = await forge.createBundle(files, archiveName);
const archivePath = result.success ? result.path : null;
```

### Processing Methods

#### `processFile(filePath, asin)`
```javascript
// Old return: { basename, markdown, files, ... } (throws on error)
// New return: { success, basename, markdown, files, ..., message, error? }

// Migration:
const result = await forge.processFile('./book.pdf');
if (result.success) {
  // All existing fields still available
  console.log(result.basename, result.markdown, result.files);
}
```

#### `processWebPage(url, outputDir)`
```javascript
// Old return: { basename, markdown, files, ... } (throws on error)
// New return: { success, basename, markdown, files, ..., message, error? }

// Migration:
const result = await forge.processWebPage('https://example.com');
if (result.success) {
  // All existing fields still available
  console.log(result.title, result.markdown, result.files);
}
```

### Utility Methods

#### `getCostSummary()`
```javascript
// Old return: { openai, elevenlabs, ... }
// New return: { success: true, openai, elevenlabs, ... }

// Migration:
const costs = forge.getCostSummary();
// Just add: expect(costs.success).toBe(true);
```

---

## Config Functions

### `getConfigPath()`
```javascript
// Old return: String path
// New return: { success, path, directory }

// Migration:
const result = getConfigPath();
const path = result.path;
```

### `hasConfig()`
```javascript
// Old return: Boolean
// New return: { success, exists, path }

// Migration:
const result = await hasConfig();
const exists = result.exists;
```

### `loadConfig(options)`
```javascript
// Old return: Config object or null
// New return: { success, config, source, path, error? }

// Migration:
const result = await loadConfig();
const config = result.success ? result.config : null;
```

### `saveConfig(config)`
```javascript
// Old return: void (throws on error)
// New return: { success, path, message, error? }

// Migration:
const result = await saveConfig(config);
if (!result.success) {
  console.error('Save failed:', result.error);
}
```

### `deleteConfig()`
```javascript
// Old return: void (throws on error)
// New return: { success, path, message, wasDeleted, error? }

// Migration:
const result = await deleteConfig();
if (result.success && result.wasDeleted) {
  console.log('Config deleted');
}
```

---

## Flashcard Functions

### `extractFlashcards(markdown, options)`
```javascript
// Old return: Array of flashcards
// New return: { success, flashcards, count, maxCards, patterns }

// Migration:
const result = extractFlashcards(markdown);
const flashcards = result.success ? result.flashcards : [];
```

### `generateFlashcardsPDF(flashcards, outputPath, options)`
```javascript
// Old return: String path (throws on error)
// New return: { success, path, count, pages, message, error? }

// Migration:
const result = await generateFlashcardsPDF(flashcards, './output.pdf');
if (result.success) {
  console.log('PDF created:', result.path);
}
```

---

## Quick Migration Checklist

- [ ] Replace try-catch blocks with `if (result.success)` checks
- [ ] Update field access for wrapped data (e.g., `result.config` instead of `result`)
- [ ] Update array access (e.g., `result.results` instead of `result`)
- [ ] Add error handling for all method calls
- [ ] Test error cases to ensure proper handling
- [ ] Update any REST API endpoints to return the new JSON format
- [ ] Update CLI commands if they parse method results

---

## Benefits of Migration

✅ **Consistent Error Handling** - No more try-catch everywhere  
✅ **Better Debugging** - Rich metadata in all responses  
✅ **REST API Ready** - Direct JSON responses  
✅ **Type Safety** - Predictable structure  
✅ **Graceful Degradation** - Partial success information  

---

## Support

If you encounter issues during migration:

1. Check the [`README.md`](README.md:224) JSON API Format section
2. Review [`examples/programmatic-usage.js`](examples/programmatic-usage.js:1) for updated examples
3. See [`JSON_MIGRATION_COMPLETE.md`](JSON_MIGRATION_COMPLETE.md:1) for technical details
4. Run tests to verify your changes: `npm test`

---

**Last Updated:** 2025-11-10  
**Applies to:** Version 1.5.0 and later