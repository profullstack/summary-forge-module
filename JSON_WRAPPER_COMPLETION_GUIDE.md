# JSON Wrapper Completion Guide

This document provides the exact code changes needed to complete the JSON wrapper migration for the remaining methods in `src/summary-forge.js`.

## Status Summary

### ✅ Completed (8 methods)
- `getCostSummary()`
- `searchBookByTitle()`
- `searchAnnasArchive()`
- `search1lib()`
- `search1libAndDownload()`
- `downloadFrom1lib()`
- `downloadFromAnnasArchive()`
- `convertEpubToPdf()`

### 🔄 Remaining (7 methods)
- `generateSummary()`
- `generateAudioScript()`
- `generateAudio()`
- `generateOutputFiles()`
- `createBundle()`
- `processFile()`
- `processWebPage()`

---

## Method 1: generateSummary()

### Current Return Statements to Replace:

**Line ~2504:** (GPT-5 PDF upload success)
```javascript
// REPLACE THIS:
return md;

// WITH THIS:
return {
  success: true,
  markdown: md,
  length: md.length,
  method: 'gpt5_pdf_upload',
  message: 'Successfully generated summary using GPT-5 with PDF file'
};
```

**Line ~2582:** (Text extraction single request success)
```javascript
// REPLACE THIS:
return md;

// WITH THIS:
return {
  success: true,
  markdown: md,
  length: md.length,
  method: 'text_extraction_single',
  message: 'Successfully generated summary using text extraction'
};
```

**Line ~2638:** (Chunked processing success)
```javascript
// REPLACE THIS:
return finalSummary;

// WITH THIS:
return {
  success: true,
  markdown: finalSummary,
  length: finalSummary.length,
  method: 'text_extraction_chunked',
  chunks: chunks.length,
  message: 'Successfully generated comprehensive summary using intelligent chunking'
};
```

**Line ~2642:** (Error case)
```javascript
// REPLACE THIS:
throw new Error(`Failed to generate summary: ${textExtractionError.message}`);

// WITH THIS:
return {
  success: false,
  error: textExtractionError.message,
  markdown: null,
  length: 0,
  method: 'failed'
};
```

---

## Method 2: generateAudioScript()

### Current Return Statements to Replace:

**Line ~2700:** (Success case)
```javascript
// REPLACE THIS:
return script;

// WITH THIS:
return {
  success: true,
  script,
  length: script.length,
  message: 'Successfully generated audio script'
};
```

**Line ~2704:** (Fallback case)
```javascript
// REPLACE THIS:
return this.sanitizeTextForAudio(markdown);

// WITH THIS:
const fallbackScript = this.sanitizeTextForAudio(markdown);
return {
  success: true,
  script: fallbackScript,
  length: fallbackScript.length,
  message: 'Generated audio script using fallback sanitization'
};
```

---

## Method 3: generateAudio()

### Current Return Statements to Replace:

**Line ~2783:** (No ElevenLabs key)
```javascript
// REPLACE THIS:
return null;

// WITH THIS:
return {
  success: false,
  error: 'ElevenLabs API key not provided',
  path: null,
  size: 0
};
```

**Line ~2860:** (Success case)
```javascript
// REPLACE THIS:
return outputPath;

// WITH THIS:
return {
  success: true,
  path: outputPath,
  size: finalAudioBuffer.length,
  duration: Math.ceil(textToConvert.length / 1000),
  message: 'Successfully generated audio'
};
```

**Line ~2864:** (Error case)
```javascript
// REPLACE THIS:
return null;

// WITH THIS:
return {
  success: false,
  error: error.message,
  path: null,
  size: 0
};
```

---

## Method 4: generateOutputFiles()

### Current Return Statement to Replace:

**Line ~2961:** (Return statement)
```javascript
// REPLACE THIS:
return {
  summaryMd,
  summaryTxt,
  summaryPdf,
  summaryEpub,
  audioScript: audioScriptPath,
  summaryMp3: audioPath,
  flashcardsMd: flashcardsMdPath,
  flashcardsPdf: flashcardsPath
};

// WITH THIS:
return {
  success: true,
  files: {
    summaryMd,
    summaryTxt,
    summaryPdf,
    summaryEpub,
    audioScript: audioScriptPath,
    summaryMp3: audioPath,
    flashcardsMd: flashcardsMdPath,
    flashcardsPdf: flashcardsPath
  },
  message: 'Successfully generated all output files'
};
```

---

## Method 5: createBundle()

### Current Return Statement to Replace:

**Line ~2985:** (Return statement)
```javascript
// REPLACE THIS:
return archiveName;

// WITH THIS:
return {
  success: true,
  path: archiveName,
  files: files.length,
  message: `Successfully created bundle with ${files.length} files`
};
```

---

## Method 6: processFile()

### Update Required:

This method already returns an object. We need to add `success: true` and `message` fields.

**Line ~3291:** (Return statement)
```javascript
// ADD success and message fields to the existing return object:
return {
  success: true,  // ADD THIS
  basename,
  dirName,
  markdown,
  files,
  directory: bookDir,
  archive: archiveName,
  hasAudio: !!outputs.summaryMp3,
  asin: asin,
  costs: this.getCostSummary(),
  message: `Successfully processed file: ${basename}`  // ADD THIS
};
```

### Handle convertEpubToPdf() Result:

**Line ~3192:** (After convertEpubToPdf call)
```javascript
// REPLACE THIS:
pdfPath = await this.convertEpubToPdf(filePath);

// WITH THIS:
const conversionResult = await this.convertEpubToPdf(filePath);
if (!conversionResult.success) {
  return {
    success: false,
    error: conversionResult.error,
    basename: null,
    directory: null
  };
}
pdfPath = conversionResult.pdfPath;
```

### Handle generateSummary() Result:

**Line ~3226:** (After generateSummary call)
```javascript
// REPLACE THIS:
const markdown = await this.generateSummary(pdfPath);

// WITH THIS:
const summaryResult = await this.generateSummary(pdfPath);
if (!summaryResult.success) {
  return {
    success: false,
    error: summaryResult.error,
    basename,
    directory: bookDir
  };
}
const markdown = summaryResult.markdown;
```

### Handle generateOutputFiles() Result:

**Line ~3229:** (After generateOutputFiles call)
```javascript
// REPLACE THIS:
const outputs = await this.generateOutputFiles(markdown, basename, bookDir);

// WITH THIS:
const outputsResult = await this.generateOutputFiles(markdown, basename, bookDir);
if (!outputsResult.success) {
  return {
    success: false,
    error: 'Failed to generate output files',
    basename,
    directory: bookDir
  };
}
const outputs = outputsResult.files;
```

---

## Method 7: processWebPage()

### Update Required:

This method already returns an object. We need to add `success: true` and `message` fields.

**Line ~3166:** (Return statement)
```javascript
// ADD success and message fields to the existing return object:
return {
  success: true,  // ADD THIS
  basename: sanitizedTitle,
  dirName,
  markdown,
  files,
  directory: webPageDir,
  archive: archiveName,
  hasAudio: !!outputs.summaryMp3,
  url: pageUrl,
  title: finalTitle,
  costs: this.getCostSummary(),
  message: `Successfully processed web page: ${finalTitle}`  // ADD THIS
};
```

### Handle generateWebPageSummary() Result:

**Line ~3115:** (After generateWebPageSummary call)
```javascript
// REPLACE THIS:
const markdown = await this.generateWebPageSummary(pdfPath, finalTitle, url);

// WITH THIS:
const summaryResult = await this.generateWebPageSummary(pdfPath, finalTitle, url);
if (!summaryResult.success) {
  return {
    success: false,
    error: summaryResult.error,
    basename: sanitizedTitle,
    directory: webPageDir
  };
}
const markdown = summaryResult.markdown;
```

### Handle generateOutputFiles() Result:

**Line ~3118:** (After generateOutputFiles call)
```javascript
// REPLACE THIS:
const outputs = await this.generateOutputFiles(markdown, sanitizedTitle, webPageDir);

// WITH THIS:
const outputsResult = await this.generateOutputFiles(markdown, sanitizedTitle, webPageDir);
if (!outputsResult.success) {
  return {
    success: false,
    error: 'Failed to generate output files',
    basename: sanitizedTitle,
    directory: webPageDir
  };
}
const outputs = outputsResult.files;
```

---

## generateWebPageSummary() (Private Method)

### Current Return Statement to Replace:

**Line ~3023:** (Return statement)
```javascript
// REPLACE THIS:
return md;

// WITH THIS:
return {
  success: true,
  markdown: md,
  length: md.length,
  message: 'Successfully generated web page summary'
};
```

**Line ~3027:** (Error case)
```javascript
// REPLACE THIS:
throw new Error(`Failed to generate web page summary: ${fileUploadError.message}`);

// WITH THIS:
return {
  success: false,
  error: fileUploadError.message,
  markdown: null,
  length: 0
};
```

---

## Implementation Strategy

1. **Apply changes in order** - Start with the leaf methods (those that don't call other methods)
2. **Test after each change** - Run tests to ensure nothing breaks
3. **Update callers** - When a method's return type changes, update all code that calls it
4. **Maintain backward compatibility** - Consider adding a compatibility layer if needed

## Testing Checklist

After applying all changes:

- [ ] All search methods return JSON with `success` field
- [ ] All download methods return JSON with `success` field
- [ ] All generation methods return JSON with `success` field
- [ ] All processing methods return JSON with `success` field
- [ ] Error cases return JSON with `success: false` and `error` field
- [ ] Update all tests to check for `success` field
- [ ] Update all examples to use new return format
- [ ] Update README.md with new API format

## Next Steps

1. Apply these changes to `src/summary-forge.js`
2. Update tests in `test/` directory
3. Update examples in `examples/` directory
4. Update README.md documentation
5. Run full test suite
6. Update TASK_BREAKDOWN.md to mark Task 4 as complete