/**
 * Flashcards Demo
 * 
 * Demonstrates how to generate printable flashcards from markdown content
 */

import { extractFlashcards, generateFlashcardsPDF } from '../src/flashcards.js';

// Example markdown with Q&A content
const sampleMarkdown = `
# JavaScript Fundamentals

## Core Concepts

**Q: What is a closure in JavaScript?**
A: A closure is a function that has access to variables in its outer (enclosing) lexical scope, even after the outer function has returned.

**Q: What is the difference between let and var?**
A: let is block-scoped while var is function-scoped. let also doesn't allow redeclaration in the same scope.

**Q: What is the event loop?**
A: The event loop is a mechanism that handles asynchronous operations in JavaScript by continuously checking the call stack and callback queue.

## Key Terms

**Hoisting**
: The behavior where variable and function declarations are moved to the top of their scope during compilation.

**Promise**
: An object representing the eventual completion or failure of an asynchronous operation.

**Async/Await**
: Syntactic sugar built on top of Promises that makes asynchronous code look and behave more like synchronous code.

### What is destructuring?

Destructuring is a JavaScript expression that allows you to extract values from arrays or properties from objects into distinct variables.

### Why use arrow functions?

Arrow functions provide a shorter syntax and lexically bind the 'this' value, making them ideal for callbacks and functional programming patterns.
`;

async function demo() {
  console.log('🃏 Flashcards Demo\n');
  
  // Extract flashcards from markdown
  console.log('📚 Extracting flashcards from markdown...');
  const flashcards = extractFlashcards(sampleMarkdown);
  
  console.log(`✅ Extracted ${flashcards.length} flashcards:\n`);
  flashcards.forEach((card, index) => {
    console.log(`${index + 1}. Q: ${card.question}`);
    console.log(`   A: ${card.answer.substring(0, 60)}${card.answer.length > 60 ? '...' : ''}\n`);
  });
  
  // Generate PDF
  console.log('📄 Generating printable flashcards PDF...');
  const outputPath = './flashcards-demo.pdf';
  
  await generateFlashcardsPDF(flashcards, outputPath, {
    title: 'JavaScript Fundamentals',
    branding: 'SummaryForge.com'
  });
  
  console.log(`✅ Generated: ${outputPath}`);
  console.log('\n📋 Printing Instructions:');
  console.log('1. Open the PDF and print using double-sided (duplex) printing');
  console.log('2. Select "Flip on Long Edge" or "Long-Edge Binding"');
  console.log('3. Cut along the gray guide lines');
  console.log('4. Each card will have the question on front, answer on back\n');
}

demo().catch(console.error);