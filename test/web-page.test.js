/**
 * Tests for web page processing utilities
 * 
 * Testing Framework: Vitest (compatible with existing test setup)
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeHtmlContent,
  extractTextFromHtml,
  generateCleanTitle
} from '../src/utils/web-page.js';

describe('Web Page Utilities', () => {
  describe('sanitizeHtmlContent', () => {
    it('should remove script tags', () => {
      const html = '<div>Content</div><script>alert("test")</script>';
      const result = sanitizeHtmlContent(html);
      expect(result).not.toContain('<script>');
      expect(result).toContain('Content');
    });

    it('should remove style tags', () => {
      const html = '<div>Content</div><style>.test { color: red; }</style>';
      const result = sanitizeHtmlContent(html);
      expect(result).not.toContain('<style>');
      expect(result).toContain('Content');
    });

    it('should remove navigation elements', () => {
      const html = '<nav>Menu</nav><div>Content</div>';
      const result = sanitizeHtmlContent(html);
      expect(result).not.toContain('<nav>');
      expect(result).toContain('Content');
    });

    it('should remove header and footer elements', () => {
      const html = '<header>Header</header><div>Content</div><footer>Footer</footer>';
      const result = sanitizeHtmlContent(html);
      expect(result).not.toContain('<header>');
      expect(result).not.toContain('<footer>');
      expect(result).toContain('Content');
    });

    it('should remove aside elements', () => {
      const html = '<aside>Sidebar</aside><div>Content</div>';
      const result = sanitizeHtmlContent(html);
      expect(result).not.toContain('<aside>');
      expect(result).toContain('Content');
    });

    it('should remove elements with ad-related classes', () => {
      const html = '<div class="advertisement">Ad</div><div>Content</div>';
      const result = sanitizeHtmlContent(html);
      expect(result).not.toContain('advertisement');
      expect(result).toContain('Content');
    });

    it('should handle empty HTML', () => {
      const html = '';
      const result = sanitizeHtmlContent(html);
      expect(result).toBe('');
    });

    it('should preserve main content', () => {
      const html = `
        <nav>Navigation</nav>
        <header>Header</header>
        <main>
          <article>
            <h1>Title</h1>
            <p>Paragraph 1</p>
            <p>Paragraph 2</p>
          </article>
        </main>
        <footer>Footer</footer>
      `;
      const result = sanitizeHtmlContent(html);
      expect(result).toContain('<main>');
      expect(result).toContain('<article>');
      expect(result).toContain('Title');
      expect(result).toContain('Paragraph 1');
      expect(result).not.toContain('<nav>');
      expect(result).not.toContain('<footer>');
    });
  });

  describe('extractTextFromHtml', () => {
    it('should extract plain text from HTML', () => {
      const html = '<div><p>Hello <strong>World</strong></p></div>';
      const result = extractTextFromHtml(html);
      expect(result).toBe('Hello World');
    });

    it('should decode HTML entities', () => {
      const html = '<p>Hello&nbsp;World &amp; Friends</p>';
      const result = extractTextFromHtml(html);
      expect(result).toBe('Hello World & Friends');
    });

    it('should handle quotes and special characters', () => {
      const html = '<p>&quot;Hello&quot; &lt;World&gt;</p>';
      const result = extractTextFromHtml(html);
      expect(result).toBe('"Hello" <World>');
    });

    it('should normalize whitespace', () => {
      const html = '<p>Hello    \n\n   World</p>';
      const result = extractTextFromHtml(html);
      expect(result).toBe('Hello World');
    });

    it('should handle empty HTML', () => {
      const html = '';
      const result = extractTextFromHtml(html);
      expect(result).toBe('');
    });

    it('should handle HTML with only tags', () => {
      const html = '<div><span></span></div>';
      const result = extractTextFromHtml(html);
      expect(result).toBe('');
    });

    it('should handle mdash and ndash entities', () => {
      const html = '<p>Hello&mdash;World&ndash;Test</p>';
      const result = extractTextFromHtml(html);
      expect(result).toBe('Hello—World–Test');
    });
  });

  describe('generateCleanTitle', () => {
    it('should remove site name suffix with dash', () => {
      const title = 'Article Title - Site Name';
      const url = 'https://example.com/article';
      const result = generateCleanTitle(title, url);
      expect(result).toBe('Article Title');
    });

    it('should remove site name suffix with pipe', () => {
      const title = 'Article Title | Site Name';
      const url = 'https://example.com/article';
      const result = generateCleanTitle(title, url);
      expect(result).toBe('Article Title');
    });

    it('should keep original title if too short after cleaning', () => {
      const title = 'Hi - Site Name';
      const url = 'https://example.com/article';
      const result = generateCleanTitle(title, url);
      expect(result).toBe('Hi - Site Name');
    });

    it('should extract title from URL if no title provided', () => {
      const title = '';
      const url = 'https://example.com/my-article-title';
      const result = generateCleanTitle(title, url);
      expect(result).toBe('my article title');
    });

    it('should remove file extensions from URL-based titles', () => {
      const title = '';
      const url = 'https://example.com/article.html';
      const result = generateCleanTitle(title, url);
      expect(result).toBe('article');
    });

    it('should handle URLs with no path', () => {
      const title = '';
      const url = 'https://example.com';
      const result = generateCleanTitle(title, url);
      expect(result).toBe('webpage');
    });

    it('should replace hyphens and underscores with spaces in URL-based titles', () => {
      const title = '';
      const url = 'https://example.com/my-article_title';
      const result = generateCleanTitle(title, url);
      expect(result).toBe('my article title');
    });

    it('should handle invalid URLs gracefully', () => {
      const title = '';
      const url = 'not-a-valid-url';
      const result = generateCleanTitle(title, url);
      expect(result).toBe('webpage');
    });

    it('should preserve good titles without modification', () => {
      const title = 'Understanding JavaScript Closures';
      const url = 'https://example.com/article';
      const result = generateCleanTitle(title, url);
      expect(result).toBe('Understanding JavaScript Closures');
    });

    it('should handle titles with multiple separators', () => {
      const title = 'Article - Part 1 | Site Name';
      const url = 'https://example.com/article';
      const result = generateCleanTitle(title, url);
      expect(result).toBe('Article - Part 1');
    });
  });
});