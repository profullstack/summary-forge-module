# Summary Forge

An intelligent tool that uses OpenAI's GPT-5 to forge comprehensive summaries of technical books in multiple formats.

## Features

- 📚 **Multiple Input Formats**: Supports both PDF and EPUB files
- 🤖 **AI-Powered Summaries**: Uses GPT-5 to generate detailed, accurate summaries
- 📦 **Multiple Output Formats**: Creates Markdown, PDF, EPUB, plain text, and MP3 audio summaries
- 🗜️ **Bundled Output**: Packages everything into a convenient `.tgz` archive
- 🎙️ **Audio Summaries**: Optional text-to-speech using ElevenLabs AI
- 🔄 **Auto-Conversion**: Automatically converts EPUB to PDF using Calibre
- 🔍 **Book Search**: Search Amazon by title using Rainforest API
- 📖 **ISBN Lookup**: Find books on Anna's Archive by ISBN/ASIN
- 💻 **CLI & Module**: Use as a command-line tool or import as an ESM module
- 🎨 **Interactive Mode**: Guided workflow with inquirer prompts

## Installation

### Global Installation (CLI)

```bash
pnpm install -g summary-forge
```

### Local Installation (Module)

```bash
pnpm add summary-forge
```

## Prerequisites

1. **Node.js** v20 or newer

2. **Calibre** (for EPUB conversion - provides `ebook-convert` command)
   ```bash
   # macOS
   brew install calibre
   
   # Ubuntu/Debian
   sudo apt-get install calibre
   
   # Arch Linux
   sudo pacman -S calibre
   ```

3. **Pandoc** (for document conversion)
   ```bash
   # macOS
   brew install pandoc
   
   # Ubuntu/Debian
   sudo apt-get install pandoc
   
   # Arch Linux
   sudo pacman -S pandoc
   ```

4. **XeLaTeX** (for PDF generation)
   ```bash
   # macOS
   brew install --cask mactex
   
   # Ubuntu/Debian
   sudo apt-get install texlive-xetex
   
   # Arch Linux
   sudo pacman -S texlive-core texlive-xetex
   ```

## CLI Usage

### Interactive Mode (Recommended)

```bash
summary interactive
# or
summary i
```

This launches an interactive menu where you can:
- Process local files
- Search for books by title
- Look up books by ISBN/ASIN

### Process a File

```bash
summary file /path/to/book.pdf
summary file /path/to/book.epub
```

### Search by Title

```bash
# Direct title search
summary title "A Philosophy of Software Design"

# Or interactive search (prompts for title)
summary search
```

### Look up by ISBN/ASIN

```bash
summary isbn B075HYVHWK
```

### Help

```bash
summary --help
summary file --help
```

## Programmatic Usage

### Basic Example

```javascript
import { SummaryForge } from 'summary-forge';

// API keys from environment variables
const forge = new SummaryForge();

const result = await forge.processFile('./my-book.pdf');
console.log('Summary created:', result.archive);
```

### With Custom Options

```javascript
import { SummaryForge } from 'summary-forge';

const forge = new SummaryForge({
  openaiApiKey: 'sk-...',
  rainforestApiKey: 'your-key',
  elevenlabsApiKey: 'sk-...',  // Optional: for audio
  maxChars: 500000,  // Process more text
  maxTokens: 20000,  // Generate longer summaries
  voiceId: '21m00Tcm4TlvDq8ikWAM',  // Optional: ElevenLabs voice
  voiceSettings: {  // Optional: voice customization
    stability: 0.5,
    similarity_boost: 0.75
  }
});

const result = await forge.processFile('./book.epub');
console.log('Files:', result.files);
console.log('Archive:', result.archive);
```

### Search for Books

```javascript
const forge = new SummaryForge({
  openaiApiKey: process.env.OPENAI_API_KEY,
  rainforestApiKey: process.env.RAINFOREST_API_KEY
});

const results = await forge.searchBookByTitle('Clean Code');
console.log('Found:', results.map(b => ({
  title: b.title,
  author: b.author,
  asin: b.asin
})));

// Get download URL
const url = forge.getAnnasArchiveUrl(results[0].asin);
console.log('Download from:', url);
```

### API Reference

#### Constructor Options

```javascript
new SummaryForge({
  openaiApiKey: string,      // Required: OpenAI API key
  rainforestApiKey: string,  // Optional: For title search
  elevenlabsApiKey: string,  // Optional: For audio generation
  maxChars: number,          // Optional: Max chars to process (default: 400000)
  maxTokens: number,         // Optional: Max tokens in summary (default: 16000)
  voiceId: string,           // Optional: ElevenLabs voice ID (default: Rachel)
  voiceSettings: object      // Optional: Voice customization settings
})
```

#### Methods

- `processFile(filePath)` - Process a PDF or EPUB file
  - Returns: `{ basename, markdown, files, archive, hasAudio }`

- `searchBookByTitle(title)` - Search Amazon for books
  - Returns: Array of book results

- `getAnnasArchiveUrl(asin)` - Get Anna's Archive URL
  - Returns: String URL

- `downloadFromAnnasArchive(asin, outputDir)` - Download book from Anna's Archive
  - Returns: `{ filepath, directory, filename, title }`

- `convertEpubToPdf(epubPath)` - Convert EPUB to PDF
  - Returns: String path to PDF

- `extractPdfText(pdfPath)` - Extract text from PDF
  - Returns: String text content

- `generateSummary(pdfText)` - Generate AI summary
  - Returns: String markdown summary

## Environment Variables

Create a `.env` file in your project root:

```env
OPENAI_API_KEY=sk-your-key-here
RAINFOREST_API_KEY=your-key-here
ELEVENLABS_API_KEY=sk-your-key-here  # Optional: for audio generation
```

Or set them in your shell:

```bash
export OPENAI_API_KEY=sk-your-key-here
export RAINFOREST_API_KEY=your-key-here
export ELEVENLABS_API_KEY=sk-your-key-here  # Optional
```

### Audio Generation

Audio generation is **optional** and requires an ElevenLabs API key. If the key is not provided, the tool will skip audio generation and only create text-based outputs.

**Features:**
- Uses ElevenLabs Turbo v2.5 model (optimized for audiobooks)
- Default voice: Brian (best for technical content, customizable)
- Automatically truncates long texts to fit API limits
- Generates high-quality MP3 audio files

## Output

The tool generates:

- `<book_name>_summary.md` - Markdown summary
- `<book_name>_summary.txt` - Plain text summary
- `<book_name>_summary.pdf` - PDF summary with table of contents
- `<book_name>_summary.epub` - EPUB summary with clickable TOC
- `<book_name>_summary.mp3` - Audio summary (if ElevenLabs key provided)
- `<book_name>.pdf` - Original or converted PDF
- `<book_name>.epub` - Original EPUB (if input was EPUB)
- `<book_name>_bundle.tgz` - Compressed archive containing all files

## Example Workflow

```bash
# 1. Search for a book
summary search
# Enter: "A Philosophy of Software Design"
# Select from results, get ASIN

# 2. Download and process automatically
summary isbn B075HYVHWK
# Downloads, asks if you want to process
# Creates summary bundle automatically!

# Alternative: Process a local file
summary file ~/Downloads/book.epub
```

## How It Works

1. **Input Processing**: Accepts PDF or EPUB files (EPUB is converted to PDF)
2. **Text Extraction**: Uses `pdf-parse` to extract text from the PDF
3. **AI Summarization**: Sends the text to GPT-5 with detailed instructions
4. **Format Conversion**: Uses Pandoc to convert the Markdown summary to PDF and EPUB
5. **Bundling**: Creates a compressed archive with all generated files

## Testing

Summary Forge includes a comprehensive test suite using Vitest.

### Run Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage report
pnpm test:coverage
```

### Test Coverage

The test suite includes:
- ✅ 28 passing tests
- Constructor validation
- Helper method tests
- API integration tests
- Error handling tests
- Edge case coverage
- File operation tests

See [`test/summary-forge.test.js`](test/summary-forge.test.js) for the complete test suite.

## Examples

See the [`examples/`](examples/) directory for more usage examples:

- [`programmatic-usage.js`](examples/programmatic-usage.js) - Using as a module

## Limitations

- Maximum PDF text length: 400,000 characters (~100k tokens)
- GPT-5 uses default temperature of 1 (not configurable)
- Requires external tools: Calibre, Pandoc, XeLaTeX
- Anna's Archive downloads are manual (automatic download not yet implemented)

## Roadmap

- [x] ISBN/ASIN lookup via Anna's Archive (manual download)
- [x] Book title search via Rainforest API
- [x] CLI with interactive mode
- [x] ESM module for programmatic use
- [x] Audio generation with ElevenLabs TTS
- [ ] Automatic download from Anna's Archive
- [ ] Support for more input formats (MOBI, AZW3)
- [ ] Chunked processing for very large books
- [ ] Custom summary templates
- [ ] Web interface
- [ ] Multiple voice options for audio
- [ ] Audio chapter markers

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.