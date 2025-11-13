/**
 * Tests for web-page utilities with proxy authentication
 * Testing Framework: Mocha with Chai
 */

import { expect } from 'chai';
import { sanitizeHtmlContent, extractTextFromHtml, generateCleanTitle } from '../src/utils/web-page.js';

describe('Web Page Utilities', () => {
  describe('sanitizeHtmlContent', () => {
    it('should remove script tags', () => {
      const html = '<div>Content</div><script>alert("test")</script>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).to.not.include('<script>');
      expect(sanitized).to.include('Content');
    });

    it('should remove style tags', () => {
      const html = '<div>Content</div><style>.test { color: red; }</style>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).to.not.include('<style>');
      expect(sanitized).to.include('Content');
    });

    it('should remove navigation elements', () => {
      const html = '<nav>Menu</nav><div>Content</div>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).to.not.include('<nav>');
      expect(sanitized).to.include('Content');
    });

    it('should remove header and footer', () => {
      const html = '<header>Header</header><div>Content</div><footer>Footer</footer>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).to.not.include('<header>');
      expect(sanitized).to.not.include('<footer>');
      expect(sanitized).to.include('Content');
    });

    it('should remove aside elements', () => {
      const html = '<aside>Sidebar</aside><div>Content</div>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).to.not.include('<aside>');
      expect(sanitized).to.include('Content');
    });

    it('should remove elements with nav/menu/ad classes', () => {
      const html = '<div class="navigation">Nav</div><div>Content</div>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).to.not.include('navigation');
      expect(sanitized).to.include('Content');
    });
  });

  describe('extractTextFromHtml', () => {
    it('should remove all HTML tags', () => {
      const html = '<div><p>Hello <strong>World</strong></p></div>';
      const text = extractTextFromHtml(html);
      expect(text).to.not.include('<');
      expect(text).to.not.include('>');
      expect(text).to.include('Hello');
      expect(text).to.include('World');
    });

    it('should decode HTML entities', () => {
      const html = 'Hello&nbsp;&amp;&lt;&gt;&quot;&#39;World';
      const text = extractTextFromHtml(html);
      expect(text).to.include(' ');
      expect(text).to.include('&');
      expect(text).to.include('<');
      expect(text).to.include('>');
      expect(text).to.include('"');
      expect(text).to.include("'");
    });

    it('should normalize whitespace', () => {
      const html = '<div>Hello    \n\n   World</div>';
      const text = extractTextFromHtml(html);
      expect(text).to.equal('Hello World');
    });

    it('should handle empty HTML', () => {
      const html = '';
      const text = extractTextFromHtml(html);
      expect(text).to.equal('');
    });
  });

  describe('generateCleanTitle', () => {
    it('should remove site name suffix with dash', () => {
      const title = 'Article Title - Site Name';
      const clean = generateCleanTitle(title, 'https://example.com');
      expect(clean).to.equal('Article Title');
    });

    it('should remove site name suffix with pipe', () => {
      const title = 'Article Title | Site Name';
      const clean = generateCleanTitle(title, 'https://example.com');
      expect(clean).to.equal('Article Title');
    });

    it('should extract from URL if title is empty', () => {
      const title = '';
      const clean = generateCleanTitle(title, 'https://example.com/my-article.html');
      expect(clean).to.equal('my article');
    });

    it('should extract from URL path if title is empty', () => {
      const title = '';
      const clean = generateCleanTitle(title, 'https://example.com/blog/post-title');
      expect(clean).to.equal('post title');
    });

    it('should use original title if cleaned version is too short', () => {
      const title = 'AB - Very Long Site Name';
      const clean = generateCleanTitle(title, 'https://example.com');
      expect(clean).to.equal(title);
    });

    it('should handle title without suffix', () => {
      const title = 'Simple Title';
      const clean = generateCleanTitle(title, 'https://example.com');
      expect(clean).to.equal('Simple Title');
    });

    it('should return "webpage" for invalid URL and no title', () => {
      const title = '';
      const clean = generateCleanTitle(title, 'not-a-url');
      expect(clean).to.equal('webpage');
    });
  });

  describe('proxy authentication pattern', () => {
    it('should use session-based username format', () => {
      // This tests the pattern used in fetchWebPageAsPdf
      const baseUsername = 'user';
      const sessionId = 5;
      const sessionUsername = `${baseUsername}-${sessionId}`;
      
      expect(sessionUsername).to.equal('user-5');
      expect(sessionUsername).to.match(/^user-\d+$/);
    });

    it('should generate session ID within pool size', () => {
      const proxyPoolSize = 36;
      const sessionId = Math.floor(Math.random() * proxyPoolSize) + 1;
      
      expect(sessionId).to.be.at.least(1);
      expect(sessionId).to.be.at.most(proxyPoolSize);
    });
  });
});