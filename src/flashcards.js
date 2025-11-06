/**
 * Flashcards Generator Module
 * 
 * Extracts Q&A pairs from markdown summaries and generates printable flashcard PDFs
 * designed for double-sided printing.
 */

import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Extract flashcards from markdown content
 * 
 * Supports multiple formats:
 * 1. Explicit Q&A format: **Q: question?** followed by A: answer
 * 2. Definition lists: **Term** followed by : definition
 * 3. Question headers: ### Question? followed by answer paragraph
 * 
 * @param {string} markdown - The markdown content to extract from
 * @param {Object} options - Extraction options
 * @param {number} options.maxCards - Maximum number of cards to extract (default: 100)
 * @returns {Array<{question: string, answer: string}>} Array of flashcard objects
 */
export function extractFlashcards(markdown, options = {}) {
  const { maxCards = 100 } = options;
  const flashcards = [];

  if (!markdown || typeof markdown !== 'string') {
    return flashcards;
  }

  // Pattern 1: Explicit Q&A format
  // **Q: What is X?**
  // A: X is...
  const qaPattern = /\*\*Q:\s*(.+?\?)\*\*\s*\n\s*A:\s*(.+?)(?=\n\n|\n\*\*Q:|$)/gs;
  let match;
  
  while ((match = qaPattern.exec(markdown)) !== null && flashcards.length < maxCards) {
    const question = cleanMarkdown(match[1].trim());
    const answer = cleanMarkdown(match[2].trim());
    
    if (question && answer) {
      flashcards.push({ question, answer });
    }
  }

  // Pattern 2: Definition lists
  // **Term**
  // : Definition
  const defPattern = /\*\*([^*\n]+?)\*\*\s*\n\s*:\s*(.+?)(?=\n\n|\n\*\*|$)/gs;
  
  while ((match = defPattern.exec(markdown)) !== null && flashcards.length < maxCards) {
    const term = cleanMarkdown(match[1].trim());
    const definition = cleanMarkdown(match[2].trim());
    
    // Skip if term contains Q&A markers or is too long
    if (term && definition &&
        !term.includes('Q:') &&
        !term.includes('A:') &&
        term.length < 100 &&
        definition.length > 10 &&
        definition.length < 500 &&
        !flashcards.some(fc => fc.question.includes(term))) {
      flashcards.push({
        question: `What is ${term}?`,
        answer: definition
      });
    }
  }

  // Pattern 3: Question headers (### What is...?)
  const headerPattern = /^#{2,4}\s+([^#\n]+?\?)\s*\n+([^\n#]+?)(?=\n#{1,4}|\n\n|$)/gms;
  
  while ((match = headerPattern.exec(markdown)) !== null && flashcards.length < maxCards) {
    const question = cleanMarkdown(match[1].trim());
    const answer = cleanMarkdown(match[2].trim());
    
    if (question && answer &&
        answer.length > 10 &&
        answer.length < 500 &&
        !flashcards.some(fc => fc.question === question)) {
      flashcards.push({ question, answer });
    }
  }

  return flashcards.slice(0, maxCards);
}

/**
 * Clean markdown formatting from text
 * 
 * @param {string} text - Text with markdown formatting
 * @returns {string} Cleaned text
 */
function cleanMarkdown(text) {
  return text
    // Remove bold/italic
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Remove inline code
    .replace(/`(.+?)`/g, '$1')
    // Remove links but keep text
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate a printable flashcards PDF
 * 
 * Creates a PDF optimized for double-sided printing where:
 * - Odd pages (1, 3, 5...) contain questions
 * - Even pages (2, 4, 6...) contain answers
 * - When printed double-sided and cut, each card has Q on front, A on back
 * 
 * @param {Array<{question: string, answer: string}>} flashcards - Array of flashcard objects
 * @param {string} outputPath - Path where PDF should be saved
 * @param {Object} options - PDF generation options
 * @param {string} options.title - Title for the flashcard set
 * @param {string} options.branding - Branding text (e.g., "SummaryForge.com")
 * @param {number} options.cardWidth - Card width in inches (default: 3.5)
 * @param {number} options.cardHeight - Card height in inches (default: 2.5)
 * @param {number} options.fontSize - Base font size (default: 11)
 * @param {string} options.fontFamily - Font family (default: 'Helvetica')
 * @returns {Promise<string>} Path to generated PDF
 */
export async function generateFlashcardsPDF(flashcards, outputPath, options = {}) {
  if (!flashcards || flashcards.length === 0) {
    throw new Error('No flashcards to generate');
  }

  const {
    title = 'Flashcards',
    branding = 'SummaryForge.com',
    cardWidth = 3.5,  // inches
    cardHeight = 2.5, // inches
    fontSize = 11,
    fontFamily = 'Helvetica'
  } = options;

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  await fsp.mkdir(outputDir, { recursive: true });

  // Convert inches to points (72 points per inch)
  const cardWidthPt = cardWidth * 72;
  const cardHeightPt = cardHeight * 72;
  
  // Standard letter size: 8.5 x 11 inches
  const pageWidth = 8.5 * 72;
  const pageHeight = 11 * 72;
  
  // Calculate cards per page (2x2 grid)
  const cardsPerRow = 2;
  const cardsPerCol = 3;
  const cardsPerPage = cardsPerRow * cardsPerCol;
  
  // Calculate margins to center cards
  const marginX = (pageWidth - (cardsPerRow * cardWidthPt)) / 2;
  const marginY = (pageHeight - (cardsPerCol * cardHeightPt)) / 2;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 0,
        info: {
          Title: title,
          Author: branding,
          Subject: 'Study Flashcards',
          Keywords: 'flashcards, study, learning'
        }
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Helper function to draw a card
      const drawCard = (x, y, text, isQuestion, cardNumber) => {
        const padding = 15;
        const contentWidth = cardWidthPt - (padding * 2);
        const contentHeight = cardHeightPt - (padding * 2);

        // Draw card border
        doc.rect(x, y, cardWidthPt, cardHeightPt).stroke('#cccccc');

        // Draw subtle corner guides for cutting
        const guideLength = 10;
        doc.strokeColor('#dddddd').lineWidth(0.5);
        // Top-left
        doc.moveTo(x, y + guideLength).lineTo(x, y).lineTo(x + guideLength, y).stroke();
        // Top-right
        doc.moveTo(x + cardWidthPt - guideLength, y).lineTo(x + cardWidthPt, y).lineTo(x + cardWidthPt, y + guideLength).stroke();
        // Bottom-left
        doc.moveTo(x, y + cardHeightPt - guideLength).lineTo(x, y + cardHeightPt).lineTo(x + guideLength, y + cardHeightPt).stroke();
        // Bottom-right
        doc.moveTo(x + cardWidthPt - guideLength, y + cardHeightPt).lineTo(x + cardWidthPt, y + cardHeightPt).lineTo(x + cardWidthPt, y + cardHeightPt - guideLength).stroke();

        // Reset stroke color
        doc.strokeColor('#000000').lineWidth(1);

        // Add label (Q or A) in top-left corner
        doc.fontSize(8)
           .fillColor('#666666')
           .font(`${fontFamily}-Bold`)
           .text(isQuestion ? 'Q' : 'A', x + padding, y + padding, {
             width: 20,
             align: 'left'
           });

        // Add card number in top-right corner
        doc.fontSize(7)
           .fillColor('#999999')
           .font(fontFamily)
           .text(`#${cardNumber}`, x + cardWidthPt - padding - 20, y + padding, {
             width: 20,
             align: 'right'
           });

        // Add main text (centered vertically)
        doc.fontSize(fontSize)
           .fillColor('#000000')
           .font(fontFamily);

        const textHeight = doc.heightOfString(text, {
          width: contentWidth,
          align: 'left'
        });

        const textY = y + padding + 20 + ((contentHeight - 40) - textHeight) / 2;

        doc.text(text, x + padding, textY, {
          width: contentWidth,
          align: 'left',
          lineGap: 2
        });

        // Add subtle branding at bottom
        doc.fontSize(6)
           .fillColor('#cccccc')
           .font(`${fontFamily}-Oblique`)
           .text(branding, x + padding, y + cardHeightPt - padding - 10, {
             width: contentWidth,
             align: 'center'
           });
      };

      // Generate question pages
      let pageCount = 0;
      for (let i = 0; i < flashcards.length; i += cardsPerPage) {
        if (pageCount > 0) doc.addPage();
        pageCount++;

        // Draw up to cardsPerPage questions
        for (let j = 0; j < cardsPerPage && (i + j) < flashcards.length; j++) {
          const row = Math.floor(j / cardsPerRow);
          const col = j % cardsPerRow;
          const x = marginX + (col * cardWidthPt);
          const y = marginY + (row * cardHeightPt);
          
          drawCard(x, y, flashcards[i + j].question, true, i + j + 1);
        }

        // Add page number
        doc.fontSize(8)
           .fillColor('#999999')
           .text(`Page ${pageCount} (Questions)`, 0, pageHeight - 30, {
             width: pageWidth,
             align: 'center'
           });
      }

      // Generate answer pages (in reverse order for proper double-sided printing)
      for (let i = 0; i < flashcards.length; i += cardsPerPage) {
        doc.addPage();
        pageCount++;

        // Draw answers in reverse column order for proper alignment when printed
        for (let j = 0; j < cardsPerPage && (i + j) < flashcards.length; j++) {
          const row = Math.floor(j / cardsPerRow);
          const col = (cardsPerRow - 1) - (j % cardsPerRow); // Reverse column order
          const x = marginX + (col * cardWidthPt);
          const y = marginY + (row * cardHeightPt);
          
          drawCard(x, y, flashcards[i + j].answer, false, i + j + 1);
        }

        // Add page number
        doc.fontSize(8)
           .fillColor('#999999')
           .text(`Page ${pageCount} (Answers)`, 0, pageHeight - 30, {
             width: pageWidth,
             align: 'center'
           });
      }

      // Add instructions page at the end
      doc.addPage();
      doc.fontSize(16)
         .fillColor('#000000')
         .font(`${fontFamily}-Bold`)
         .text('Printing Instructions', 72, 100, { align: 'center' });

      doc.fontSize(12)
         .font(fontFamily)
         .text([
           '',
           '1. Print this PDF using double-sided (duplex) printing',
           '   - Select "Flip on Long Edge" or "Long-Edge Binding"',
           '',
           '2. After printing, cut along the gray guide lines',
           '   - You should get 6 cards per sheet',
           '',
           '3. Each card will have:',
           '   - Question on the front (marked with "Q")',
           '   - Answer on the back (marked with "A")',
           '',
           `4. Total flashcards: ${flashcards.length}`,
           '',
           '',
           'Tips for best results:',
           '• Use heavier paper (cardstock) for durability',
           '• Print in color for better visual appeal',
           '• Laminate cards for long-term use',
           '',
           '',
           `Generated by ${branding}`,
           new Date().toLocaleDateString()
         ].join('\n'), 72, 150, {
           width: pageWidth - 144,
           align: 'left',
           lineGap: 4
         });

      doc.end();

      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}