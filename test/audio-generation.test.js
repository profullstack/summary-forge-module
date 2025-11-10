/**
 * Audio Generation Tests
 * 
 * Tests that audio generation properly handles JSON responses
 * and correctly processes script objects vs strings.
 * 
 * Testing Framework: Vitest
 */

import { describe, it, expect } from 'vitest';
import { SummaryForge } from '../src/summary-forge.js';

describe('Audio Generation', () => {
  describe('generateAudioScript() return format', () => {
    it('should return JSON object with success and script properties', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const markdown = '# Test\n\nThis is a test summary with some content.';
      const result = await forge.generateAudioScript(markdown);
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('script');
      expect(result).toHaveProperty('length');
      expect(typeof result.script).toBe('string');
      expect(typeof result.length).toBe('number');
    });

    it('should return script as string, not object', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const markdown = '# Test Summary\n\nKey concepts:\n- Concept 1\n- Concept 2';
      const result = await forge.generateAudioScript(markdown);
      
      expect(result.success).toBe(true);
      expect(typeof result.script).toBe('string');
      expect(result.script.length).toBeGreaterThan(0);
      expect(result.length).toBe(result.script.length);
    });

    it('should handle fallback when AI generation fails', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'invalid-key-will-fail'
      });
      
      const markdown = '# Test\n\nContent here.';
      const result = await forge.generateAudioScript(markdown);
      
      // Should still return success with fallback
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('script');
      expect(typeof result.script).toBe('string');
    });
  });

  describe('generateAudio() return format', () => {
    it('should return JSON object when ElevenLabs is not configured', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
        // No elevenlabsApiKey
      });
      
      const result = await forge.generateAudio('Test script', '/tmp/test.mp3');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toContain('ElevenLabs API key not provided');
      expect(result.path).toBeNull();
      expect(result.size).toBe(0);
    });

    it('should accept string input for text parameter', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
        // No elevenlabsApiKey - will skip generation
      });
      
      // This should not throw an error
      const result = await forge.generateAudio('This is a test script', '/tmp/test.mp3');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false); // Because no API key
    });

    it('should handle object input gracefully', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      // If accidentally passed an object, it should handle it
      const scriptObject = { script: 'test' };
      const result = await forge.generateAudio(scriptObject, '/tmp/test.mp3');
      
      expect(result).toBeDefined();
      // Should fail gracefully, not crash
    });
  });

  describe('generateOutputFiles() integration', () => {
    it('should properly extract script from generateAudioScript result', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const markdown = '# Test\n\nContent';
      const scriptResult = await forge.generateAudioScript(markdown);
      
      // Verify the pattern used in generateOutputFiles
      expect(scriptResult.success).toBe(true);
      expect(scriptResult.script).toBeDefined();
      expect(typeof scriptResult.script).toBe('string');
      
      // This is how generateOutputFiles should access it
      const scriptText = scriptResult.script;
      expect(typeof scriptText).toBe('string');
    });

    it('should handle audio generation when ElevenLabs is configured', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123',
        elevenlabsApiKey: 'test-elevenlabs-key'
      });
      
      // Verify ElevenLabs client is initialized
      expect(forge.elevenlabs).toBeDefined();
    });

    it('should skip audio generation when ElevenLabs is not configured', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
        // No elevenlabsApiKey
      });
      
      expect(forge.elevenlabs).toBeUndefined();
      
      // generateAudio should return error
      const result = await forge.generateAudio('test', '/tmp/test.mp3');
      expect(result.success).toBe(false);
      expect(result.path).toBeNull();
    });
  });

  describe('Text sanitization for audio', () => {
    it('should remove code blocks from text', () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const text = 'Some text\n```javascript\nconst x = 1;\n```\nMore text';
      const sanitized = forge.sanitizeTextForAudio(text);
      
      expect(sanitized).not.toContain('```');
      expect(sanitized).not.toContain('const x = 1');
      expect(sanitized).toContain('[Code example omitted]');
    });

    it('should remove markdown formatting', () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const text = '# Header\n\n**Bold** and *italic* and `code`';
      const sanitized = forge.sanitizeTextForAudio(text);
      
      expect(sanitized).not.toContain('#');
      expect(sanitized).not.toContain('**');
      expect(sanitized).not.toContain('*');
      expect(sanitized).not.toContain('`');
    });

    it('should preserve actual content while removing formatting', () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const text = '**Important concept**: This is the explanation.';
      const sanitized = forge.sanitizeTextForAudio(text);
      
      expect(sanitized).toContain('Important concept');
      expect(sanitized).toContain('This is the explanation');
    });
  });

  describe('Text chunking for ElevenLabs', () => {
    it('should chunk text into manageable pieces', () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const longText = 'Sentence one. Sentence two. Sentence three. '.repeat(1000);
      const chunks = forge.chunkText(longText, 8000);
      
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(8000);
      });
    });

    it('should not lose content when chunking', () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const text = 'First. Second. Third. Fourth. Fifth.';
      const chunks = forge.chunkText(text, 20);
      
      const recombined = chunks.join(' ');
      expect(recombined).toContain('First');
      expect(recombined).toContain('Second');
      expect(recombined).toContain('Third');
      expect(recombined).toContain('Fourth');
      expect(recombined).toContain('Fifth');
    });

    it('should handle single sentence longer than chunk size', () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const longSentence = 'A'.repeat(10000);
      const chunks = forge.chunkText(longSentence, 8000);
      
      expect(chunks.length).toBeGreaterThan(0);
      // Should still create chunks even if sentence is too long
    });
  });

  describe('OpenAI files API', () => {
    it('should use correct delete method', () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      // Verify the OpenAI client has the delete method
      expect(forge.openai.files).toBeDefined();
      expect(forge.openai.files.delete).toBeDefined();
      expect(typeof forge.openai.files.delete).toBe('function');
    });
  });
});