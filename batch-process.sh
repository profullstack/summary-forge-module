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
success=0
failed=0

# Cost tracking variables
total_openai=0
total_elevenlabs=0
total_rainforest=0
total_cost=0

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
  
  # Run summary command with --force flag and capture output
  output=$(summary title --force "$title" 2>&1)
  exit_code=$?
  
  echo "$output"
  
  if [ $exit_code -eq 0 ]; then
    echo ""
    echo "✅ Successfully processed: $title"
    success=$((success + 1))
    
    # Extract costs from output
    openai=$(echo "$output" | grep -oP 'OpenAI \(GPT-5\):\s+\K\$[\d.]+' | tr -d '$' || echo "0")
    elevenlabs=$(echo "$output" | grep -oP 'ElevenLabs \(TTS\):\s+\K\$[\d.]+' | tr -d '$' || echo "0")
    rainforest=$(echo "$output" | grep -oP 'Rainforest API:\s+\K\$[\d.]+' | tr -d '$' || echo "0")
    
    # Add to totals using bc for floating point math
    total_openai=$(echo "$total_openai + $openai" | bc)
    total_elevenlabs=$(echo "$total_elevenlabs + $elevenlabs" | bc)
    total_rainforest=$(echo "$total_rainforest + $rainforest" | bc)
    
    echo ""
  else
    echo ""
    echo "⚠️  Failed to process: $title"
    echo "   Continuing with next book..."
    failed=$((failed + 1))
    echo ""
  fi
  
  # Add a delay between books to avoid rate limiting
  if [ $current -lt $total ]; then
    echo "⏳ Waiting 30 seconds before next book..."
    sleep 30
  fi
done < titles.txt

# Calculate total cost
total_cost=$(echo "$total_openai + $total_elevenlabs + $total_rainforest" | bc)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Batch processing complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Summary:"
echo "   Total books:        $total"
echo "   Successful:         $success"
echo "   Failed:             $failed"
echo ""
echo "💰 Total Costs:"
echo "   OpenAI (GPT-5):     \$$total_openai"
echo "   ElevenLabs (TTS):   \$$total_elevenlabs"
echo "   Rainforest API:     \$$total_rainforest"
echo "   ─────────────────────────────"
echo "   TOTAL:              \$$total_cost"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"