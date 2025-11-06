#!/bin/bash

# Batch process books from titles.txt
# Each line should contain a book title

set -e  # Exit on error

# Check if titles.txt exists
if [ ! -f "titles.txt" ]; then
  echo "❌ Error: titles.txt not found"
  exit 1
fi

# Count total books
total=$(wc -l < titles.txt)
current=0

echo "📚 Processing $total books from titles.txt"
echo ""

# Read each line and process
while IFS= read -r title || [ -n "$title" ]; do
  # Skip empty lines
  if [ -z "$title" ]; then
    continue
  fi
  
  current=$((current + 1))
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📖 Processing book $current/$total: $title"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  # Run summary command with --force flag
  if summary title --force "$title"; then
    echo ""
    echo "✅ Successfully processed: $title"
    echo ""
  else
    echo ""
    echo "⚠️  Failed to process: $title"
    echo "   Continuing with next book..."
    echo ""
  fi
  
  # Add a delay between books to avoid rate limiting
  if [ $current -lt $total ]; then
    echo "⏳ Waiting 30 seconds before next book..."
    sleep 30
  fi
done < titles.txt

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Batch processing complete!"
echo "   Processed: $current/$total books"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"