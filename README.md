# Summary Forge Module

An intelligent tool that uses OpenAI's GPT-5 to forge comprehensive summaries of ebooks in multiple formats.

**Repository:** [git@github.com:profullstack/summary-forge-module.git](https://github.com/profullstack/summary-forge-module)

## Features

- 📚 **Multiple Input Formats**: Supports both PDF and EPUB files
- 🤖 **AI-Powered Summaries**: Uses GPT-5 with direct PDF upload for better quality
- 📊 **Vision API**: Preserves formatting, tables, diagrams, and images from PDFs
- 🧩 **Intelligent Chunking**: Automatically processes large PDFs (500+ pages) without truncation
- 🛡️ **Directory Protection**: Prompts before overwriting existing summaries (use --force to skip)
- 📦 **Multiple Output Formats**: Creates Markdown, PDF, EPUB, plain text, and MP3 audio summaries
- 🃏 **Printable Flashcards**: Generates double-sided flashcard PDFs for studying
- 🎙️ **Natural Audio Narration**: AI-generated conversational audio script for better listening
- 🗜️ **Bundled Output**: Packages everything into a convenient `.tgz` archive
- 🔄 **Auto-Conversion**: Automatically converts EPUB to PDF using Calibre
- 🔍 **Book Search**: Search Amazon by title using Rainforest API
- 📖 **Auto-Download**: Downloads books from Anna's Archive with CAPTCHA solving
- 💻 **CLI & Module**: Use as a command-line tool or import as an ESM module
- 🎨 **Interactive Mode**: Guided workflow with inquirer prompts
- 📥 **EPUB Priority**: Automatically prefers EPUB format (open standard, more flexible)

## Installation

### Global Installation (CLI)

```bash
pnpm install -g @profullstack/summary-forge-module
```

### Local Installation (Module)

```bash
pnpm add @profullstack/summary-forge-module
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

### First-Time Setup

Before using the CLI, configure your API keys:

```bash
summary setup
```

This interactive command will prompt you for:
- **OpenAI API Key** (required)
- **Rainforest API Key** (optional - for Amazon book search)
- **ElevenLabs API Key** (optional - for audio generation, [get key here](https://try.elevenlabs.io/oh7kgotrpjnv))
- **2Captcha API Key** (optional - for CAPTCHA solving, [sign up here](https://2captcha.com/?from=9630996))
- **Browserless API Key** (optional)
- Browser and proxy settings

Configuration is saved to `~/.config/summary-forge/settings.json` and used automatically by all CLI commands.

### Managing Configuration

```bash
# View current configuration
summary config

# Update configuration
summary setup

# Delete configuration
summary config --delete
```

**Note:** The CLI will use configuration in this priority order:
1. Environment variables (`.env` file)
2. Configuration file (`~/.config/summary-forge/settings.json`)

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

# Force overwrite if directory already exists
summary file /path/to/book.pdf --force
summary file /path/to/book.pdf -f
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

# Force overwrite if directory already exists
summary isbn B075HYVHWK --force
summary isbn B075HYVHWK -f
```

### Help

```bash
summary --help
summary file --help
```

## Programmatic Usage

### Basic Example

```javascript
import { SummaryForge } from '@profullstack/summary-forge-module';
import { loadConfig } from '@profullstack/summary-forge-module/config';

// Load config from ~/.config/summary-forge/settings.json
const config = await loadConfig();
const forge = new SummaryForge(config);

const result = await forge.processFile('./my-book.pdf');
console.log('Summary created:', result.archive);
```

### Configuration Options

```javascript
import { SummaryForge } from '@profullstack/summary-forge-module';

const forge = new SummaryForge({
  // Required
  openaiApiKey: 'sk-...',
  
  // Optional API keys
  rainforestApiKey: 'your-key',      // For Amazon search
  elevenlabsApiKey: 'sk-...',        // For audio generation (get key: https://try.elevenlabs.io/oh7kgotrpjnv)
  twocaptchaApiKey: 'your-key',      // For CAPTCHA solving (sign up: https://2captcha.com/?from=9630996)
  browserlessApiKey: 'your-key',     // For browserless.io
  
  // Processing options
  maxChars: 500000,                  // Max chars to process
  maxTokens: 20000,                  // Max tokens in summary
  
  // Audio options
  voiceId: '21m00Tcm4TlvDq8ikWAM',  // ElevenLabs voice
  voiceSettings: {
    stability: 0.5,
    similarity_boost: 0.75
  },
  
  // Browser options
  headless: true,                    // Run browser in headless mode
  enableProxy: false,                // Enable proxy
  proxyUrl: 'http://proxy.com',     // Proxy URL
  proxyUsername: 'user',             // Proxy username
  proxyPassword: 'pass',             // Proxy password
  proxyPoolSize: 36                  // Number of proxies in pool (default: 36)
});

const result = await forge.processFile('./book.epub');
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
  // API Keys
  openaiApiKey: string,      // Required: OpenAI API key
  rainforestApiKey: string,  // Optional: For title search
  elevenlabsApiKey: string,  // Optional: For audio generation
  twocaptchaApiKey: string,  // Optional: For CAPTCHA solving
  browserlessApiKey: string, // Optional: For browserless.io
  
  // Processing Options
  maxChars: number,          // Optional: Max chars to process (default: 400000)
  maxTokens: number,         // Optional: Max tokens in summary (default: 16000)
  
  // Audio Options
  voiceId: string,           // Optional: ElevenLabs voice ID (default: Brian)
  voiceSettings: object,     // Optional: Voice customization settings
  
  // Browser Options
  headless: boolean,         // Optional: Run browser in headless mode (default: true)
  enableProxy: boolean,      // Optional: Enable proxy (default: false)
  proxyUrl: string,          // Optional: Proxy URL
  proxyUsername: string,     // Optional: Proxy username
  proxyPassword: string,     // Optional: Proxy password
  proxyPoolSize: number      // Optional: Number of proxies in pool (default: 36)
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

- `generateSummary(pdfPath)` - Generate AI summary from PDF using vision API with intelligent chunking
  - Parameters: `pdfPath` (string) - Path to PDF file
  - Returns: String markdown summary
  - Features:
    - **Direct PDF Upload**: Tries OpenAI's vision API first for best quality
    - **Intelligent Chunking**: Automatically chunks large PDFs (>400k chars) for complete processing
    - **Quality Preservation**: Each chunk is summarized separately, then synthesized into a cohesive final summary
    - **No Truncation**: Processes entire books (500+ pages) without losing content
    - **Adaptive**: Small PDFs processed in one request, large PDFs automatically chunked

## Configuration

### CLI Configuration (Recommended)

For CLI usage, run the setup command to configure your API keys:

```bash
summary setup
```

This saves your configuration to `~/.config/summary-forge/settings.json` so you don't need to manage environment variables.

### Environment Variables (Alternative)

For programmatic usage or if you prefer environment variables, create a `.env` file:

```env
OPENAI_API_KEY=sk-your-key-here
RAINFOREST_API_KEY=your-key-here
ELEVENLABS_API_KEY=sk-your-key-here  # Optional: for audio generation
TWOCAPTCHA_API_KEY=your-key-here      # Optional: for CAPTCHA solving
BROWSERLESS_API_KEY=your-key-here     # Optional

# Browser Configuration
HEADLESS=true                          # Run browser in headless mode
ENABLE_PROXY=false                     # Enable proxy for browser requests
PROXY_URL=http://proxy.example.com    # Proxy URL (if enabled)
PROXY_USERNAME=username                # Proxy username (if enabled)
PROXY_PASSWORD=password                # Proxy password (if enabled)
PROXY_POOL_SIZE=36                     # Number of proxies in your pool (default: 36)
```

Or set them in your shell:

```bash
export OPENAI_API_KEY=sk-your-key-here
export RAINFOREST_API_KEY=your-key-here
export ELEVENLABS_API_KEY=sk-your-key-here  # Optional
```

### Configuration Priority

When using the module programmatically, configuration is loaded in this order (highest priority first):

1. **Constructor options** - Passed directly to `new SummaryForge(options)`
2. **Environment variables** - From `.env` file or shell
3. **Config file** - From `~/.config/summary-forge/settings.json` (CLI only)

### Proxy Configuration (Recommended for Anna's Archive)

To avoid IP bans when downloading from Anna's Archive, configure a proxy during setup:

```bash
summary setup
```

When prompted:
1. Enable proxy: `Yes`
2. Enter proxy URL: `http://your-proxy.com:8080`
3. Enter proxy username and password

**Why use a proxy?**
- ✅ Avoids IP bans from Anna's Archive
- ✅ USA-based proxies prevent geo-location issues
- ✅ Works with both browser navigation and file downloads
- ✅ Automatically applied to all download operations

**Recommended Proxy Service:**

We recommend [Webshare.io](https://www.webshare.io/?referral_code=wwry9z1eiyjg) for reliable, USA-based proxies:
- 🌎 USA-based IPs (no geo-location issues)
- ⚡ Fast and reliable
- 💰 Affordable pricing with free tier
- 🔒 HTTP/HTTPS/SOCKS5 support

**Important: Use Static Proxies for Sticky Sessions**

For Anna's Archive downloads, you need a **static/direct proxy** (not rotating) to maintain the same IP:

1. In your Webshare dashboard, go to **Proxy** → **List**
2. Copy a **Static Proxy** endpoint (not the rotating endpoint)
3. Use the format: `http://host:port` (e.g., `http://45.95.96.132:8080`)
4. Username format: `dmdgluqz-US-{session_id}` (session ID added automatically)

The tool automatically generates a unique session ID (1 to `PROXY_POOL_SIZE`) for each download to get a fresh IP, while maintaining that IP throughout the 5-10 minute download process.

**Proxy Pool Size Configuration:**

Set `PROXY_POOL_SIZE` to match your Webshare plan (default: 36):
- Free tier: 10 proxies → `PROXY_POOL_SIZE=10`
- Starter plan: 25 proxies → `PROXY_POOL_SIZE=25`
- Professional plan: 100 proxies → `PROXY_POOL_SIZE=100`
- Enterprise plan: 250+ proxies → `PROXY_POOL_SIZE=250`

The tool will randomly select a session ID from 1 to your pool size, distributing load across all available proxies.

**Smart ISBN Detection:**

When searching Anna's Archive, the tool automatically detects whether an identifier is a real ISBN or an Amazon ASIN:
- **Real ISBNs** (10 or 13 numeric digits): Searches by ISBN for precise results
- **Amazon ASINs** (alphanumeric): Searches by book title instead for better results
- This ensures you get relevant search results even when Amazon returns proprietary ASINs instead of standard ISBNs

**Note:** Rotating proxies (`p.webshare.io`) don't support sticky sessions. Use individual static proxy IPs from your proxy list instead.

**Testing your proxy:**
```bash
node test-proxy.js <ASIN>
```

This will verify your proxy configuration by attempting to download a book.

### Audio Generation

Audio generation is **optional** and requires an [ElevenLabs](https://try.elevenlabs.io/oh7kgotrpjnv) API key. If the key is not provided, the tool will skip audio generation and only create text-based outputs.

**Get ElevenLabs API Key:** [Sign up here](https://try.elevenlabs.io/oh7kgotrpjnv) for high-quality text-to-speech.

**Features:**
- Uses ElevenLabs Turbo v2.5 model (optimized for audiobooks)
- Default voice: Brian (best for technical content, customizable)
- Automatically truncates long texts to fit API limits
- Generates high-quality MP3 audio files
- Natural, conversational narration style

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
2. **Smart Processing Strategy**:
   - **Small PDFs (<400k chars)**: Direct upload to OpenAI's vision API
   - **Large PDFs (>400k chars)**: Intelligent chunking with synthesis
3. **AI Summarization**: GPT-5 analyzes content with full formatting, tables, and diagrams
4. **Format Conversion**: Uses Pandoc to convert the Markdown summary to PDF and EPUB
5. **Audio Generation**: Optional TTS conversion using ElevenLabs
6. **Bundling**: Creates a compressed archive with all generated files

### Intelligent Chunking for Large PDFs

For PDFs exceeding 400,000 characters (typically 500+ pages), the tool automatically uses an intelligent chunking strategy:

**How it works:**
1. **Analysis**: Calculates optimal chunk size based on PDF statistics
2. **Page-Based Chunking**: Splits PDF into logical chunks (typically 50-150k chars each)
3. **Parallel Processing**: Each chunk is summarized independently by GPT-5
4. **Intelligent Synthesis**: All chunk summaries are combined into a cohesive final summary
5. **Quality Preservation**: Maintains narrative flow and eliminates redundancy

**Benefits:**
- ✅ **Complete Coverage**: Processes entire books without truncation
- ✅ **High Quality**: Each section gets full AI attention
- ✅ **Seamless Output**: Final summary reads as a unified document
- ✅ **Cost Efficient**: Optimizes token usage across multiple API calls
- ✅ **Automatic**: No configuration needed - works transparently

**Example Output:**
```
📊 PDF Stats: 523 pages, 1,245,678 chars, ~311,420 tokens
📚 PDF is large - using intelligent chunking strategy
   This will process the ENTIRE 523-page PDF without truncation
📐 Using chunk size: 120,000 chars
📦 Created 11 chunks for processing
   Chunk 1: Pages 1-48 (119,234 chars)
   Chunk 2: Pages 49-95 (118,901 chars)
   ...
✅ All 11 chunks processed successfully
🔄 Synthesizing chunk summaries into final comprehensive summary...
✅ Final summary synthesized: 45,678 characters
```

### Why Direct PDF Upload?

The tool prioritizes OpenAI's vision API for direct PDF upload when possible:

- ✅ **Better Quality**: Preserves document formatting, tables, and diagrams
- ✅ **More Accurate**: AI can see the actual PDF layout and structure
- ✅ **Better for Technical Books**: Code examples and diagrams are preserved
- ✅ **Fallback Strategy**: Automatically switches to intelligent chunking for large files

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
- ✅ 30+ passing tests
- Constructor validation
- Helper method tests
- PDF upload functionality tests
- API integration tests
- Error handling tests
- Edge case coverage
- File operation tests

See [`test/summary-forge.test.js`](test/summary-forge.test.js) for the complete test suite.

## Examples

See the [`examples/`](examples/) directory for more usage examples:

- [`programmatic-usage.js`](examples/programmatic-usage.js) - Using as a module

## Troubleshooting

### IP Bans from Anna's Archive

If you're getting blocked by Anna's Archive:

1. **Enable proxy** in your configuration:
   ```bash
   summary setup
   ```
   
2. **Use a USA-based proxy** to avoid geo-location issues

3. **Test your proxy** before downloading:
   ```bash
   node test-proxy.js B0BCTMXNVN
   ```

4. **Run browser in visible mode** to debug:
   ```bash
   summary config --headless false
   ```

### Proxy Configuration

The proxy is used for:
- ✅ Browser navigation (Puppeteer)
- ✅ File downloads (fetch with https-proxy-agent)
- ✅ All HTTP requests to Anna's Archive

Supported proxy formats:
- `http://proxy.example.com:8080`
- `https://proxy.example.com:8080`
- `socks5://proxy.example.com:1080`
- `http://proxy.example.com:8080-session-<SESSION_ID>` (sticky session)

**Recommended Service:** [Webshare.io](https://www.webshare.io/?referral_code=wwry9z1eiyjg) - Reliable USA-based proxies with free tier available.

**Webshare Sticky Sessions:**
Add `-session-<YOUR_SESSION_ID>` to your proxy URL to maintain the same IP:
```
http://p.webshare.io:80-session-myapp123
```

## CAPTCHA Solving

When downloading from Anna's Archive, you may encounter CAPTCHAs. To automatically solve them:

1. **Sign up for 2Captcha**: [Get API key here](https://2captcha.com/?from=9630996)
2. **Add to configuration**:
   ```bash
   summary setup
   ```
3. **Enter your 2Captcha API key** when prompted

The tool will automatically detect and solve CAPTCHAs during downloads, making the process fully automated.

## Limitations

- Maximum PDF file size: No practical limit (intelligent chunking handles any size)
- GPT-5 uses default temperature of 1 (not configurable)
- Requires external tools: Calibre, Pandoc, XeLaTeX
- CAPTCHA solving requires [2captcha.com](https://2captcha.com/?from=9630996) API key (optional)
- Very large PDFs (1000+ pages) may incur higher API costs due to multiple chunk processing
- Anna's Archive may block IPs without proxy configuration
- Chunked processing uses text extraction (images/diagrams described in text only)

## Roadmap

- [x] ISBN/ASIN lookup via Anna's Archive
- [x] Automatic download from Anna's Archive with CAPTCHA solving
- [x] Book title search via Rainforest API
- [x] CLI with interactive mode
- [x] ESM module for programmatic use
- [x] Audio generation with ElevenLabs TTS
- [x] Direct PDF upload to OpenAI vision API
- [x] EPUB format prioritization (open standard)
- [ ] Support for more input formats (MOBI, AZW3)
- [ ] Chunked processing for very large books (>100MB)
- [ ] Custom summary templates
- [ ] Web interface
- [ ] Multiple voice options for audio
- [ ] Audio chapter markers
- [ ] Batch processing multiple books

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.