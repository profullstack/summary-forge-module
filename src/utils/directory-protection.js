/**
 * Directory Protection Utility
 * 
 * Handles directory overwrite protection with force flag support
 */

import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Check if a directory exists
 * @param {string} dirPath - Path to directory
 * @returns {Promise<boolean>}
 */
export async function directoryExists(dirPath) {
  try {
    const stats = await fsp.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if directory exists and handle overwrite protection
 * @param {string} dirPath - Path to directory
 * @param {boolean} force - Force overwrite without prompting
 * @param {Function} promptFn - Optional prompt function for interactive mode
 * @returns {Promise<{shouldProceed: boolean, action: 'create'|'overwrite'|'skip'}>}
 */
export async function checkDirectoryOverwrite(dirPath, force = false, promptFn = null) {
  const exists = await directoryExists(dirPath);
  
  if (!exists) {
    return { shouldProceed: true, action: 'create' };
  }
  
  // If force flag is set, always overwrite
  if (force) {
    return { shouldProceed: true, action: 'overwrite' };
  }
  
  // If no prompt function provided (non-interactive), throw error
  if (!promptFn) {
    throw new Error(
      `Directory already exists: ${dirPath}\n` +
      'Use --force flag to overwrite, or remove the directory manually.'
    );
  }
  
  // Interactive mode - prompt user
  const action = await promptFn(dirPath);
  
  if (action === 'skip') {
    return { shouldProceed: false, action: 'skip' };
  }
  
  if (action === 'overwrite') {
    return { shouldProceed: true, action: 'overwrite' };
  }
  
  // Cancel
  throw new Error('Operation cancelled by user');
}

/**
 * Remove directory and all contents
 * @param {string} dirPath - Path to directory
 * @returns {Promise<void>}
 */
export async function removeDirectory(dirPath) {
  try {
    await fsp.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    throw new Error(`Failed to remove directory ${dirPath}: ${error.message}`);
  }
}

/**
 * Ensure directory exists, handling overwrite protection
 * @param {string} dirPath - Path to directory
 * @param {boolean} force - Force overwrite without prompting
 * @param {Function} promptFn - Optional prompt function for interactive mode
 * @returns {Promise<{created: boolean, overwritten: boolean}>}
 */
export async function ensureDirectory(dirPath, force = false, promptFn = null) {
  const result = await checkDirectoryOverwrite(dirPath, force, promptFn);
  
  if (!result.shouldProceed) {
    return { created: false, overwritten: false };
  }
  
  if (result.action === 'overwrite') {
    await removeDirectory(dirPath);
    await fsp.mkdir(dirPath, { recursive: true });
    return { created: true, overwritten: true };
  }
  
  // Create new directory
  await fsp.mkdir(dirPath, { recursive: true });
  return { created: true, overwritten: false };
}

/**
 * Get list of files in directory (for showing what will be overwritten)
 * @param {string} dirPath - Path to directory
 * @returns {Promise<string[]>}
 */
export async function getDirectoryContents(dirPath) {
  try {
    const files = await fsp.readdir(dirPath);
    return files;
  } catch {
    return [];
  }
}