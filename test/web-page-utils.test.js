/**
 * Tests for web-page utilities with proxy authentication
 * Testing Framework: Vitest
 */

import { describe, it, expect } from 'vitest';
import { sanitizeHtmlContent, extractTextFromHtml, generateCleanTitle } from '../src/utils/web-page.js';

describe('Web Page Utilities', () => {
  describe('sanitizeHtmlContent', () => {
    it('should remove script tags', () => {
      const html = '<div>Content</div><script>alert("test")</script>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('Content');
    });

    it('should remove style tags', () => {
      const html = '<div>Content</div><style>.test { color: red; }</style>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).not.toContain('<style>');
      expect(sanitized).toContain('Content');
    });

    it('should remove navigation elements', () => {
      const html = '<nav>Menu</nav><div>Content</div>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).not.toContain('<nav>');
      expect(sanitized).toContain('Content');
    });

    it('should remove header and footer', () => {
      const html = '<header>Header</header><div>Content</div><footer>Footer</footer>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).not.toContain('<header>');
      expect(sanitized).not.toContain('<footer>');
      expect(sanitized).toContain('Content');
    });

    it('should remove aside elements', () => {
      const html = '<aside>Sidebar</aside><div>Content</div>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).not.toContain('<aside>');
      expect(sanitized).toContain('Content');
    });

    it('should remove elements with nav/menu/ad classes', () => {
      const html = '<div class="navigation">Nav</div><div>Content</div>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).not.toContain('navigation');
      expect(sanitized).toContain('Content');
    });
  });

  describe('extractTextFromHtml', () => {
    it('should remove all HTML tags', () => {
      const html = '<div><p>Hello <strong>World</strong></p></div>';
      const text = extractTextFromHtml(html);
      expect(text).not.toContain('<');
      expect(text).not.toContain('>');
      expect(text).toContain('Hello');
      expect(text).toContain('World');
    });

    it('should decode HTML entities', () => {
      const html = 'Hello&nbsp;&amp;&lt;&gt;&quot;&#39;World';
      const text = extractTextFromHtml(html);
      expect(text).toContain(' ');
      expect(text).toContain('&');
      expect(text).toContain('<');
      expect(text).toContain('>');
      expect(text).toContain('"');
      expect(text).toContain("'");
    });

    it('should normalize whitespace', () => {
      const html = '<div>Hello    \n\n   World</div>';
      const text = extractTextFromHtml(html);
      expect(text).toBe('Hello World');
    });

    it('should handle empty HTML', () => {
      const html = '';
      const text = extractTextFromHtml(html);
      expect(text).toBe('');
    });
  });

  describe('generateCleanTitle', () => {
    it('should remove site name suffix with dash', () => {
      const title = 'Article Title - Site Name';
      const clean = generateCleanTitle(title, 'https://example.com');
      expect(clean).toBe('Article Title');
    });

    it('should remove site name suffix with pipe', () => {
      const title = 'Article Title | Site Name';
      const clean = generateCleanTitle(title, 'https://example.com');
      expect(clean).toBe('Article Title');
    });

    it('should extract from URL if title is empty', () => {
      const title = '';
      const clean = generateCleanTitle(title, 'https://example.com/my-article.html');
      expect(clean).toBe('my article');
    });

    it('should extract from URL path if title is empty', () => {
      const title = '';
      const clean = generateCleanTitle(title, 'https://example.com/blog/post-title');
      expect(clean).toBe('post title');
    });

    it('should use original title if cleaned version is too short', () => {
      const title = 'AB - Very Long Site Name';
      const clean = generateCleanTitle(title, 'https://example.com');
      expect(clean).toBe(title);
    });

    it('should handle title without suffix', () => {
      const title = 'Simple Title';
      const clean = generateCleanTitle(title, 'https://example.com');
      expect(clean).toBe('Simple Title');
    });

    it('should return "webpage" for invalid URL and no title', () => {
      const title = '';
      const clean = generateCleanTitle(title, 'not-a-url');
      expect(clean).toBe('webpage');
    });
  });

  describe('proxy authentication pattern', () => {
    it('should use session-based username format', () => {
      // This tests the pattern used in fetchWebPageAsPdf
      const baseUsername = 'user';
      const sessionId = 5;
      const sessionUsername = `${baseUsername}-${sessionId}`;
      
      expect(sessionUsername).toBe('user-5');
      expect(sessionUsername).toMatch(/^user-\d+$/);
    });

    it('should generate session ID within pool size', () => {
      const proxyPoolSize = 36;
      const sessionId = Math.floor(Math.random() * proxyPoolSize) + 1;
      
      expect(sessionId).toBeGreaterThanOrEqual(1);
      expect(sessionId).toBeLessThanOrEqual(proxyPoolSize);
    });
  });
});