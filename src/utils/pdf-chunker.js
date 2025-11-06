/**
 * PDF Chunker Utility
 * 
 * Handles chunking of large PDFs for processing with OpenAI APIs
 */

import { PDFParse } from 'pdf-parse';
import fsp from 'node:fs/promises';

/**
 * Extract text from PDF with page-level granularity
 * @param {string} pdfPath - Path to PDF file
 * @returns {Promise<Array<{pageNum: number, text: string}>>}
 */
export async function extractPdfPages(pdfPath) {
  const pdfBuffer = await fsp.readFile(pdfPath);
  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getText();
  await parser.destroy();
  
  // pdf-parse doesn't provide per-page text by default
  // We'll need to use a different approach or split by estimated page breaks
  const fullText = result.text;
  const totalPages = result.total;
  
  // Estimate characters per page
  const avgCharsPerPage = Math.ceil(fullText.length / totalPages);
  
  // Split text into page-sized chunks
  const pages = [];
  let currentPos = 0;
  
  for (let i = 0; i < totalPages; i++) {
    const pageText = fullText.slice(currentPos, currentPos + avgCharsPerPage);
    pages.push({
      pageNum: i + 1,
      text: pageText,
      charCount: pageText.length
    });
    currentPos += avgCharsPerPage;
  }
  
  return pages;
}

/**
 * Group pages into chunks based on character limit
 * @param {Array<{pageNum: number, text: string, charCount: number}>} pages
 * @param {number} maxCharsPerChunk - Maximum characters per chunk (default: 100,000)
 * @returns {Array<{startPage: number, endPage: number, text: string, charCount: number}>}
 */
export function createChunks(pages, maxCharsPerChunk = 100000) {
  const chunks = [];
  let currentChunk = {
    startPage: 1,
    endPage: 1,
    text: '',
    charCount: 0,
    pages: []
  };
  
  for (const page of pages) {
    // Check if adding this page would exceed the limit
    if (currentChunk.charCount + page.charCount > maxCharsPerChunk && currentChunk.pages.length > 0) {
      // Save current chunk and start a new one
      chunks.push({
        startPage: currentChunk.startPage,
        endPage: currentChunk.endPage,
        text: currentChunk.text,
        charCount: currentChunk.charCount
      });
      
      currentChunk = {
        startPage: page.pageNum,
        endPage: page.pageNum,
        text: page.text,
        charCount: page.charCount,
        pages: [page]
      };
    } else {
      // Add page to current chunk
      currentChunk.text += page.text;
      currentChunk.charCount += page.charCount;
      currentChunk.endPage = page.pageNum;
      currentChunk.pages.push(page);
    }
  }
  
  // Add the last chunk
  if (currentChunk.pages.length > 0) {
    chunks.push({
      startPage: currentChunk.startPage,
      endPage: currentChunk.endPage,
      text: currentChunk.text,
      charCount: currentChunk.charCount
    });
  }
  
  return chunks;
}

/**
 * Calculate optimal chunk size based on PDF size and token limits
 * @param {number} totalChars - Total characters in PDF
 * @param {number} maxTokens - Maximum tokens per API call
 * @returns {number} Recommended characters per chunk
 */
export function calculateOptimalChunkSize(totalChars, maxTokens = 100000) {
  // Rough estimate: 1 token ≈ 4 characters
  const maxCharsPerChunk = Math.floor(maxTokens * 4 * 0.8); // 80% safety margin
  
  // Ensure chunks are reasonable size (between 50k and 150k chars)
  return Math.max(50000, Math.min(maxCharsPerChunk, 150000));
}

/**
 * Get PDF metadata and statistics
 * @param {string} pdfPath - Path to PDF file
 * @returns {Promise<{totalPages: number, totalChars: number, estimatedTokens: number}>}
 */
export async function getPdfStats(pdfPath) {
  const pdfBuffer = await fsp.readFile(pdfPath);
  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getText();
  await parser.destroy();
  
  const totalChars = result.text.length;
  const estimatedTokens = Math.ceil(totalChars / 4); // Rough estimate
  
  return {
    totalPages: result.total,
    totalChars,
    estimatedTokens,
    avgCharsPerPage: Math.ceil(totalChars / result.total)
  };
}