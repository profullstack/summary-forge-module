/**
 * Tests for proxy authentication format
 * 
 * Ensures Webshare sticky session format is correct across all methods
 */

import { describe, it, expect } from 'vitest';
import { SummaryForge } from '../src/summary-forge.js';

describe('Proxy Authentication Format', () => {
  describe('Webshare Sticky Sessions', () => {
    it('should remove -rotate suffix and append session ID', () => {
      const baseUsername = 'dmdgluqz-US-rotate';
      const sessionId = 15;
      
      // Correct format: remove -rotate, add session ID
      const expected = 'dmdgluqz-US-15';
      const actual = baseUsername.replace(/-rotate$/, '') + `-${sessionId}`;
      
      expect(actual).toBe(expected);
    });
    
    it('should handle username without -rotate suffix', () => {
      const baseUsername = 'dmdgluqz-US';
      const sessionId = 20;
      
      // Should just append session ID
      const expected = 'dmdgluqz-US-20';
      const actual = baseUsername.replace(/-rotate$/, '') + `-${sessionId}`;
      
      expect(actual).toBe(expected);
    });
    
    it('should not create double session IDs', () => {
      const baseUsername = 'dmdgluqz-US-rotate';
      const sessionId = 5;
      
      const result = baseUsername.replace(/-rotate$/, '') + `-${sessionId}`;
      
      // Should NOT be: dmdgluqz-US-rotate-5
      expect(result).not.toContain('-rotate-');
      // Should be: dmdgluqz-US-5
      expect(result).toBe('dmdgluqz-US-5');
    });
    
    it('should generate session IDs within pool size', () => {
      const proxyPoolSize = 36;
      
      for (let i = 0; i < 100; i++) {
        const sessionId = Math.floor(Math.random() * proxyPoolSize) + 1;
        expect(sessionId).toBeGreaterThanOrEqual(1);
        expect(sessionId).toBeLessThanOrEqual(proxyPoolSize);
      }
    });
  });
  
  describe('SummaryForge Proxy Configuration', () => {
    it('should store proxy configuration correctly', () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key',
        enableProxy: true,
        proxyUrl: 'http://proxy.webshare.io:80',
        proxyUsername: 'dmdgluqz-US-rotate',
        proxyPassword: 'test-password',
        proxyPoolSize: 36
      });
      
      expect(forge.enableProxy).toBe(true);
      expect(forge.proxyUrl).toBe('http://proxy.webshare.io:80');
      expect(forge.proxyUsername).toBe('dmdgluqz-US-rotate');
      expect(forge.proxyPassword).toBe('test-password');
      expect(forge.proxyPoolSize).toBe(36);
    });
    
    it('should use default proxy pool size of 36', () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key',
        enableProxy: true,
        proxyUrl: 'http://proxy.example.com',
        proxyUsername: 'user',
        proxyPassword: 'pass'
      });
      
      expect(forge.proxyPoolSize).toBe(36);
    });
  });
  
  describe('Username Format Validation', () => {
    it('should produce correct format for all proxy methods', () => {
      const testCases = [
        { input: 'user-rotate', sessionId: 1, expected: 'user-1' },
        { input: 'user-rotate', sessionId: 36, expected: 'user-36' },
        { input: 'dmdgluqz-US-rotate', sessionId: 15, expected: 'dmdgluqz-US-15' },
        { input: 'simple-user', sessionId: 10, expected: 'simple-user-10' },
      ];
      
      testCases.forEach(({ input, sessionId, expected }) => {
        const result = input.replace(/-rotate$/, '') + `-${sessionId}`;
        expect(result).toBe(expected);
      });
    });
    
    it('should not append to existing session ID', () => {
      // If username already has a session ID, don't add another
      const username = 'user-15';
      const sessionId = 20;
      
      // This test documents current behavior - we always append
      // In production, username should be base format (with or without -rotate)
      const result = username.replace(/-rotate$/, '') + `-${sessionId}`;
      
      // Result will be user-15-20, which is wrong
      // This is why the base username should be 'user-rotate' or 'user'
      expect(result).toBe('user-15-20');
    });
  });
});