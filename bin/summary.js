#!/usr/bin/env node

/**
 * Summary Forge CLI
 * 
 * Command-line interface for creating AI-powered book summaries
 */

import { program } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import path from 'node:path';
import { SummaryForge } from '../src/summary-forge.js';
import {
  loadConfig,
  saveConfig,
  hasConfig,
  getConfigPath,
  deleteConfig
} from '../src/utils/config.js';
/**
 * Create SummaryForge instance with config from settings file
 */
async function createForge() {
  const config = await loadConfig();
  
  if (!config) {
    console.log(chalk.yellow('\n⚠️  No configuration found. Please run "summary setup" first.\n'));
    process.exit(1);
  }
  
  return new SummaryForge(config);
}

program
  .command('setup')
  .description('Configure API keys and settings')
  .action(async () => {
    try {
      console.log(chalk.blue.bold('\n🔧 Summary Forge - Configuration Setup\n'));
      
      // Check if config already exists
      const existingConfig = await loadConfig();
      
      if (existingConfig) {
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: 'Configuration already exists. Do you want to update it?',
            default: false
          }
        ]);
        
        if (!overwrite) {
          console.log(chalk.gray('Setup cancelled.'));
          return;
        }
      }
      
      console.log(chalk.white('Please provide your API keys. Press Enter to skip optional keys.\n'));
      
      // Display existing values if present
      if (existingConfig) {
        console.log(chalk.gray('Current values (press Enter to keep):'));
        if (existingConfig.openaiApiKey) {
          console.log(chalk.gray(`  OpenAI API Key: ${existingConfig.openaiApiKey}`));
        }
        if (existingConfig.rainforestApiKey) {
          console.log(chalk.gray(`  Rainforest API Key: ${existingConfig.rainforestApiKey}`));
        }
        if (existingConfig.elevenlabsApiKey) {
          console.log(chalk.gray(`  ElevenLabs API Key: ${existingConfig.elevenlabsApiKey}`));
        }
        if (existingConfig.twocaptchaApiKey) {
          console.log(chalk.gray(`  2Captcha API Key: ${existingConfig.twocaptchaApiKey}`));
        }
        if (existingConfig.browserlessApiKey) {
          console.log(chalk.gray(`  Browserless API Key: ${existingConfig.browserlessApiKey}`));
        }
        if (existingConfig.proxyUrl) {
          console.log(chalk.gray(`  Proxy URL: ${existingConfig.proxyUrl}`));
        }
        if (existingConfig.proxyUsername) {
          console.log(chalk.gray(`  Proxy Username: ${existingConfig.proxyUsername}`));
        }
        if (existingConfig.proxyPassword) {
          console.log(chalk.gray(`  Proxy Password: ${existingConfig.proxyPassword}`));
        }
        console.log('');
      }
      
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'openaiApiKey',
          message: 'OpenAI API Key (required):',
          validate: (input) => input.trim().length > 0 || 'OpenAI API key is required',
          default: existingConfig?.openaiApiKey
        },
        {
          type: 'input',
          name: 'rainforestApiKey',
          message: 'Rainforest API Key (for Amazon search):',
          default: existingConfig?.rainforestApiKey
        },
        {
          type: 'input',
          name: 'elevenlabsApiKey',
          message: 'ElevenLabs API Key (for audio generation):',
          default: existingConfig?.elevenlabsApiKey
        },
        {
          type: 'input',
          name: 'twocaptchaApiKey',
          message: '2Captcha API Key (for CAPTCHA solving):',
          default: existingConfig?.twocaptchaApiKey
        },
        {
          type: 'input',
          name: 'browserlessApiKey',
          message: 'Browserless API Key (optional):',
          default: existingConfig?.browserlessApiKey
        },
        {
          type: 'confirm',
          name: 'headless',
          message: 'Run browser in headless mode?',
          default: existingConfig?.headless ?? true
        },
        {
          type: 'confirm',
          name: 'enableProxy',
          message: 'Enable proxy for browser requests?',
          default: existingConfig?.enableProxy ?? false
        },
        {
          type: 'input',
          name: 'proxyUrl',
          message: 'Proxy URL (e.g., http://proxy.example.com:8080):',
          when: (answers) => answers.enableProxy,
          validate: (input) => input.trim().length > 0 || 'Proxy URL is required when proxy is enabled',
          default: existingConfig?.proxyUrl
        },
        {
          type: 'input',
          name: 'proxyUsername',
          message: 'Proxy Username:',
          when: (answers) => answers.enableProxy,
          default: existingConfig?.proxyUsername
        },
        {
          type: 'input',
          name: 'proxyPassword',
          message: 'Proxy Password:',
          when: (answers) => answers.enableProxy,
          default: existingConfig?.proxyPassword
        },
        {
          type: 'input',
          name: 'proxyPoolSize',
          message: 'Proxy Pool Size (number of sticky sessions, default 36):',
          when: (answers) => answers.enableProxy,
          default: existingConfig?.proxyPoolSize || 36,
          validate: (input) => {
            const num = parseInt(input);
            return (!isNaN(num) && num > 0) || 'Must be a positive number';
          }
        }
      ]);
      
      // Remove empty optional fields
      const config = {};
      for (const [key, value] of Object.entries(answers)) {
        if (value !== '' && value !== undefined) {
          config[key] = value;
        }
      }
      
      // Save configuration
      await saveConfig(config);
      
      console.log(chalk.green(`\n✅ Configuration saved to ${getConfigPath()}`));
      console.log(chalk.blue('\n💡 You can now use the CLI commands without environment variables.'));
      console.log(chalk.gray('   To update your configuration, run "summary setup" again.\n'));
      
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Show current configuration')
  .option('--delete', 'Delete the configuration file')
  .option('--headless <value>', 'Toggle headless mode (true/false)')
  .option('--proxy <value>', 'Toggle proxy mode (true/false)')
  .action(async (options) => {
    try {
      // Handle quick toggles
      if (options.headless !== undefined || options.proxy !== undefined) {
        const config = await loadConfig();
        
        if (!config) {
          console.log(chalk.yellow('\n⚠️  No configuration found. Please run "summary setup" first.\n'));
          process.exit(1);
        }
        
        if (options.headless !== undefined) {
          const headlessValue = options.headless === 'true' || options.headless === true;
          config.headless = headlessValue;
          console.log(chalk.blue(`\n🔧 Setting headless mode to: ${headlessValue}`));
        }
        
        if (options.proxy !== undefined) {
          const proxyValue = options.proxy === 'true' || options.proxy === true;
          config.enableProxy = proxyValue;
          console.log(chalk.blue(`🔧 Setting proxy mode to: ${proxyValue}`));
          
          if (proxyValue && (!config.proxyUrl || !config.proxyUsername || !config.proxyPassword)) {
            console.log(chalk.yellow('\n⚠️  Proxy enabled but credentials missing.'));
            console.log(chalk.blue('   Run "summary setup" to configure proxy settings.\n'));
          }
        }
        
        await saveConfig(config);
        console.log(chalk.green('✅ Configuration updated.\n'));
        return;
      }
      
      if (options.delete) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Are you sure you want to delete your configuration?',
            default: false
          }
        ]);
        
        if (confirm) {
          await deleteConfig();
          console.log(chalk.green('\n✅ Configuration deleted.\n'));
        } else {
          console.log(chalk.gray('Deletion cancelled.'));
        }
        return;
      }
      
      const config = await loadConfig();
      
      if (!config) {
        console.log(chalk.yellow('\n⚠️  No configuration found.'));
        console.log(chalk.blue('   Run "summary setup" to configure API keys.\n'));
        return;
      }
      
      console.log(chalk.blue.bold('\n📋 Current Configuration\n'));
      console.log(chalk.gray(`Location: ${getConfigPath()}\n`));
      
      // Mask sensitive values
      const displayConfig = {};
      for (const [key, value] of Object.entries(config)) {
        if (typeof value === 'string' && value.length > 10 && key.toLowerCase().includes('key')) {
          displayConfig[key] = value.slice(0, 8) + '...' + value.slice(-4);
        } else {
          displayConfig[key] = value;
        }
      }
      
      console.log(chalk.white(JSON.stringify(displayConfig, null, 2)));
      console.log(chalk.gray('\n💡 Quick toggles:'));
      console.log(chalk.gray('   summary config --headless true/false'));
      console.log(chalk.gray('   summary config --proxy true/false'));
      console.log(chalk.gray('\n💡 Run "summary setup" to update full configuration.'));
      console.log(chalk.gray('   Run "summary config --delete" to remove configuration.\n'));
      
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });


const version = '1.0.0';

program
  .name('summary')
  .description('Create AI-powered summaries of technical books')
  .version(version);

program
  .command('file <path>')
  .description('Process a PDF or EPUB file')
  .option('-f, --force', 'Overwrite existing directory without prompting')
  .action(async (filePath, options) => {
    try {
      const config = await loadConfig();
      config.force = options.force || false;
      
      // Add prompt function for interactive mode
      if (!config.force) {
        config.promptFn = async (dirPath) => {
          const { action } = await inquirer.prompt([
            {
              type: 'list',
              name: 'action',
              message: `Directory already exists: ${dirPath}\nWhat would you like to do?`,
              choices: [
                { name: 'Overwrite (delete and recreate)', value: 'overwrite' },
                { name: 'Skip (cancel operation)', value: 'skip' },
                { name: 'Cancel', value: 'cancel' }
              ]
            }
          ]);
          return action;
        };
      }
      
      const forge = new SummaryForge(config);
      const result = await forge.processFile(path.resolve(filePath));
      
      console.log(chalk.green(`\n✨ Summary complete! Archive: ${result.archive}`));
      
      // Display cost summary
      console.log(chalk.blue('\n💰 Cost Summary:'));
      console.log(chalk.white(`   OpenAI (GPT-5):     ${result.costs.openai}`));
      console.log(chalk.white(`   ElevenLabs (TTS):   ${result.costs.elevenlabs}`));
      console.log(chalk.white(`   Rainforest API:     ${result.costs.rainforest}`));
      console.log(chalk.yellow(`   Total:              ${result.costs.total}\n`));
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('title <bookTitle...>')
  .description('Search for a book by title (shortcut for search)')
  .option('-f, --force', 'Skip prompts: auto-select first result and process immediately')
  .action(async (bookTitleParts, options) => {
    const title = bookTitleParts.join(' ');
    await searchAndDisplay(title, options.force);
  });

program
  .command('search <query>')
  .description('Search Anna\'s Archive directly by title or partial match (bypasses Amazon/Rainforest API)')
  .option('-n, --max-results <number>', 'Maximum number of results to display', '10')
  .option('-f, --format <format>', 'File format filter: pdf, epub, pdf,epub, or all', 'pdf')
  .option('-s, --sort <sort>', 'Sort by: date (newest) or leave empty for relevance', '')
  .option('-l, --language <language>', 'Language code(s), comma-separated (e.g., en, es, fr)', 'en')
  .option('--sources <sources>', 'Data sources, comma-separated (e.g., zlib,lgli,lgrs). Leave empty to search all sources.')
  .action(async (query, options) => {
    try {
      const forge = await createForge();
      
      const maxResults = parseInt(options.maxResults, 10);
      
      const spinner = ora(`Searching Anna's Archive for "${query}"...`).start();
      
      const results = await forge.searchAnnasArchive(query, {
        maxResults,
        format: options.format,
        sortBy: options.sort,
        language: options.language,
        sources: options.sources || null
      });
      
      spinner.stop();
      
      if (results.length === 0) {
        console.log(chalk.yellow('\n📚 No results found'));
        return;
      }
      
      console.log(chalk.blue(`\n📚 Found ${results.length} results:\n`));
      
      // Display results
      results.forEach((result, idx) => {
        console.log(chalk.white(`${idx + 1}. ${result.title}`));
        if (result.author) {
          console.log(chalk.gray(`   Author: ${result.author}`));
        }
        console.log(chalk.gray(`   Format: ${result.format.toUpperCase()} | Size: ${result.sizeInMB.toFixed(1)} MB`));
        console.log(chalk.cyan(`   URL: ${result.url}`));
        console.log('');
      });
      
      // Ask user to select a book
      const { selectedIndex } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedIndex',
          message: 'Select a book to download:',
          choices: [
            ...results.map((result, idx) => ({
              name: `${result.title} (${result.format.toUpperCase()}, ${result.sizeInMB.toFixed(1)} MB)`,
              value: idx
            })),
            { name: chalk.gray('Cancel'), value: -1 }
          ],
          pageSize: 15
        }
      ]);
      
      if (selectedIndex === -1) {
        console.log(chalk.gray('Cancelled.'));
        return;
      }
      
      const selectedBook = results[selectedIndex];
      
      // Extract MD5 hash from URL to use as ASIN
      const md5Match = selectedBook.href.match(/\/md5\/([a-f0-9]+)/);
      const asin = md5Match ? md5Match[1] : `aa_${Date.now()}`;
      
      // Download the book
      const downloadSpinner = ora('Downloading from Anna\'s Archive...').start();
      try {
        const download = await forge.downloadFromAnnasArchive(asin, '.', selectedBook.title);
        downloadSpinner.stop();
        
        console.log(chalk.green(`\n✅ Downloaded: ${download.filepath}`));
        
        const { shouldProcess } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldProcess',
            message: 'Would you like to process this book now?',
            default: true
          }
        ]);
        
        if (shouldProcess) {
          downloadSpinner.start('Processing book...');
          const result = await forge.processFile(download.filepath, download.asin);
          downloadSpinner.stop();
          console.log(chalk.green(`\n✨ Summary complete! Archive: ${result.archive}`));
          
          // Display cost summary
          console.log(chalk.blue('\n💰 Cost Summary:'));
          console.log(chalk.white(`   OpenAI (GPT-5):     ${result.costs.openai}`));
          console.log(chalk.white(`   ElevenLabs (TTS):   ${result.costs.elevenlabs}`));
          console.log(chalk.white(`   Rainforest API:     ${result.costs.rainforest}`));
          console.log(chalk.yellow(`   Total:              ${result.costs.total}\n`));
        }
      } catch (error) {
        downloadSpinner.stop();
        console.error(chalk.red(`\n❌ Download failed: ${error.message}`));
      }
      
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('isbn <asin>')
  .description('Download and process a book by ISBN/ASIN from Anna\'s Archive')
  .option('--no-download', 'Skip download and just show URL')
  .option('-f, --force', 'Overwrite existing directory without prompting')
  .action(async (asin, options) => {
    try {
      // Load config first
      const config = await loadConfig();
      
      if (!config) {
        console.log(chalk.yellow('\n⚠️  No configuration found. Please run "summary setup" first.\n'));
        process.exit(1);
      }
      
      // Check if just showing URL
      if (options.download === false) {
        const tempForge = new SummaryForge(config);
        const url = tempForge.getAnnasArchiveUrl(asin, null);
        console.log(chalk.blue(`\n🌐 Anna's Archive URL:`));
        console.log(chalk.cyan(url));
        console.log(chalk.yellow(`\n⚠️  Please download the EPUB manually, then run:`));
        console.log(chalk.white(`   summary file /path/to/downloaded/book.epub\n`));
        return;
      }
      
      // Set up directory protection
      config.force = options.force || false;
      
      // Add prompt function for interactive mode
      if (!config.force) {
        config.promptFn = async (dirPath) => {
          const { action } = await inquirer.prompt([
            {
              type: 'list',
              name: 'action',
              message: `Directory already exists: ${dirPath}\nWhat would you like to do?`,
              choices: [
                { name: 'Overwrite (delete and recreate)', value: 'overwrite' },
                { name: 'Skip (cancel operation)', value: 'skip' },
                { name: 'Cancel', value: 'cancel' }
              ]
            }
          ]);
          return action;
        };
      }
      
      const forge = new SummaryForge(config);
      
      const spinner = ora('Downloading from Anna\'s Archive...').start();
      const download = await forge.downloadFromAnnasArchive(asin);
      spinner.stop();
      
      console.log(chalk.green(`\n✅ Downloaded: ${download.filepath}`));
      
      const { shouldProcess } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldProcess',
          message: 'Would you like to process this book now?',
          default: true
        }
      ]);
      
      if (shouldProcess) {
        spinner.start('Processing book...');
        const result = await forge.processFile(download.filepath, download.asin);
        spinner.stop();
        console.log(chalk.green(`\n✨ Summary complete! Archive: ${result.archive}`));
        
        // Display cost summary
        console.log(chalk.blue('\n💰 Cost Summary:'));
        console.log(chalk.white(`   OpenAI (GPT-5):     ${result.costs.openai}`));
        console.log(chalk.white(`   ElevenLabs (TTS):   ${result.costs.elevenlabs}`));
        console.log(chalk.white(`   Rainforest API:     ${result.costs.rainforest}`));
        console.log(chalk.yellow(`   Total:              ${result.costs.total}\n`));
      }
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('interactive')
  .alias('i')
  .description('Interactive mode - guided workflow')
  .action(async () => {
    try {
      console.log(chalk.blue.bold('\n📚 Summary Forge - Interactive Mode\n'));

      const { mode } = await inquirer.prompt([
        {
          type: 'list',
          name: 'mode',
          message: 'What would you like to do?',
          choices: [
            { name: '📄 Process a local file (PDF/EPUB)', value: 'file' },
            { name: '🔍 Search for a book by title', value: 'search' },
            { name: '🔢 Look up by ISBN/ASIN', value: 'isbn' },
            { name: '❌ Exit', value: 'exit' }
          ]
        }
      ]);

      if (mode === 'exit') {
        console.log(chalk.gray('Goodbye!'));
        return;
      }

      if (mode === 'file') {
        const { filePath } = await inquirer.prompt([
          {
            type: 'input',
            name: 'filePath',
            message: 'Enter the path to your PDF or EPUB file:',
            validate: (input) => input.trim().length > 0 || 'File path is required'
          }
        ]);

        const spinner = ora('Processing book...').start();
        const forge = await createForge();
        const result = await forge.processFile(path.resolve(filePath));
        spinner.stop();
        
        console.log(chalk.green(`\n✨ Summary complete! Archive: ${result.archive}`));
        
        // Display cost summary
        console.log(chalk.blue('\n💰 Cost Summary:'));
        console.log(chalk.white(`   OpenAI (GPT-5):     ${result.costs.openai}`));
        console.log(chalk.white(`   ElevenLabs (TTS):   ${result.costs.elevenlabs}`));
        console.log(chalk.white(`   Rainforest API:     ${result.costs.rainforest}`));
        console.log(chalk.yellow(`   Total:              ${result.costs.total}\n`));
      } else if (mode === 'search') {
        const { title } = await inquirer.prompt([
          {
            type: 'input',
            name: 'title',
            message: 'Enter book title:',
            validate: (input) => input.trim().length > 0 || 'Title is required'
          }
        ]);

        const spinner = ora('Searching Amazon...').start();
        const forge = await createForge();
        const results = await forge.searchBookByTitle(title);
        spinner.stop();

        if (results.length === 0) {
          console.log(chalk.yellow('No results found'));
          return;
        }

        const choices = results.slice(0, 10).map((book) => ({
          name: `${book.title} - ${book.author || 'Unknown'} (ASIN: ${book.asin})`,
          value: { asin: book.asin, title: book.title },
          short: book.title
        }));

        const { selectedBook } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedBook',
            message: 'Select a book:',
            choices,
            pageSize: 10
          }
        ]);

        // Download automatically
        spinner.start('Downloading from Anna\'s Archive...');
        try {
          const download = await forge.downloadFromAnnasArchive(selectedBook.asin, '.', selectedBook.title);
          spinner.stop();
          
          console.log(chalk.green(`\n✅ Downloaded: ${download.filepath}`));
          
          const { shouldProcess } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'shouldProcess',
              message: 'Would you like to process this book now?',
              default: true
            }
          ]);
          
          if (shouldProcess) {
            spinner.start('Processing book...');
            const result = await forge.processFile(download.filepath, download.asin);
            spinner.stop();
            console.log(chalk.green(`\n✨ Summary complete! Archive: ${result.archive}`));
            
            // Display cost summary
            console.log(chalk.blue('\n💰 Cost Summary:'));
            console.log(chalk.white(`   OpenAI (GPT-5):     ${result.costs.openai}`));
            console.log(chalk.white(`   ElevenLabs (TTS):   ${result.costs.elevenlabs}`));
            console.log(chalk.white(`   Rainforest API:     ${result.costs.rainforest}`));
            console.log(chalk.yellow(`   Total:              ${result.costs.total}\n`));
          }
        } catch (error) {
          spinner.stop();
          console.error(chalk.red(`\n❌ Download failed: ${error.message}`));
        }
      } else if (mode === 'isbn') {
        const { asin } = await inquirer.prompt([
          {
            type: 'input',
            name: 'asin',
            message: 'Enter ISBN or ASIN:',
            validate: (input) => input.trim().length > 0 || 'ISBN/ASIN is required'
          }
        ]);

        const forge = await createForge();
        
        const spinner = ora('Downloading from Anna\'s Archive...').start();
        try {
          const download = await forge.downloadFromAnnasArchive(asin);
          spinner.stop();
          
          console.log(chalk.green(`\n✅ Downloaded: ${download.filepath}`));
          
          const { shouldProcess } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'shouldProcess',
              message: 'Would you like to process this book now?',
              default: true
            }
          ]);
          
          if (shouldProcess) {
            spinner.start('Processing book...');
            const result = await forge.processFile(download.filepath, download.asin);
            spinner.stop();
            console.log(chalk.green(`\n✨ Summary complete! Archive: ${result.archive}`));
            
            // Display cost summary
            console.log(chalk.blue('\n💰 Cost Summary:'));
            console.log(chalk.white(`   OpenAI (GPT-5):     ${result.costs.openai}`));
            console.log(chalk.white(`   ElevenLabs (TTS):   ${result.costs.elevenlabs}`));
            console.log(chalk.white(`   Rainforest API:     ${result.costs.rainforest}`));
            console.log(chalk.yellow(`   Total:              ${result.costs.total}\n`));
          }
        } catch (error) {
          spinner.stop();
          console.error(chalk.red(`\n❌ Download failed: ${error.message}`));
        }
      }
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

// Helper function for search and display
async function searchAndDisplay(title, force = false) {
  try {
    const spinner = ora('Searching Amazon...').start();
    const forge = await createForge();
    const results = await forge.searchBookByTitle(title);
    spinner.stop();

    if (results.length === 0) {
      console.log(chalk.yellow('No results found'));
      return;
    }

    let selectedBook;
    
    if (force) {
      // Auto-select first result
      selectedBook = { asin: results[0].asin, title: results[0].title };
      console.log(chalk.blue(`\n📚 Auto-selected first result (--force):`));
      console.log(chalk.white(`   ${results[0].title} - ${results[0].author || 'Unknown'} (ASIN: ${results[0].asin})\n`));
    } else {
      console.log(chalk.blue(`\n📚 Found ${results.length} results:\n`));
      
      const choices = results.slice(0, 10).map((book, idx) => ({
        name: `${book.title} - ${book.author || 'Unknown'} (ASIN: ${book.asin})`,
        value: { asin: book.asin, title: book.title },
        short: book.title
      }));

      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedBook',
          message: 'Select a book:',
          choices,
          pageSize: 10
        }
      ]);
      
      selectedBook = answer.selectedBook;
    }

    // Download automatically
    const downloadSpinner = ora('Downloading from Anna\'s Archive...').start();
    try {
      const download = await forge.downloadFromAnnasArchive(selectedBook.asin, '.', selectedBook.title);
      downloadSpinner.stop();
      
      console.log(chalk.green(`\n✅ Downloaded: ${download.filepath}`));
      
      let shouldProcess = true;
      
      if (!force) {
        const answer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldProcess',
            message: 'Would you like to process this book now?',
            default: true
          }
        ]);
        shouldProcess = answer.shouldProcess;
      } else {
        console.log(chalk.blue('🚀 Auto-processing (--force)...\n'));
      }
      
      if (shouldProcess) {
        downloadSpinner.start('Processing book...');
        const result = await forge.processFile(download.filepath, download.asin);
        downloadSpinner.stop();
        console.log(chalk.green(`\n✨ Summary complete! Archive: ${result.archive}`));
        
        // Display cost summary
        console.log(chalk.blue('\n💰 Cost Summary:'));
        console.log(chalk.white(`   OpenAI (GPT-5):     ${result.costs.openai}`));
        console.log(chalk.white(`   ElevenLabs (TTS):   ${result.costs.elevenlabs}`));
        console.log(chalk.white(`   Rainforest API:     ${result.costs.rainforest}`));
        console.log(chalk.yellow(`   Total:              ${result.costs.total}`));
        
        // Show Amazon affiliate link at the end
        console.log(chalk.blue('\n🛒 Buy on Amazon (affiliate link):'));
        console.log(chalk.cyan(`   https://www.amazon.com/dp/${selectedBook.asin}?tag=summaryforge-20\n`));
      }
    } catch (error) {
      downloadSpinner.stop();
      console.error(chalk.red(`\n❌ Download failed: ${error.message}`));
      console.log(chalk.yellow(`\n💡 You can try downloading manually from:`));
      console.log(chalk.cyan(forge.getAnnasArchiveUrl(selectedBook.asin, selectedBook.title)));
    }
  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    process.exit(1);
  }
}

// Default action - show help or run interactive mode
program.action(() => {
  program.help();
});

program.parse();