/**
 * Tests for PDF Chunker Utility
 */

import { describe, it, expect } from 'vitest';
import { extractPdfPages, createChunks, calculateOptimalChunkSize, getPdfStats } from '../src/utils/pdf-chunker.js';

describe('PDF Chunker', () => {
  describe('calculateOptimalChunkSize', () => {
    it('should return a reasonable chunk size for small PDFs', () => {
      const chunkSize = calculateOptimalChunkSize(50000, 100000);
      expect(chunkSize).toBeGreaterThanOrEqual(50000);
      expect(chunkSize).toBeLessThanOrEqual(150000);
    });

    it('should return a reasonable chunk size for large PDFs', () => {
      const chunkSize = calculateOptimalChunkSize(1000000, 100000);
      expect(chunkSize).toBeGreaterThanOrEqual(50000);
      expect(chunkSize).toBeLessThanOrEqual(150000);
    });

    it('should respect token limits', () => {
      const maxTokens = 50000;
      const chunkSize = calculateOptimalChunkSize(500000, maxTokens);
      // 1 token ≈ 4 chars, with 80% safety margin
      const expectedMax = Math.floor(maxTokens * 4 * 0.8);
      expect(chunkSize).toBeLessThanOrEqual(expectedMax);
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
    it('should handle typical book-sized content', () => {
      // Simulate a 500-page book with ~2000 chars per page = 1,000,000 chars total
      const pages = Array.from({ length: 500 }, (_, i) => ({
        pageNum: i + 1,
        text: 'A'.repeat(2000),
        charCount: 2000
      }));
      
      const chunkSize = calculateOptimalChunkSize(1000000, 100000);
      const chunks = createChunks(pages, chunkSize);
      
      // Verify reasonable number of chunks
      expect(chunks.length).toBeGreaterThanOrEqual(5);
      expect(chunks.length).toBeLessThanOrEqual(20);
      
      // Verify all pages are included
      const totalPages = chunks.reduce((sum, chunk) =>
        sum + (chunk.endPage - chunk.startPage + 1), 0
      );
      expect(totalPages).toBe(500);
      
      // Verify no gaps between chunks
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(chunks[i].endPage + 1).toBe(chunks[i + 1].startPage);
      }
    });
  });
});