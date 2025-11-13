/**
 * Flashcards Generator Tests
 * 
 * Tests for extracting Q&A pairs from markdown and generating printable flashcard PDFs
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractFlashcards, generateFlashcardsPDF, generateFlashcardImages } from '../src/flashcards.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Flashcards Generator', () => {
  describe('extractFlashcards', () => {
    it('should extract Q&A pairs from markdown with explicit Q&A format', () => {
      const markdown = `
# Chapter 1: Introduction

**Q: What is the main concept?**
A: The main concept is about understanding the fundamentals.

**Q: Why is this important?**
A: It's important because it forms the foundation for advanced topics.
      `;

      const result = extractFlashcards(markdown);
      
      expect(result.success).toBe(true);
      expect(result.flashcards).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.flashcards[0]).toEqual({
        question: 'What is the main concept?',
        answer: 'The main concept is about understanding the fundamentals.',
        source: 'qa'
      });
      expect(result.flashcards[1]).toEqual({
        question: 'Why is this important?',
        answer: "It's important because it forms the foundation for advanced topics.",
        source: 'qa'
      });
    });

    it('should extract Q&A pairs from definition lists', () => {
      const markdown = `
## Key Terms

**Term 1**
: Definition of term 1 goes here.

**Term 2**
: Definition of term 2 goes here.
      `;

      const result = extractFlashcards(markdown);
      
      expect(result.success).toBe(true);
      expect(result.flashcards).toHaveLength(2);
      expect(result.flashcards[0].question).toContain('Term 1');
      expect(result.flashcards[0].answer).toContain('Definition of term 1');
    });

    it('should extract Q&A from headers followed by content', () => {
      const markdown = `
### What is Node.js?

Node.js is a JavaScript runtime built on Chrome's V8 engine.

### Why use async/await?

Async/await makes asynchronous code easier to read and write.
      `;

      const result = extractFlashcards(markdown);
      
      expect(result.success).toBe(true);
      expect(result.count).toBeGreaterThan(0);
      expect(result.flashcards[0].question).toContain('Node.js');
    });

    it('should handle empty or invalid markdown', () => {
      const emptyResult = extractFlashcards('');
      expect(emptyResult.success).toBe(false);
      expect(emptyResult.flashcards).toEqual([]);
      expect(emptyResult.count).toBe(0);
      
      const invalidResult = extractFlashcards('Just some text without structure');
      // extractFlashcards returns success: true with empty array when no flashcards found
      expect(invalidResult.success).toBe(true);
      expect(invalidResult.flashcards).toEqual([]);
      expect(invalidResult.count).toBe(0);
    });

    it('should limit flashcards to a maximum number', () => {
      const markdown = Array.from({ length: 100 }, (_, i) =>
        `**Q: Question ${i}?**\nA: Answer ${i}.`
      ).join('\n\n');

      const result = extractFlashcards(markdown, { maxCards: 50 });
      
      expect(result.success).toBe(true);
      expect(result.flashcards).toHaveLength(50);
      expect(result.count).toBe(50);
      expect(result.maxCards).toBe(50);
    });

    it('should clean up markdown formatting in questions and answers', () => {
      const markdown = `
**Q: What is *emphasis* and **strong** text?**
A: It's \`code\` and [links](http://example.com) that should be cleaned.
      `;

      const result = extractFlashcards(markdown);
      
      expect(result.success).toBe(true);
      expect(result.flashcards[0].question).not.toContain('*');
      expect(result.flashcards[0].question).not.toContain('**');
      expect(result.flashcards[0].answer).not.toContain('`');
      expect(result.flashcards[0].answer).not.toContain('[');
    });
  });

  describe('generateFlashcardsPDF', () => {
    const testOutputDir = './test-output';
    const testPdfPath = path.join(testOutputDir, 'test-flashcards.pdf');

    beforeEach(async () => {
      // Clean up and recreate test directory
      try {
        await fs.rm(testOutputDir, { recursive: true, force: true });
      } catch (err) {
        // Ignore if doesn't exist
      }
      await fs.mkdir(testOutputDir, { recursive: true });
    });

    afterEach(async () => {
      // Clean up after tests
      try {
        await fs.rm(testOutputDir, { recursive: true, force: true });
      } catch (err) {
        // Ignore cleanup errors
      }
    });

    it('should generate a PDF file with flashcards', async () => {
      const flashcards = [
        { question: 'What is Node.js?', answer: 'A JavaScript runtime' },
        { question: 'What is async/await?', answer: 'A way to handle promises' }
      ];

      await generateFlashcardsPDF(flashcards, testPdfPath, {
        title: 'Test Flashcards',
        branding: 'SummaryForge.com'
      });

      const fileExists = await fs.access(testPdfPath)
        .then(() => true)
        .catch(() => false);
      
      expect(fileExists).toBe(true);

      const stats = await fs.stat(testPdfPath);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should return error JSON for empty flashcards array', async () => {
      const result = await generateFlashcardsPDF([], testPdfPath);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No flashcards to generate');
      expect(result.path).toBeNull();
      expect(result.count).toBe(0);
    });

    it('should create output directory if it does not exist', async () => {
      const nestedPath = path.join(testOutputDir, 'nested', 'dir', 'flashcards.pdf');
      const flashcards = [
        { question: 'Test?', answer: 'Yes' }
      ];

      await generateFlashcardsPDF(flashcards, nestedPath);

      const fileExists = await fs.access(nestedPath)
        .then(() => true)
        .catch(() => false);
      
      expect(fileExists).toBe(true);
    });

    it('should support custom styling options', async () => {
      const flashcards = [
        { question: 'Custom style test?', answer: 'Yes, it works!' }
      ];

      await generateFlashcardsPDF(flashcards, testPdfPath, {
        cardWidth: 4,
        cardHeight: 3,
        fontSize: 14,
        fontFamily: 'Helvetica'
      });

      const stats = await fs.stat(testPdfPath);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('generateFlashcardImages', () => {
    const testOutputDir = './test-output-images/flashcards';

    beforeEach(async () => {
      // Clean up and recreate test directory
      try {
        await fs.rm('./test-output-images', { recursive: true, force: true });
      } catch (err) {
        // Ignore if doesn't exist
      }
      await fs.mkdir(testOutputDir, { recursive: true });
    });

    afterEach(async () => {
      // Clean up after tests
      try {
        await fs.rm('./test-output-images', { recursive: true, force: true });
      } catch (err) {
        // Ignore cleanup errors
      }
    });

    it('should generate PNG images for each flashcard', async () => {
      const flashcards = [
        { question: 'What is Node.js?', answer: 'A JavaScript runtime' },
        { question: 'What is async/await?', answer: 'A way to handle promises' }
      ];

      const result = await generateFlashcardImages(flashcards, testOutputDir, {
        title: 'Test Book',
        branding: 'SummaryForge.com'
      });

      // If generation failed, log the error for debugging
      if (!result.success) {
        console.error('Image generation failed:', result.error);
        console.error('Full result:', result);
      }

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.images).toHaveLength(4); // 2 questions + 2 answers
      expect(result.outputDir).toBe(testOutputDir);

      // Verify question images exist
      const q1Exists = await fs.access(path.join(testOutputDir, 'q-001.png'))
        .then(() => true)
        .catch(() => false);
      const q2Exists = await fs.access(path.join(testOutputDir, 'q-002.png'))
        .then(() => true)
        .catch(() => false);

      expect(q1Exists).toBe(true);
      expect(q2Exists).toBe(true);

      // Verify answer images exist
      const a1Exists = await fs.access(path.join(testOutputDir, 'a-001.png'))
        .then(() => true)
        .catch(() => false);
      const a2Exists = await fs.access(path.join(testOutputDir, 'a-002.png'))
        .then(() => true)
        .catch(() => false);

      expect(a1Exists).toBe(true);
      expect(a2Exists).toBe(true);

      // Verify file sizes are reasonable
      const q1Stats = await fs.stat(path.join(testOutputDir, 'q-001.png'));
      expect(q1Stats.size).toBeGreaterThan(1000); // At least 1KB
    });

    it('should return error JSON for empty flashcards array', async () => {
      const result = await generateFlashcardImages([], testOutputDir);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No flashcards to generate');
      expect(result.count).toBe(0);
      expect(result.images).toEqual([]);
    });

    it('should create output directory if it does not exist', async () => {
      const nestedPath = path.join(testOutputDir, 'nested', 'dir');
      const flashcards = [
        { question: 'Test?', answer: 'Yes' }
      ];

      const result = await generateFlashcardImages(flashcards, nestedPath);

      expect(result.success).toBe(true);

      const dirExists = await fs.access(nestedPath)
        .then(() => true)
        .catch(() => false);

      expect(dirExists).toBe(true);
    });

    it('should support custom image dimensions', async () => {
      const flashcards = [
        { question: 'Custom size test?', answer: 'Yes, it works!' }
      ];

      const result = await generateFlashcardImages(flashcards, testOutputDir, {
        width: 800,
        height: 600,
        title: 'Custom Size Book'
      });

      // If generation failed, log the error for debugging
      if (!result.success) {
        console.error('Image generation failed:', result.error);
        console.error('Full result:', result);
      }

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);

      const qStats = await fs.stat(path.join(testOutputDir, 'q-001.png'));
      expect(qStats.size).toBeGreaterThan(1000);
    });

    it('should include book title in images', async () => {
      const flashcards = [
        { question: 'Title test?', answer: 'Yes' }
      ];

      const result = await generateFlashcardImages(flashcards, testOutputDir, {
        title: 'My Awesome Book',
        branding: 'SummaryForge.com'
      });

      expect(result.success).toBe(true);
      expect(result.title).toBe('My Awesome Book');
    });

    it('should handle long text with proper wrapping', async () => {
      const flashcards = [
        {
          question: 'What is a very long question that should wrap properly across multiple lines in the image?',
          answer: 'This is a very long answer that contains multiple sentences and should also wrap properly. It tests the text wrapping functionality of the image generation system.'
        }
      ];

      const result = await generateFlashcardImages(flashcards, testOutputDir);

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);

      const qStats = await fs.stat(path.join(testOutputDir, 'q-001.png'));
      const aStats = await fs.stat(path.join(testOutputDir, 'a-001.png'));

      expect(qStats.size).toBeGreaterThan(1000);
      expect(aStats.size).toBeGreaterThan(1000);
    });

    it('should return list of generated image paths', async () => {
      const flashcards = [
        { question: 'Q1?', answer: 'A1' },
        { question: 'Q2?', answer: 'A2' }
      ];

      const result = await generateFlashcardImages(flashcards, testOutputDir);

      // Check for errors first
      if (!result.success) {
        console.error('Image generation failed:', result.error);
      }

      expect(result.success).toBe(true);
      expect(result.images).toHaveLength(4);
      expect(result.images).toContain(path.join(testOutputDir, 'q-001.png'));
      expect(result.images).toContain(path.join(testOutputDir, 'a-001.png'));
      expect(result.images).toContain(path.join(testOutputDir, 'q-002.png'));
      expect(result.images).toContain(path.join(testOutputDir, 'a-002.png'));
    });
  });
});