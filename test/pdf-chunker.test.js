/**
 * Tests for PDF Chunker Utility
 */

import { describe, it, expect } from 'vitest';
import { extractPdfPages, createChunks, calculateOptimalChunkSize, getPdfStats } from '../src/utils/pdf-chunker.js';

describe('PDF Chunker', () => {
  describe('calculateOptimalChunkSize', () => {
    it('should return a reasonable chunk size for small PDFs', () => {
      const chunkSize = calculateOptimalChunkSize(50000, 250000);
      expect(chunkSize).toBeGreaterThanOrEqual(50000);
      // With new formula: (250000 - 20000) * 3.5 * 0.70 = 563,500 chars
      expect(chunkSize).toBeLessThanOrEqual(600000);
    });

    it('should return a reasonable chunk size for large PDFs', () => {
      const chunkSize = calculateOptimalChunkSize(1000000, 250000);
      expect(chunkSize).toBeGreaterThanOrEqual(50000);
      // Should allow larger chunks with GPT-5's higher limit
      expect(chunkSize).toBeLessThanOrEqual(600000);
    });

    it('should respect token limits with safety margins', () => {
      const maxInputTokens = 250000;
      const chunkSize = calculateOptimalChunkSize(500000, maxInputTokens);
      // New formula: (maxInputTokens - 20000) * 3.5 * 0.70
      const SYSTEM_OVERHEAD = 20000;
      const CHARS_PER_TOKEN = 3.5;
      const SAFETY_MARGIN = 0.70;
      const expectedMax = Math.floor((maxInputTokens - SYSTEM_OVERHEAD) * CHARS_PER_TOKEN * SAFETY_MARGIN);
      expect(chunkSize).toBeLessThanOrEqual(expectedMax);
    });

    it('should handle GPT-5 token limits correctly', () => {
      // GPT-5 has 272k input limit, we use 250k to be safe
      const chunkSize = calculateOptimalChunkSize(1000000, 250000);
      // Should produce chunks that fit within GPT-5's limits
      const estimatedTokens = Math.ceil(chunkSize / 3.5);
      expect(estimatedTokens).toBeLessThan(250000);
    });

    it('should enforce minimum chunk size', () => {
      // Even with very low token limits, should maintain minimum
      const chunkSize = calculateOptimalChunkSize(10000, 10000);
      expect(chunkSize).toBeGreaterThanOrEqual(50000);
    });
  });

  describe('createChunks', () => {
    it('should create single chunk for small content', () => {
      const pages = [
        { pageNum: 1, text: 'Page 1 content', charCount: 14 },
        { pageNum: 2, text: 'Page 2 content', charCount: 14 }
      ];
      
      const chunks = createChunks(pages, 100);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].startPage).toBe(1);
      expect(chunks[0].endPage).toBe(2);
    });

    it('should split into multiple chunks when exceeding limit', () => {
      const pages = [
        { pageNum: 1, text: 'A'.repeat(60), charCount: 60 },
        { pageNum: 2, text: 'B'.repeat(60), charCount: 60 },
        { pageNum: 3, text: 'C'.repeat(60), charCount: 60 }
      ];
      
      const chunks = createChunks(pages, 100);
      expect(chunks.length).toBeGreaterThan(1);
      
      // Verify no chunk exceeds the limit
      chunks.forEach(chunk => {
        expect(chunk.charCount).toBeLessThanOrEqual(100);
      });
    });

    it('should maintain page order in chunks', () => {
      const pages = [
        { pageNum: 1, text: 'Page 1', charCount: 6 },
        { pageNum: 2, text: 'Page 2', charCount: 6 },
        { pageNum: 3, text: 'Page 3', charCount: 6 },
        { pageNum: 4, text: 'Page 4', charCount: 6 }
      ];
      
      const chunks = createChunks(pages, 15);
      
      // Verify chunks are sequential
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(chunks[i].endPage).toBeLessThan(chunks[i + 1].startPage);
      }
    });

    it('should handle single large page', () => {
      const pages = [
        { pageNum: 1, text: 'A'.repeat(200), charCount: 200 }
      ];
      
      const chunks = createChunks(pages, 100);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].charCount).toBe(200);
    });

    it('should correctly calculate chunk character counts', () => {
      const pages = [
        { pageNum: 1, text: 'Hello', charCount: 5 },
        { pageNum: 2, text: 'World', charCount: 5 }
      ];
      
      const chunks = createChunks(pages, 100);
      expect(chunks[0].charCount).toBe(10);
      expect(chunks[0].text).toBe('HelloWorld');
    });
  });

  describe('extractPdfPages', () => {
    it('should handle missing PDF file gracefully', async () => {
      await expect(extractPdfPages('/nonexistent/file.pdf')).rejects.toThrow(/ENOENT|no such file/i);
    });
  });

  describe('getPdfStats', () => {
    it('should handle missing PDF file gracefully', async () => {
      await expect(getPdfStats('/nonexistent/file.pdf')).rejects.toThrow(/ENOENT|no such file/i);
    });
  });

  describe('Integration: Full chunking workflow', () => {
    it('should handle typical book-sized content with GPT-5 limits', () => {
      // Simulate a 500-page book with ~2000 chars per page = 1,000,000 chars total
      const pages = Array.from({ length: 500 }, (_, i) => ({
        pageNum: i + 1,
        text: 'A'.repeat(2000),
        charCount: 2000
      }));
      
      // Use GPT-5's 250k token limit (272k actual - 22k buffer)
      const chunkSize = calculateOptimalChunkSize(1000000, 250000);
      const chunks = createChunks(pages, chunkSize);
      
      // With larger chunk sizes, should need fewer chunks
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks.length).toBeLessThanOrEqual(10);
      
      // Verify all pages are included
      const totalPages = chunks.reduce((sum, chunk) =>
        sum + (chunk.endPage - chunk.startPage + 1), 0
      );
      expect(totalPages).toBe(500);
      
      // Verify no gaps between chunks
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(chunks[i].endPage + 1).toBe(chunks[i + 1].startPage);
      }
      
      // Verify each chunk respects token limits
      chunks.forEach(chunk => {
        const estimatedTokens = Math.ceil(chunk.charCount / 3.5);
        expect(estimatedTokens).toBeLessThan(250000);
      });
    });

    it('should handle oversized PDFs that exceed single chunk limit', () => {
      // Simulate a very large PDF that would exceed 272k tokens in one go
      // 332,970 tokens = ~1,165,395 chars (at 3.5 chars/token)
      const totalChars = 1165395;
      const pages = Array.from({ length: 1000 }, (_, i) => ({
        pageNum: i + 1,
        text: 'A'.repeat(Math.floor(totalChars / 1000)),
        charCount: Math.floor(totalChars / 1000)
      }));
      
      const chunkSize = calculateOptimalChunkSize(totalChars, 250000);
      const chunks = createChunks(pages, chunkSize);
      
      // Should split into multiple chunks
      expect(chunks.length).toBeGreaterThan(1);
      
      // Each chunk should be within limits
      chunks.forEach(chunk => {
        const estimatedTokens = Math.ceil(chunk.charCount / 3.5);
        expect(estimatedTokens).toBeLessThan(250000);
      });
    });
  });
});