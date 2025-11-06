/**
 * Tests for Directory Protection Utility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  directoryExists,
  checkDirectoryOverwrite,
  removeDirectory,
  ensureDirectory,
  getDirectoryContents
} from '../src/utils/directory-protection.js';

const TEST_DIR = path.join(process.cwd(), 'test-temp-dir-protection');

describe('Directory Protection', () => {
  beforeEach(async () => {
    // Clean up before each test
    try {
      await fsp.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await fsp.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
  });

  describe('directoryExists', () => {
    it('should return false for non-existent directory', async () => {
      const exists = await directoryExists(TEST_DIR);
      expect(exists).toBe(false);
    });

    it('should return true for existing directory', async () => {
      await fsp.mkdir(TEST_DIR, { recursive: true });
      const exists = await directoryExists(TEST_DIR);
      expect(exists).toBe(true);
    });

    it('should return false for a file (not directory)', async () => {
      const filePath = path.join(TEST_DIR, 'test.txt');
      await fsp.mkdir(TEST_DIR, { recursive: true });
      await fsp.writeFile(filePath, 'test');
      const exists = await directoryExists(filePath);
      expect(exists).toBe(false);
    });
  });

  describe('checkDirectoryOverwrite', () => {
    it('should allow creation of new directory', async () => {
      const result = await checkDirectoryOverwrite(TEST_DIR, false);
      expect(result.shouldProceed).toBe(true);
      expect(result.action).toBe('create');
    });

    it('should allow overwrite with force flag', async () => {
      await fsp.mkdir(TEST_DIR, { recursive: true });
      const result = await checkDirectoryOverwrite(TEST_DIR, true);
      expect(result.shouldProceed).toBe(true);
      expect(result.action).toBe('overwrite');
    });

    it('should throw error for existing directory without force or prompt', async () => {
      await fsp.mkdir(TEST_DIR, { recursive: true });
      await expect(checkDirectoryOverwrite(TEST_DIR, false)).rejects.toThrow(/already exists/);
    });

    it('should use prompt function when provided', async () => {
      await fsp.mkdir(TEST_DIR, { recursive: true });
      const promptFn = async () => 'overwrite';
      const result = await checkDirectoryOverwrite(TEST_DIR, false, promptFn);
      expect(result.shouldProceed).toBe(true);
      expect(result.action).toBe('overwrite');
    });

    it('should handle skip action from prompt', async () => {
      await fsp.mkdir(TEST_DIR, { recursive: true });
      const promptFn = async () => 'skip';
      const result = await checkDirectoryOverwrite(TEST_DIR, false, promptFn);
      expect(result.shouldProceed).toBe(false);
      expect(result.action).toBe('skip');
    });

    it('should throw error on cancel action from prompt', async () => {
      await fsp.mkdir(TEST_DIR, { recursive: true });
      const promptFn = async () => 'cancel';
      await expect(checkDirectoryOverwrite(TEST_DIR, false, promptFn)).rejects.toThrow(/cancelled/);
    });
  });

  describe('removeDirectory', () => {
    it('should remove existing directory', async () => {
      await fsp.mkdir(TEST_DIR, { recursive: true });
      await fsp.writeFile(path.join(TEST_DIR, 'test.txt'), 'test');
      
      await removeDirectory(TEST_DIR);
      
      const exists = await directoryExists(TEST_DIR);
      expect(exists).toBe(false);
    });

    it('should not throw error for non-existent directory', async () => {
      await expect(removeDirectory(TEST_DIR)).resolves.not.toThrow();
    });

    it('should remove nested directories', async () => {
      const nestedDir = path.join(TEST_DIR, 'nested', 'deep');
      await fsp.mkdir(nestedDir, { recursive: true });
      await fsp.writeFile(path.join(nestedDir, 'file.txt'), 'content');
      
      await removeDirectory(TEST_DIR);
      
      const exists = await directoryExists(TEST_DIR);
      expect(exists).toBe(false);
    });
  });

  describe('ensureDirectory', () => {
    it('should create new directory', async () => {
      const result = await ensureDirectory(TEST_DIR, false);
      
      expect(result.created).toBe(true);
      expect(result.overwritten).toBe(false);
      
      const exists = await directoryExists(TEST_DIR);
      expect(exists).toBe(true);
    });

    it('should overwrite existing directory with force flag', async () => {
      await fsp.mkdir(TEST_DIR, { recursive: true });
      await fsp.writeFile(path.join(TEST_DIR, 'old.txt'), 'old content');
      
      const result = await ensureDirectory(TEST_DIR, true);
      
      expect(result.created).toBe(true);
      expect(result.overwritten).toBe(true);
      
      const exists = await directoryExists(TEST_DIR);
      expect(exists).toBe(true);
      
      // Old file should be gone
      const files = await fsp.readdir(TEST_DIR);
      expect(files).toHaveLength(0);
    });

    it('should handle skip action', async () => {
      await fsp.mkdir(TEST_DIR, { recursive: true });
      const promptFn = async () => 'skip';
      
      const result = await ensureDirectory(TEST_DIR, false, promptFn);
      
      expect(result.created).toBe(false);
      expect(result.overwritten).toBe(false);
    });

    it('should create nested directories', async () => {
      const nestedDir = path.join(TEST_DIR, 'nested', 'deep');
      const result = await ensureDirectory(nestedDir, false);
      
      expect(result.created).toBe(true);
      const exists = await directoryExists(nestedDir);
      expect(exists).toBe(true);
    });
  });

  describe('getDirectoryContents', () => {
    it('should return empty array for non-existent directory', async () => {
      const contents = await getDirectoryContents(TEST_DIR);
      expect(contents).toEqual([]);
    });

    it('should return list of files in directory', async () => {
      await fsp.mkdir(TEST_DIR, { recursive: true });
      await fsp.writeFile(path.join(TEST_DIR, 'file1.txt'), 'content1');
      await fsp.writeFile(path.join(TEST_DIR, 'file2.txt'), 'content2');
      await fsp.mkdir(path.join(TEST_DIR, 'subdir'));
      
      const contents = await getDirectoryContents(TEST_DIR);
      
      expect(contents).toHaveLength(3);
      expect(contents).toContain('file1.txt');
      expect(contents).toContain('file2.txt');
      expect(contents).toContain('subdir');
    });

    it('should return empty array for empty directory', async () => {
      await fsp.mkdir(TEST_DIR, { recursive: true });
      const contents = await getDirectoryContents(TEST_DIR);
      expect(contents).toEqual([]);
    });
  });

  describe('Integration: Full workflow', () => {
    it('should handle complete directory protection workflow', async () => {
      // Step 1: Create directory
      const result1 = await ensureDirectory(TEST_DIR, false);
      expect(result1.created).toBe(true);
      expect(result1.overwritten).toBe(false);
      
      // Step 2: Add some files
      await fsp.writeFile(path.join(TEST_DIR, 'data.txt'), 'important data');
      const contents1 = await getDirectoryContents(TEST_DIR);
      expect(contents1).toHaveLength(1);
      
      // Step 3: Try to create again with force (should overwrite)
      const result2 = await ensureDirectory(TEST_DIR, true);
      expect(result2.created).toBe(true);
      expect(result2.overwritten).toBe(true);
      
      // Step 4: Verify old files are gone
      const contents2 = await getDirectoryContents(TEST_DIR);
      expect(contents2).toHaveLength(0);
    });

    it('should handle prompt-based workflow', async () => {
      // Create initial directory
      await ensureDirectory(TEST_DIR, false);
      await fsp.writeFile(path.join(TEST_DIR, 'existing.txt'), 'data');
      
      // Try to create again with prompt that returns overwrite
      const promptFn = async (dirPath) => {
        expect(dirPath).toBe(TEST_DIR);
        return 'overwrite';
      };
      
      const result = await ensureDirectory(TEST_DIR, false, promptFn);
      expect(result.created).toBe(true);
      expect(result.overwritten).toBe(true);
      
      const contents = await getDirectoryContents(TEST_DIR);
      expect(contents).toHaveLength(0);
    });
  });
});