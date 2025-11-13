/**
 * Test that tarball includes flashcards subdirectory
 * 
 * Verifies that when creating a .tgz bundle, the entire directory
 * including the flashcards subdirectory is included.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Tarball Creation with Flashcards Directory', () => {
  const testDir = path.resolve('./test-tarball-output');
  const bookDir = path.join(testDir, 'test_book_12345');
  const flashcardsDir = path.join(bookDir, 'flashcards');
  const archiveName = path.join(bookDir, 'test_book_12345_bundle.tgz'); // Archive inside the directory (will be excluded)
  const extractDir = path.join(testDir, 'extracted');

  beforeEach(async () => {
    // Clean up any existing test directory
    await fs.rm(testDir, { recursive: true, force: true });
    
    // Create test directory structure (including parent for archive)
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(flashcardsDir, { recursive: true });
    
    // Create some test files
    await fs.writeFile(path.join(bookDir, 'test.summary.md'), '# Test Summary\n\nTest content');
    await fs.writeFile(path.join(bookDir, 'test.summary.txt'), 'Test content');
    await fs.writeFile(path.join(bookDir, 'test.pdf'), 'fake pdf content');
    
    // Create flashcard images
    await fs.writeFile(path.join(flashcardsDir, 'q-001.png'), 'fake image 1');
    await fs.writeFile(path.join(flashcardsDir, 'a-001.png'), 'fake image 2');
    await fs.writeFile(path.join(flashcardsDir, 'q-002.png'), 'fake image 3');
    await fs.writeFile(path.join(flashcardsDir, 'a-002.png'), 'fake image 4');
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  /**
   * Helper function to execute shell command
   */
  const execCommand = (cmd, args, options = {}) => {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { ...options, stdio: 'pipe' });
      let stdout = '';
      let stderr = '';
      
      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('close', (code) => {
        // Exit code 0 = success
        // Exit code 1 with "file changed as we read it" = success (tar created the archive but warns about the .tgz file being created)
        if (code === 0 || (code === 1 && stderr.includes('file changed as we read it'))) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });
    });
  };

  it('should create tarball that includes flashcards subdirectory', async () => {
    // Create tarball using the same approach as the code
    // Tar from parent directory to include the directory name itself
    const parentDir = path.dirname(bookDir);
    const dirName = path.basename(bookDir);
    
    await execCommand('tar', [
      '-czf',
      archiveName,
      '--exclude',
      `${dirName}/${path.basename(archiveName)}`, // Exclude the bundle file itself
      dirName // Archive the directory (includes directory name in tarball)
    ], { cwd: parentDir });
    
    // Verify tarball was created
    const archiveExists = await fs.access(archiveName)
      .then(() => true)
      .catch(() => false);
    
    expect(archiveExists).toBe(true);
    
    // Extract tarball to verify contents
    await fs.mkdir(extractDir, { recursive: true });
    await execCommand('tar', ['-xzf', archiveName], { cwd: extractDir });
    
    // Verify extracted structure (directory name is preserved in tarball)
    const extractedBookDir = path.join(extractDir, dirName);
    const extractedFlashcardsDir = path.join(extractedBookDir, 'flashcards');
    
    // Check that main files exist
    const summaryMdExists = await fs.access(path.join(extractedBookDir, 'test.summary.md'))
      .then(() => true)
      .catch(() => false);
    expect(summaryMdExists).toBe(true);
    
    const summaryTxtExists = await fs.access(path.join(extractedBookDir, 'test.summary.txt'))
      .then(() => true)
      .catch(() => false);
    expect(summaryTxtExists).toBe(true);
    
    const pdfExists = await fs.access(path.join(extractedBookDir, 'test.pdf'))
      .then(() => true)
      .catch(() => false);
    expect(pdfExists).toBe(true);
    
    // Check that flashcards directory exists
    const flashcardsDirExists = await fs.access(extractedFlashcardsDir)
      .then(() => true)
      .catch(() => false);
    expect(flashcardsDirExists).toBe(true);
    
    // Check that flashcard images exist
    const flashcardFiles = await fs.readdir(extractedFlashcardsDir);
    expect(flashcardFiles).toContain('q-001.png');
    expect(flashcardFiles).toContain('a-001.png');
    expect(flashcardFiles).toContain('q-002.png');
    expect(flashcardFiles).toContain('a-002.png');
    expect(flashcardFiles.length).toBe(4);
  });

  it('should handle directory without flashcards subdirectory', async () => {
    // Remove flashcards directory
    await fs.rm(flashcardsDir, { recursive: true, force: true });
    
    // Create tarball
    const parentDir = path.dirname(bookDir);
    const dirName = path.basename(bookDir);
    
    await execCommand('tar', [
      '-czf',
      archiveName,
      '--exclude',
      `${dirName}/${path.basename(archiveName)}`,
      dirName
    ], { cwd: parentDir });
    
    // Verify tarball was created
    const archiveExists = await fs.access(archiveName)
      .then(() => true)
      .catch(() => false);
    
    expect(archiveExists).toBe(true);
    
    // Extract and verify
    await fs.mkdir(extractDir, { recursive: true });
    await execCommand('tar', ['-xzf', archiveName], { cwd: extractDir });
    
    const extractedBookDir = path.join(extractDir, dirName);
    const extractedFlashcardsDir = path.join(extractedBookDir, 'flashcards');
    
    // Flashcards directory should not exist
    const flashcardsDirExists = await fs.access(extractedFlashcardsDir)
      .then(() => true)
      .catch(() => false);
    expect(flashcardsDirExists).toBe(false);
    
    // But other files should still be there
    const summaryMdExists = await fs.access(path.join(extractedBookDir, 'test.summary.md'))
      .then(() => true)
      .catch(() => false);
    expect(summaryMdExists).toBe(true);
  });

  it('should exclude the bundle file itself from the tarball', async () => {
    // Create tarball
    const parentDir = path.dirname(bookDir);
    const dirName = path.basename(bookDir);
    
    await execCommand('tar', [
      '-czf',
      archiveName,
      '--exclude',
      `${dirName}/${path.basename(archiveName)}`,
      dirName
    ], { cwd: parentDir });
    
    // Extract tarball
    await fs.mkdir(extractDir, { recursive: true });
    await execCommand('tar', ['-xzf', archiveName], { cwd: extractDir });
    
    const extractedBookDir = path.join(extractDir, dirName);
    
    // Verify the bundle file itself is not in the extracted contents
    const bundleInExtracted = await fs.access(path.join(extractedBookDir, path.basename(archiveName)))
      .then(() => true)
      .catch(() => false);
    
    expect(bundleInExtracted).toBe(false);
  });

  it('should preserve directory structure in tarball', async () => {
    // Create nested structure
    const nestedDir = path.join(flashcardsDir, 'subfolder');
    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(path.join(nestedDir, 'nested.png'), 'nested image');
    
    // Create tarball
    const parentDir = path.dirname(bookDir);
    const dirName = path.basename(bookDir);
    
    await execCommand('tar', [
      '-czf',
      archiveName,
      '--exclude',
      `${dirName}/${path.basename(archiveName)}`,
      dirName
    ], { cwd: parentDir });
    
    // Extract and verify nested structure
    await fs.mkdir(extractDir, { recursive: true });
    await execCommand('tar', ['-xzf', archiveName], { cwd: extractDir });
    
    const extractedNestedFile = path.join(extractDir, dirName, 'flashcards', 'subfolder', 'nested.png');
    const nestedFileExists = await fs.access(extractedNestedFile)
      .then(() => true)
      .catch(() => false);
    
    expect(nestedFileExists).toBe(true);
  });
});