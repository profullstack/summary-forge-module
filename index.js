#!/usr/bin/env node
/**
 * Summary Forge
 *
 * Usage:
 *   node index.js /path/to/book.pdf
 *   node index.js /path/to/book.epub
 *   node index.js --isbn 173210221X
 *   node index.js --title "Book Title"
 *
 * Outputs:
 *   <book_name>_summary.md
 *   <book_name>_summary.pdf
 *   <book_name>_summary.txt
 *   <book_name>_summary.epub
 *   <book_name>.pdf (original or converted)
 *   <book_name>.epub (if converted from epub)
 *   <book_name>_bundle.tgz (all of the above)
 */

import "dotenv/config";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import https from "node:https";
import { pipeline } from "node:stream/promises";

const API_MODEL = "gpt-5"; // latest GPT-5 model
const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY;

// Helper to create a clean filename from PDF name
function sanitizeFilename(filename) {
  return filename
    .replace(/\.pdf$/i, '') // Remove .pdf extension
    .replace(/\.epub$/i, '') // Remove .epub extension
    .replace(/[^a-z0-9]+/gi, '_') // Replace non-alphanumeric with underscore
    .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
    .toLowerCase();
}

// --- helpers ---
function sh(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function fileExists(p) {
  try { await fsp.access(p, fs.constants.F_OK); return true; } catch { return false; }
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = { mode: 'file', value: null };
  
  if (args.length === 0) {
    fail("Usage: node index.js <file.pdf|file.epub> OR --isbn <isbn> OR --title <book title>");
  }
  
  if (args[0] === '--isbn') {
    if (!args[1]) fail("--isbn requires an ISBN number");
    result.mode = 'isbn';
    result.value = args[1];
  } else if (args[0] === '--title') {
    if (!args[1]) fail("--title requires a book title");
    result.mode = 'title';
    result.value = args.slice(1).join(' ');
  } else {
    result.mode = 'file';
    result.value = path.resolve(args[0]);
    if (!fs.existsSync(result.value)) fail(`File not found: ${result.value}`);
  }
  
  return result;
}

// HTTP GET helper
async function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Failed to parse JSON: ${err.message}`));
        }
      });
    }).on('error', reject);
  });
}

// Download file from URL
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Follow redirect
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(destPath);
      });
      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

// Search for book on Amazon using Rainforest API
async function searchBookByTitle(title) {
  if (!RAINFOREST_API_KEY) {
    fail("RAINFOREST_API_KEY env var is required for title search.");
  }
  
  console.log(`🔍 Searching for "${title}" on Amazon...`);
  const searchUrl = `https://api.rainforestapi.com/request?api_key=${RAINFOREST_API_KEY}&type=search&amazon_domain=amazon.com&search_term=${encodeURIComponent(title)}`;
  
  try {
    const data = await httpGet(searchUrl);
    
    if (!data.search_results || data.search_results.length === 0) {
      fail(`No results found for "${title}"`);
    }
    
    return data.search_results;
  } catch (err) {
    fail(`Failed to search Amazon: ${err.message}`);
  }
}

// Search Anna's Archive for book by ASIN
async function searchAnnasArchive(asin) {
  console.log(`📚 Searching Anna's Archive for ASIN: ${asin}...`);
  const searchUrl = `https://annas-archive.org/search?index=&page=1&sort=&ext=epub&acc=external_download&display=list_compact&q=${asin}`;
  
  console.log(`🌐 Visit this URL to download: ${searchUrl}`);
  console.log(`⚠️  Automatic download from Anna's Archive is not implemented yet.`);
  console.log(`   Please download the EPUB manually and run:`);
  console.log(`   node index.js /path/to/downloaded/book.epub`);
  
  fail("Manual download required. See instructions above.");
}

// Convert EPUB to PDF using ebook-convert (from Calibre)
async function convertEpubToPdf(epubPath) {
  const pdfPath = epubPath.replace(/\.epub$/i, '.pdf');
  console.log(`📚 Converting EPUB to PDF using ebook-convert...`);
  
  try {
    await sh('ebook-convert', [epubPath, pdfPath]);
    console.log(`✅ Converted to ${pdfPath}`);
    return pdfPath;
  } catch (err) {
    fail(`Failed to convert EPUB to PDF. Make sure Calibre is installed (ebook-convert command). Error: ${err.message}`);
  }
}

// --- arg parsing ---
if (!process.env.OPENAI_API_KEY) fail("OPENAI_API_KEY env var is required.");

const args = parseArgs();
let originalFilePath;
let originalPdfPath;
let OUT_BASENAME;
let SUMMARY_BASE;
let SUMMARY_MD;
let SUMMARY_TXT;
let SUMMARY_PDF;
let SUMMARY_EPUB;
let RENAMED_ORIG;
let RENAMED_EPUB;
let ARCHIVE;

// Handle different input modes
if (args.mode === 'isbn' || args.mode === 'asin') {
  // Search Anna's Archive for the ISBN/ASIN
  await searchAnnasArchive(args.value);
} else if (args.mode === 'title') {
  // Search Amazon for the book title
  const results = await searchBookByTitle(args.value);
  
  console.log(`\n📚 Found ${results.length} results:\n`);
  results.slice(0, 10).forEach((book, idx) => {
    console.log(`${idx + 1}. ${book.title}`);
    console.log(`   Author: ${book.author || 'Unknown'}`);
    console.log(`   ASIN: ${book.asin}`);
    console.log(`   Price: ${book.price?.raw || 'N/A'}`);
    console.log('');
  });
  
  if (results.length > 1) {
    console.log(`\n💡 Multiple results found. To download a specific book, use:`);
    console.log(`   node index.js --isbn <ASIN>`);
    console.log(`\nFor example, for the first result:`);
    console.log(`   node index.js --isbn ${results[0].asin}`);
    process.exit(0);
  } else {
    // Only one result, proceed with it
    await searchAnnasArchive(results[0].asin);
  }
} else {
  // File mode
  originalFilePath = args.value;
  const ext = path.extname(originalFilePath).toLowerCase();
  
  if (ext === '.epub') {
    console.log(`📖 Input: EPUB file`);
    originalPdfPath = await convertEpubToPdf(originalFilePath);
    RENAMED_EPUB = sanitizeFilename(path.basename(originalFilePath, '.epub')) + '.epub';
  } else if (ext === '.pdf') {
    console.log(`📖 Input: PDF file`);
    originalPdfPath = originalFilePath;
    RENAMED_EPUB = null;
  } else {
    fail(`Unsupported file type: ${ext}. Only .pdf and .epub are supported.`);
  }
  
  // Generate filenames based on input file name
  const fileBasename = path.basename(originalFilePath);
  OUT_BASENAME = sanitizeFilename(fileBasename);
  SUMMARY_BASE = `${OUT_BASENAME}_summary`;
  SUMMARY_MD = `${SUMMARY_BASE}.md`;
  SUMMARY_TXT = `${SUMMARY_BASE}.txt`;
  SUMMARY_PDF = `${SUMMARY_BASE}.pdf`;
  SUMMARY_EPUB = `${SUMMARY_BASE}.epub`;
  RENAMED_ORIG = `${OUT_BASENAME}.pdf`;
  ARCHIVE = `${OUT_BASENAME}_bundle.tgz`;
  
  console.log(`📝 Output basename: ${OUT_BASENAME}`);
  console.log(`📦 Bundle will be: ${ARCHIVE}`);
}

// --- OpenAI client ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- main ---
(async () => {
  console.log("📖 Extracting text from PDF…");
  const pdfBuffer = await fsp.readFile(originalPdfPath);
  const pdfData = await pdfParse(pdfBuffer);
  const pdfText = pdfData.text;
  
  if (!pdfText || pdfText.trim().length < 100) {
    fail("PDF appears to be empty or unreadable.");
  }
  
  console.log(`✅ Extracted ${pdfText.length} characters from PDF`);

  // Compose a robust prompt that yields ONE Markdown document only
  const systemPrompt = [
    "You are an expert technical writer. Produce a single, self-contained Markdown file.",
    "Source: the attached PDF. Do not hallucinate; pull claims from the PDF.",
    "Goal: Let a reader skip the book but learn the principles.",
    "Requirements:",
    "- Title and author at top.",
    "- Sections: Preface; Ch1..Ch22; Quick-Reference tables of principles and red flags; Final takeaways.",
    "- Keep all graphics as ASCII (code fences) for diagrams/curves;",
    "  preserve tables in Markdown.",
    "- No external images or links.",
    "- Write concisely but completely. Use headers, lists, and code-fenced ASCII diagrams.",
  ].join("\n");

  const userPrompt = [
    "Read the attached PDF and produce the full Markdown summary described above.",
    "Output ONLY Markdown content (no JSON, no preambles).",
  ].join("\n");

  console.log("🧠 Asking the model to generate the Markdown summary…");
  
  // Split text into chunks if it's too long (GPT-5 has large context)
  const maxChars = 400000; // ~100k tokens worth of text
  let textToSend = pdfText;
  
  if (pdfText.length > maxChars) {
    console.log(`⚠️  PDF text is ${pdfText.length} chars, truncating to ${maxChars} chars`);
    textToSend = pdfText.slice(0, maxChars);
  }
  
  const resp = await openai.chat.completions.create({
    model: API_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${userPrompt}\n\n--- PDF CONTENT ---\n${textToSend}`
      },
    ],
    // GPT-5 only supports default temperature of 1
    max_completion_tokens: 16000, // GPT-5 uses max_completion_tokens instead of max_tokens
  });

  const md = resp.choices[0]?.message?.content ?? "";
  if (!md || md.trim().length < 200) fail("Model returned unexpectedly short content (guarding against empty output).");

  await fsp.writeFile(SUMMARY_MD, md, "utf8");
  await fsp.writeFile(SUMMARY_TXT, md, "utf8");
  console.log(`✅ Wrote ${SUMMARY_MD} and ${SUMMARY_TXT}`);

  // Copy/rename original files to requested filenames
  if (path.basename(originalPdfPath) !== RENAMED_ORIG) {
    await fsp.copyFile(originalPdfPath, RENAMED_ORIG);
    console.log(`✅ Saved PDF as ${RENAMED_ORIG}`);
  } else {
    console.log("ℹ️ PDF already named correctly.");
  }
  
  // If we converted from EPUB, also save the original EPUB
  if (RENAMED_EPUB && originalFilePath !== RENAMED_EPUB) {
    await fsp.copyFile(originalFilePath, RENAMED_EPUB);
    console.log(`✅ Saved EPUB as ${RENAMED_EPUB}`);
  }

  // --- Pandoc conversions ---
  console.log("🛠️ Rendering PDF via pandoc (with TOC, metadata) …");
  await sh("pandoc", [
    SUMMARY_MD,
    "-o", SUMMARY_PDF,
    "--standalone",
    "--toc",
    "--metadata", `title=${OUT_BASENAME.replace(/_/g, ' ')} (Summary)`,
    "--metadata", `author=Summary by OpenAI GPT-5`,
    "--metadata", `date=` + new Date().toISOString().slice(0,10),
    "--pdf-engine=xelatex"
  ]);

  console.log("🛠️ Rendering EPUB (clickable TOC)…");
  await sh("pandoc", [
    SUMMARY_MD,
    "-o", SUMMARY_EPUB,
    "--standalone",
    "--toc",
  ]);

  // --- Package ---
  console.log("📦 Creating tar.gz bundle…");
  const files = [SUMMARY_MD, SUMMARY_TXT, SUMMARY_PDF, SUMMARY_EPUB, RENAMED_ORIG];
  if (RENAMED_EPUB) files.push(RENAMED_EPUB);
  
  for (const f of files) if (!(await fileExists(f))) fail(`Missing expected output: ${f}`);

  await sh("tar", ["-czvf", ARCHIVE, ...files]);
  console.log(`\n✅ Done: ${ARCHIVE}\n`);
  console.log(`📚 Bundle contains: ${files.join(', ')}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
