/**
 * Markdown Stripping Tests
 * 
 * Tests that .txt files have markdown formatting properly stripped
 * 
 * Testing Framework: Vitest
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SummaryForge } from '../src/summary-forge.js';

describe('Markdown Stripping', () => {
  let forge;

  beforeEach(() => {
    forge = new SummaryForge({
      openaiApiKey: 'test-key'
    });
  });

  describe('stripMarkdown', () => {
    it('should remove headers', () => {
      const markdown = '# Header 1\n## Header 2\n### Header 3\nContent';
      const result = forge.stripMarkdown(markdown);
      
      expect(result).not.toContain('#');
      expect(result).toContain('Header 1');
      expect(result).toContain('Header 2');
      expect(result).toContain('Header 3');
      expect(result).toContain('Content');
    });

    it('should remove bold formatting', () => {
      const markdown = 'This is **bold** text';
      const result = forge.stripMarkdown(markdown);
      
      expect(result).not.toContain('**');
      expect(result).toContain('bold');
    });

    it('should remove italic formatting', () => {
      const markdown = 'This is *italic* text';
      const result = forge.stripMarkdown(markdown);
      
      expect(result).not.toContain('*');
      expect(result).toContain('italic');
    });

    it('should remove code blocks', () => {
      const markdown = 'Text\n```javascript\nconst x = 1;\n```\nMore text';
      const result = forge.stripMarkdown(markdown);
      
      expect(result).not.toContain('```');
      expect(result).not.toContain('const x = 1');
      expect(result).toContain('Text');
      expect(result).toContain('More text');
    });

    it('should remove inline code', () => {
      const markdown = 'Use `console.log()` for debugging';
      const result = forge.stripMarkdown(markdown);
      
      expect(result).not.toContain('`');
      expect(result).toContain('console.log()');
    });

    it('should remove links but keep text', () => {
      const markdown = 'Check out [this link](https://example.com)';
      const result = forge.stripMarkdown(markdown);
      
      expect(result).not.toContain('[');
      expect(result).not.toContain(']');
      expect(result).not.toContain('(https://');
      expect(result).toContain('this link');
    });

    it('should remove images', () => {
      const markdown = 'Here is an image: ![alt text](image.png)';
      const result = forge.stripMarkdown(markdown);
      
      expect(result).not.toContain('![');
      expect(result).not.toContain('](');
    });

    it('should remove horizontal rules', () => {
      const markdown = 'Text\n---\nMore text';
      const result = forge.stripMarkdown(markdown);
      
      expect(result).not.toContain('---');
      expect(result).toContain('Text');
      expect(result).toContain('More text');
    });

    it('should remove blockquotes', () => {
      const markdown = '> This is a quote\nNormal text';
      const result = forge.stripMarkdown(markdown);
      
      expect(result).not.toContain('>');
      expect(result).toContain('This is a quote');
    });

    it('should handle complex markdown', () => {
      const markdown = `
# Title

This is **bold** and *italic* text with \`code\`.

## Section

- List item 1
- List item 2

[Link](https://example.com)

\`\`\`javascript
const x = 1;
\`\`\`

> Quote

---

More text
      `;
      
      const result = forge.stripMarkdown(markdown);
      
      // Should not contain markdown syntax
      expect(result).not.toContain('#');
      expect(result).not.toContain('**');
      expect(result).not.toContain('*');
      expect(result).not.toContain('`');
      expect(result).not.toContain('[');
      expect(result).not.toContain('](');
      expect(result).not.toContain('---');
      expect(result).not.toContain('>');
      
      // Should contain the actual content
      expect(result).toContain('Title');
      expect(result).toContain('bold');
      expect(result).toContain('italic');
      expect(result).toContain('code');
      expect(result).toContain('Section');
      expect(result).toContain('Link');
      expect(result).toContain('Quote');
      expect(result).toContain('More text');
    });

    it('should clean up excessive whitespace', () => {
      const markdown = 'Text\n\n\n\n\nMore text';
      const result = forge.stripMarkdown(markdown);
      
      // Should have at most 2 consecutive newlines
      expect(result).not.toMatch(/\n{3,}/);
    });

    it('should trim leading and trailing whitespace', () => {
      const markdown = '   \n\n  Text  \n\n   ';
      const result = forge.stripMarkdown(markdown);
      
      expect(result).toBe('Text');
    });
  });
});