/**
 * Flashcards Generator Tests
 * 
 * Tests for extracting Q&A pairs from markdown and generating printable flashcard PDFs
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { extractFlashcards, generateFlashcardsPDF } from '../src/flashcards.js';
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
      await fs.mkdir(testOutputDir, { recursive: true });
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
});