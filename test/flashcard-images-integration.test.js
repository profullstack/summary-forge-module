/**
 * Flashcard Images Integration Test
 * 
 * Tests that flashcard images are automatically generated in ./flashcards subdirectory
 * 
 * Testing Framework: Vitest
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SummaryForge } from '../src/summary-forge.js';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

describe('Flashcard Images Integration', () => {
  let forge;
  let testDir;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `flashcard-integration-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    
    forge = new SummaryForge({
      openaiApiKey: process.env.OPENAI_API_KEY || 'test-key'
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('generateOutputFiles with flashcard images', () => {
    it.skipIf(!process.env.OPENAI_API_KEY)(
      'should create flashcards subdirectory with images',
      async () => {
      // Create markdown with flashcards
      const markdown = `
# Test Book

## Chapter 1

Some content here.

## Study Flashcards

**Q: What is Node.js?**
A: Node.js is a JavaScript runtime built on Chrome's V8 engine.

**Q: What is async/await?**
A: Async/await is a way to handle asynchronous operations in JavaScript.
      `;

      const basename = 'test_book';
      const outputDir = testDir;

      // Generate output files
      const result = await forge.generateOutputFiles(markdown, basename, outputDir);

      expect(result.success).toBe(true);

      // Check that flashcards subdirectory was created
      const flashcardsDir = path.join(outputDir, 'flashcards');
      const dirExists = await fs.access(flashcardsDir)
        .then(() => true)
        .catch(() => false);

      expect(dirExists).toBe(true);

      // Check that image files were created
      const files = await fs.readdir(flashcardsDir);
      const imageFiles = files.filter(f => f.endsWith('.png'));

      // Should have question and answer images for each flashcard
      expect(imageFiles.length).toBeGreaterThan(0);
      expect(imageFiles.some(f => f.startsWith('q-'))).toBe(true);
      expect(imageFiles.some(f => f.startsWith('a-'))).toBe(true);
    }
    );

    it.skipIf(!process.env.OPENAI_API_KEY)(
      'should handle markdown without flashcards gracefully',
      async () => {
      const markdown = `
# Test Book

Just some content without any flashcards.
      `;

      const basename = 'no_flashcards';
      const outputDir = testDir;

      const result = await forge.generateOutputFiles(markdown, basename, outputDir);

      expect(result.success).toBe(true);

      // Flashcards directory should not be created if no flashcards
      const flashcardsDir = path.join(outputDir, 'flashcards');
      const dirExists = await fs.access(flashcardsDir)
        .then(() => true)
        .catch(() => false);

      // It's OK if directory exists but is empty, or doesn't exist
      if (dirExists) {
        const files = await fs.readdir(flashcardsDir);
        const imageFiles = files.filter(f => f.endsWith('.png'));
        expect(imageFiles.length).toBe(0);
      }
    }
    );
  });
});