/**
 * PDF Chunker Utility
 * 
 * Handles chunking of large PDFs for processing with OpenAI APIs
 */

import PDFParse from 'pdf-parse';
import fsp from 'node:fs/promises';

/**
 * Extract text from PDF with page-level granularity
 * @param {string} pdfPath - Path to PDF file
 * @returns {Promise<Array<{pageNum: number, text: string}>>}
 */
export async function extractPdfPages(pdfPath) {
  const pdfBuffer = await fsp.readFile(pdfPath);
  const result = await PDFParse(pdfBuffer);
  
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
 * @param {number} maxInputTokens - Maximum input tokens per API call (default: 250000 for GPT-5 with overhead buffer)
 * @returns {number} Recommended characters per chunk
 */
export function calculateOptimalChunkSize(totalChars, maxInputTokens = 250000) {
  // Reserve tokens for system prompts, instructions, and response overhead
  const SYSTEM_OVERHEAD_TOKENS = 20000;
  const availableTokens = maxInputTokens - SYSTEM_OVERHEAD_TOKENS;
  
  // Conservative estimate: 1 token ≈ 3.5 characters (safer than 4)
  // Use 70% safety margin to account for token estimation variance
  const CHARS_PER_TOKEN = 3.5;
  const SAFETY_MARGIN = 0.70;
  
  const maxCharsPerChunk = Math.floor(availableTokens * CHARS_PER_TOKEN * SAFETY_MARGIN);
  
  // Ensure chunks are reasonable size (between 50k and maxCharsPerChunk)
  // Remove upper limit cap to allow larger chunks when needed
  return Math.max(50000, maxCharsPerChunk);
}

/**
 * Get PDF metadata and statistics
 * @param {string} pdfPath - Path to PDF file
 * @returns {Promise<{totalPages: number, totalChars: number, estimatedTokens: number}>}
 */
export async function getPdfStats(pdfPath) {
  const pdfBuffer = await fsp.readFile(pdfPath);
  const result = await PDFParse(pdfBuffer);
  
  const totalChars = result.text.length;
  const estimatedTokens = Math.ceil(totalChars / 4); // Rough estimate
  
  return {
    totalPages: result.total,
    totalChars,
    estimatedTokens,
    avgCharsPerPage: Math.ceil(totalChars / result.total)
  };
}