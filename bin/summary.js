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
  .command('url <url>')
  .description('Process a web page URL and generate summary')
  .option('-f, --force', 'Overwrite existing directory without prompting')
  .action(async (url, options) => {
    try {
      // Validate URL format
      try {
        new URL(url);
      } catch (urlError) {
        console.error(chalk.red(`\n❌ Invalid URL: ${url}`));
        console.log(chalk.yellow('   Please provide a valid URL (e.g., https://example.com/article)\n'));
        process.exit(1);
      }
      
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
      
      const spinner = ora('Fetching web page...').start();
      const forge = new SummaryForge(config);
      
      try {
        const result = await forge.processWebPage(url);
        spinner.stop();
        
        console.log(chalk.green(`\n✨ Summary complete! Archive: ${result.archive}`));
        console.log(chalk.blue(`📄 Page title: ${result.title}`));
        console.log(chalk.cyan(`🔗 Source URL: ${result.url}`));
        
        // Display cost summary
        console.log(chalk.blue('\n💰 Cost Summary:'));
        console.log(chalk.white(`   OpenAI (GPT-5):     ${result.costs.openai}`));
        console.log(chalk.white(`   ElevenLabs (TTS):   ${result.costs.elevenlabs}`));
        console.log(chalk.white(`   Rainforest API:     ${result.costs.rainforest}`));
        console.log(chalk.yellow(`   Total:              ${result.costs.total}\n`));
      } catch (error) {
        spinner.stop();
        throw error;
      }
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('title <bookTitle...>')
  .description('Search 1lib.sk for a book by title (shortcut for search)')
  .option('-f, --force', 'Skip prompts: auto-select first result and process immediately')
  .action(async (bookTitleParts, options) => {
    const title = bookTitleParts.join(' ');
    await search1libAndDisplay(title, options.force);
  });

program
  .command('search <query>')
  .description('Search for books (default: 1lib.sk, use --source to change)')
  .option('--source <source>', 'Search source: zlib (1lib.sk, default) or anna (Anna\'s Archive)', 'zlib')
  .option('-n, --max-results <number>', 'Maximum number of results to display', '10')
  .option('--year-from <year>', 'Filter by publication year from (e.g., 2020)')
  .option('--year-to <year>', 'Filter by publication year to (e.g., 2024)')
  .option('-l, --languages <languages>', 'Language filter, comma-separated (default: english)', 'english')
  .option('-e, --extensions <extensions>', 'File extensions, comma-separated (case-insensitive, default: PDF)', 'PDF')
  .option('--content-types <types>', 'Content types, comma-separated (default: book)', 'book')
  .option('-s, --order <order>', 'Sort order: date (newest) or empty for relevance', '')
  .option('--view <view>', 'View type: list or grid (default: list)', 'list')
  .option('--sources <sources>', 'Anna\'s Archive: data sources, comma-separated (e.g., zlib,lgli)')
  .action(async (query, options) => {
    const source = options.source.toLowerCase();
    
    if (source === 'anna') {
      // Use Anna's Archive (old logic)
      await searchAnnasArchive(query, options);
      return;
    }
    
    // Use 1lib.sk with single-session search+download
    try {
      const config = await loadConfig();
      config.force = false;
      
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
      
      const forge = new SummaryForge(config);
      
      const maxResults = parseInt(options.maxResults, 10);
      const yearFrom = options.yearFrom ? parseInt(options.yearFrom, 10) : null;
      const yearTo = options.yearTo ? parseInt(options.yearTo, 10) : null;
      const languages = options.languages ? options.languages.split(',').map(l => l.trim()) : [];
      const extensions = options.extensions ? options.extensions.split(',').map(e => e.trim().toUpperCase()) : [];
      const contentTypes = options.contentTypes ? options.contentTypes.split(',').map(t => t.trim()) : [];
      
      const spinner = ora(`Searching 1lib.sk for "${query}"...`).start();
      
      const { results, download } = await forge.search1libAndDownload(query, {
        maxResults,
        yearFrom,
        yearTo,
        languages,
        extensions,
        contentTypes,
        order: options.order,
        view: options.view
      }, '.', async (results) => {
        spinner.stop();
        
        if (results.length === 0) {
          console.log(chalk.yellow('\n📚 No results found'));
          return null;
        }
        
        console.log(chalk.blue(`\n📚 Found ${results.length} results:\n`));
      
      // Display results
      results.forEach((result, idx) => {
        console.log(chalk.white(`${idx + 1}. ${result.title}`));
        if (result.author) {
          console.log(chalk.gray(`   Author: ${result.author}`));
        }
        if (result.year) {
          console.log(chalk.gray(`   Year: ${result.year}`));
        }
        console.log(chalk.gray(`   Format: ${result.extension} | Size: ${result.size}`));
        if (result.language) {
          console.log(chalk.gray(`   Language: ${result.language}`));
        }
        if (result.isbn) {
          console.log(chalk.gray(`   ISBN: ${result.isbn}`));
        }
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
              name: `${result.title} (${result.extension}, ${result.size})`,
              value: idx
            })),
            { name: chalk.gray('Cancel'), value: -1 }
          ],
          pageSize: 15
        }
      ]);
      
      if (selectedIndex === -1) {
        console.log(chalk.gray('Cancelled.'));
        return null;
      }
      
      spinner.start('Downloading (same session)...');
      return selectedIndex;
    });
    
    spinner.stop();
    
    if (!download) {
      return;
    }
    
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
      const result = await forge.processFile(download.filepath, download.identifier);
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
  .command('search1lib <query>')
  .description('Search 1lib.sk for books (faster, no DDoS protection)')
  .option('-n, --max-results <number>', 'Maximum number of results to display', '10')
  .option('--year-from <year>', 'Filter by publication year from (e.g., 2020)')
  .option('--year-to <year>', 'Filter by publication year to (e.g., 2024)')
  .option('-l, --languages <languages>', 'Language filter, comma-separated (e.g., english,spanish)', 'english')
  .option('-e, --extensions <extensions>', 'File extensions, comma-separated (e.g., PDF,EPUB)', 'PDF')
  .option('--content-types <types>', 'Content types, comma-separated (e.g., book,article)', 'book')
  .option('-s, --order <order>', 'Sort order: date (newest) or leave empty for relevance', '')
  .option('--view <view>', 'View type: list or grid', 'list')
  .action(async (query, options) => {
    try {
      const forge = await createForge();
      
      const maxResults = parseInt(options.maxResults, 10);
      const yearFrom = options.yearFrom ? parseInt(options.yearFrom, 10) : null;
      const yearTo = options.yearTo ? parseInt(options.yearTo, 10) : null;
      const languages = options.languages ? options.languages.split(',').map(l => l.trim()) : [];
      const extensions = options.extensions ? options.extensions.split(',').map(e => e.trim().toUpperCase()) : [];
      const contentTypes = options.contentTypes ? options.contentTypes.split(',').map(t => t.trim()) : [];
      
      const spinner = ora(`Searching 1lib.sk for "${query}"...`).start();
      
      const results = await forge.search1lib(query, {
        maxResults,
        yearFrom,
        yearTo,
        languages,
        extensions,
        contentTypes,
        order: options.order,
        view: options.view
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
        if (result.year) {
          console.log(chalk.gray(`   Year: ${result.year}`));
        }
        console.log(chalk.gray(`   Format: ${result.extension} | Size: ${result.size}`));
        if (result.language) {
          console.log(chalk.gray(`   Language: ${result.language}`));
        }
        if (result.isbn) {
          console.log(chalk.gray(`   ISBN: ${result.isbn}`));
        }
        console.log(chalk.cyan(`   URL: ${result.url}`));
        console.log('');
      });
      
      // Ask user to select a book
      const { selectedIndex } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedIndex',
          message: 'Select a book to view details:',
          choices: [
            ...results.map((result, idx) => ({
              name: `${result.title} (${result.extension}, ${result.size})`,
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
      
      console.log(chalk.blue('\n📖 Book Details:'));
      console.log(chalk.white(`   Title: ${selectedBook.title}`));
      if (selectedBook.author) {
        console.log(chalk.white(`   Author: ${selectedBook.author}`));
      }
      if (selectedBook.year) {
        console.log(chalk.white(`   Year: ${selectedBook.year}`));
      }
      console.log(chalk.white(`   Format: ${selectedBook.extension}`));
      console.log(chalk.white(`   Size: ${selectedBook.size}`));
      if (selectedBook.language) {
        console.log(chalk.white(`   Language: ${selectedBook.language}`));
      }
      if (selectedBook.isbn) {
        console.log(chalk.white(`   ISBN: ${selectedBook.isbn}`));
      }
      console.log(chalk.cyan(`   URL: ${selectedBook.url}`));
      console.log(chalk.cyan(`   Download: ${selectedBook.downloadUrl}\n`));
      
      // Ask if user wants to download
      const { shouldDownload } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldDownload',
          message: 'Would you like to download this book now?',
          default: true
        }
      ]);
      
      if (shouldDownload) {
        const downloadSpinner = ora('Downloading from 1lib.sk...').start();
        try {
          const config = await loadConfig();
          config.force = false; // Will prompt for directory overwrite
          
          // Add prompt function for interactive mode
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
          
          const forge = new SummaryForge(config);
          const download = await forge.downloadFrom1lib(selectedBook.url, '.', selectedBook.title);
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
            const result = await forge.processFile(download.filepath, download.identifier);
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
      }
      
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('isbn <isbn>')
  .description('Search and download a book by ISBN (default: 1lib.sk, use --source to change)')
  .option('--source <source>', 'Search source: zlib (1lib.sk, default) or anna (Anna\'s Archive)', 'zlib')
  .option('-f, --force', 'Overwrite existing directory without prompting')
  .action(async (isbn, options) => {
    const source = options.source.toLowerCase();
    
    if (source === 'anna') {
      // Use Anna's Archive for ISBN lookup
      await isbnAnnasArchive(isbn, options.force);
      return;
    }
    
    // Use 1lib.sk with single-session search+download (same as search command)
    try {
      const config = await loadConfig();
      config.force = options.force || false;
      
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
      
      const forge = new SummaryForge(config);
      
      const spinner = ora(`Searching 1lib.sk for ISBN ${isbn}...`).start();
      
      const { results, download } = await forge.search1libAndDownload(isbn, {
        maxResults: 5,
        extensions: ['PDF']  // PDF only by default
      }, '.', async (results) => {
        spinner.stop();
        
        if (results.length === 0) {
          console.log(chalk.yellow('\n📚 No results found for this ISBN'));
          return null;
        }
        
        console.log(chalk.blue(`\n📚 Found ${results.length} results:\n`));
        
        // Display results
        results.forEach((result, idx) => {
          console.log(chalk.white(`${idx + 1}. ${result.title}`));
          if (result.author) {
            console.log(chalk.gray(`   Author: ${result.author}`));
          }
          if (result.year) {
            console.log(chalk.gray(`   Year: ${result.year}`));
          }
          console.log(chalk.gray(`   Format: ${result.extension} | Size: ${result.size}`));
          if (result.isbn) {
            console.log(chalk.gray(`   ISBN: ${result.isbn}`));
          }
          console.log('');
        });
        
        // Auto-select or prompt
        if (options.force && results.length > 0) {
          console.log(chalk.blue(`📖 Auto-selected first result (--force):`));
          console.log(chalk.white(`   ${results[0].title}\n`));
          spinner.start('Downloading (same session)...');
          return 0;
        }
        
        const { selectedIndex } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedIndex',
            message: 'Select a book to download:',
            choices: [
              ...results.map((result, idx) => ({
                name: `${result.title} (${result.extension}, ${result.size})`,
                value: idx
              })),
              { name: chalk.gray('Cancel'), value: -1 }
            ],
            pageSize: 15
          }
        ]);
        
        if (selectedIndex === -1) {
          console.log(chalk.gray('Cancelled.'));
          return null;
        }
        
        spinner.start('Downloading (same session)...');
        return selectedIndex;
      });
      
      spinner.stop();
      
      if (!download) {
        return;
      }
      
      console.log(chalk.green(`\n✅ Downloaded: ${download.filepath}`));
      
      let shouldProcess = true;
      if (!options.force) {
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
        spinner.start('Processing book...');
        const result = await forge.processFile(download.filepath, download.identifier);
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
            { name: '🌐 Process a web page URL', value: 'url' },
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
      } else if (mode === 'url') {
        const { url } = await inquirer.prompt([
          {
            type: 'input',
            name: 'url',
            message: 'Enter the web page URL:',
            validate: (input) => {
              try {
                new URL(input);
                return true;
              } catch {
                return 'Please enter a valid URL (e.g., https://example.com/article)';
              }
            }
          }
        ]);

        const spinner = ora('Fetching web page...').start();
        const forge = await createForge();
        
        try {
          const result = await forge.processWebPage(url);
          spinner.stop();
          
          console.log(chalk.green(`\n✨ Summary complete! Archive: ${result.archive}`));
          console.log(chalk.blue(`📄 Page title: ${result.title}`));
          console.log(chalk.cyan(`🔗 Source URL: ${result.url}`));
          
          // Display cost summary
          console.log(chalk.blue('\n💰 Cost Summary:'));
          console.log(chalk.white(`   OpenAI (GPT-5):     ${result.costs.openai}`));
          console.log(chalk.white(`   ElevenLabs (TTS):   ${result.costs.elevenlabs}`));
          console.log(chalk.white(`   Rainforest API:     ${result.costs.rainforest}`));
          console.log(chalk.yellow(`   Total:              ${result.costs.total}\n`));
        } catch (error) {
          spinner.stop();
          throw error;
        }
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

// Helper function for 1lib.sk search and display
async function search1libAndDisplay(title, force = false) {
  try {
    const config = await loadConfig();
    config.force = force;
    
    if (!force) {
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
    
    const spinner = ora(`Searching 1lib.sk for "${title}"...`).start();
    
    const { results, download } = await forge.search1libAndDownload(title, {
      maxResults: 10,
      extensions: ['PDF']
    }, '.', async (results) => {
      spinner.stop();
      
      if (results.length === 0) {
        console.log(chalk.yellow('\n📚 No results found'));
        return null;
      }
      
      if (force && results.length > 0) {
        console.log(chalk.blue(`\n📚 Auto-selected first result (--force):`));
        console.log(chalk.white(`   ${results[0].title}\n`));
        spinner.start('Downloading (same session)...');
        return 0;
      }
      
      console.log(chalk.blue(`\n📚 Found ${results.length} results:\n`));
      
      // Display results
      results.forEach((result, idx) => {
        console.log(chalk.white(`${idx + 1}. ${result.title}`));
        if (result.author) {
          console.log(chalk.gray(`   Author: ${result.author}`));
        }
        if (result.year) {
          console.log(chalk.gray(`   Year: ${result.year}`));
        }
        console.log(chalk.gray(`   Format: ${result.extension} | Size: ${result.size}`));
        console.log('');
      });
      
      const { selectedIndex } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedIndex',
          message: 'Select a book to download:',
          choices: [
            ...results.map((result, idx) => ({
              name: `${result.title} (${result.extension}, ${result.size})`,
              value: idx
            })),
            { name: chalk.gray('Cancel'), value: -1 }
          ],
          pageSize: 15
        }
      ]);
      
      if (selectedIndex === -1) {
        console.log(chalk.gray('Cancelled.'));
        return null;
      }
      
      spinner.start('Downloading (same session)...');
      return selectedIndex;
    });
    
    spinner.stop();
    
    if (!download) {
      return;
    }
    
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
      spinner.start('Processing book...');
      const result = await forge.processFile(download.filepath, download.identifier);
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
}

// Helper function for Anna's Archive search and display
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