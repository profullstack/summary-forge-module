/**
 * File Utilities
 * 
 * Common file operations and helpers
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { spawn } from 'node:child_process';

/**
 * Check if file exists
 */
export async function fileExists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize filename for safe file system usage
 */
export function sanitizeFilename(filename) {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/\.epub$/i, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

/**
 * Execute shell command
 */
export async function executeCommand(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn(cmd, args, { stdio: 'inherit', ...opts });
    process.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} exited with code ${code}`));
      }
    });
  });
}

/**
 * Write debug artifacts
 */
export async function writeDebugArtifacts(title, html, outputDir) {
  const pagePath = `${outputDir}/page.html`;
  const titlePath = `${outputDir}/page.title.txt`;
  const previewPath = `${outputDir}/page.preview.txt`;

  await fsp.writeFile(pagePath, html, 'utf8');
  await fsp.writeFile(titlePath, `${title || ''}`.trim() + '\n', 'utf8');

  const preview = html.replace(/\s+/g, ' ').slice(0, 300);
  await fsp.writeFile(
    previewPath,
    preview + (html.length > 300 ? '...' : '') + '\n',
    'utf8'
  );

  return { pagePath, titlePath, previewPath };
}