/**
 * Flashcard Images Generation Demo
 * 
 * Demonstrates how to generate individual PNG images for flashcards
 * suitable for web application integration.
 */

import { extractFlashcards, generateFlashcardImages } from '../src/flashcards.js';
import fs from 'node:fs/promises';
import path from 'node:path';

// Sample markdown content with Q&A pairs
const sampleMarkdown = `
# JavaScript Fundamentals

**Q: What is a closure in JavaScript?**
A: A closure is a function that has access to variables in its outer (enclosing) lexical scope, even after the outer function has returned.

**Q: What is the difference between let and var?**
A: let has block scope while var has function scope. let also doesn't allow redeclaration in the same scope.

**Q: What is the event loop?**
A: The event loop is a mechanism that handles asynchronous operations in JavaScript by continuously checking the call stack and callback queue.

**Q: What are promises?**
A: Promises are objects representing the eventual completion or failure of an asynchronous operation, providing a cleaner alternative to callbacks.

**Q: What is async/await?**
A: async/await is syntactic sugar built on top of promises that makes asynchronous code look and behave more like synchronous code.
`;

async function demo() {
  console.log('🎴 Flashcard Images Generation Demo\n');

  try {
    // Step 1: Extract flashcards from markdown
    console.log('📝 Extracting flashcards from markdown...');
    const extractResult = extractFlashcards(sampleMarkdown);
    
    if (!extractResult.success) {
      console.error('❌ Failed to extract flashcards:', extractResult.error);
      return;
    }
    
    console.log(`✅ Extracted ${extractResult.count} flashcards\n`);

    // Step 2: Generate individual PNG images
    console.log('🖼️  Generating flashcard images...');
    const outputDir = './examples/output/flashcard-images';
    
    const imageResult = await generateFlashcardImages(
      extractResult.flashcards,
      outputDir,
      {
        title: 'JavaScript Fundamentals',
        branding: 'SummaryForge.com',
        width: 800,
        height: 600,
        fontSize: 24
      }
    );

    if (!imageResult.success) {
      console.error('❌ Failed to generate images:', imageResult.error);
      return;
    }

    console.log(`✅ Generated ${imageResult.images.length} images`);
    console.log(`📁 Output directory: ${imageResult.outputDir}\n`);

    // Step 3: List generated files
    console.log('📋 Generated files:');
    for (const imagePath of imageResult.images) {
      const filename = path.basename(imagePath);
      const stats = await fs.stat(imagePath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`   ${filename} (${sizeKB} KB)`);
    }

    console.log('\n✨ Demo completed successfully!');
    console.log('\n💡 Usage in web applications:');
    console.log('   - Use q-001.png, q-002.png, etc. for question cards');
    console.log('   - Use a-001.png, a-002.png, etc. for answer cards');
    console.log('   - Display inline with <img> tags or as background images');
    console.log('   - Perfect for flashcard study apps, quizzes, and learning platforms');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.error(error.stack);
  }
}

// Run the demo
demo();