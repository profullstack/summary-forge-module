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
import dotenv from 'dotenv';
import path from 'node:path';
import { SummaryForge } from '../src/summary-forge.js';

// Load environment variables
dotenv.config();

const version = '1.0.0';

program
  .name('summary')
  .description('Create AI-powered summaries of technical books')
  .version(version);

program
  .command('file <path>')
  .description('Process a PDF or EPUB file')
  .action(async (filePath) => {
    try {
      const forge = new SummaryForge();
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
  .action(async (bookTitleParts) => {
    const title = bookTitleParts.join(' ');
    await searchAndDisplay(title);
  });

program
  .command('search')
  .description('Search for a book by title (interactive)')
  .action(async () => {
    try {
      const { title } = await inquirer.prompt([
        {
          type: 'input',
          name: 'title',
          message: 'Enter book title:',
          validate: (input) => input.trim().length > 0 || 'Title is required'
        }
      ]);

      await searchAndDisplay(title);

    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('isbn <asin>')
  .description('Download and process a book by ISBN/ASIN from Anna\'s Archive')
  .option('--no-download', 'Skip download and just show URL')
  .action(async (asin, options) => {
    try {
      const forge = new SummaryForge();
      
      if (options.download === false) {
        const url = forge.getAnnasArchiveUrl(asin);
        console.log(chalk.blue(`\n🌐 Anna's Archive URL:`));
        console.log(chalk.cyan(url));
        console.log(chalk.yellow(`\n⚠️  Please download the EPUB manually, then run:`));
        console.log(chalk.white(`   summary file /path/to/downloaded/book.epub\n`));
        return;
      }
      
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
        const result = await forge.processFile(download.filepath);
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
        const forge = new SummaryForge();
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
        const forge = new SummaryForge();
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
            const result = await forge.processFile(download.filepath);
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

        const forge = new SummaryForge();
        
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
            const result = await forge.processFile(download.filepath);
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
async function searchAndDisplay(title) {
  try {
    const spinner = ora('Searching Amazon...').start();
    const forge = new SummaryForge();
    const results = await forge.searchBookByTitle(title);
    spinner.stop();

    if (results.length === 0) {
      console.log(chalk.yellow('No results found'));
      return;
    }

    console.log(chalk.blue(`\n📚 Found ${results.length} results:\n`));
    
    const choices = results.slice(0, 10).map((book, idx) => ({
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
    const downloadSpinner = ora('Downloading from Anna\'s Archive...').start();
    try {
      const download = await forge.downloadFromAnnasArchive(selectedBook.asin, '.', selectedBook.title);
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
        const result = await forge.processFile(download.filepath);
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
      console.log(chalk.yellow(`\n💡 You can try downloading manually from:`));
      console.log(chalk.cyan(forge.getAnnasArchiveUrl(selectedBook.asin)));
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