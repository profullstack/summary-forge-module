#!/bin/bash

# Batch process books from titles.txt
# Each line should contain a book title

set -e  # Exit on error

# Setup logging
LOG_FILE="/tmp/summary-forge-batch-$(date +%Y%m%d-%H%M%S).log"
echo "📝 Logging to: $LOG_FILE"

# Function to log to both stdout and file
log() {
  echo "$@" | tee -a "$LOG_FILE"
}

# Check if titles.txt exists
if [ ! -f "titles.txt" ]; then
  log "❌ Error: titles.txt not found"
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

log "📚 Processing $total books from titles.txt"
log "📝 Log file: $LOG_FILE"
log ""

# Read each line and process
while IFS= read -r title || [ -n "$title" ]; do
  # Skip empty lines
  if [ -z "$title" ]; then
    continue
  fi
  
  current=$((current + 1))
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "📖 Processing book $current/$total: $title"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log ""
  
  # Run summary command with --force flag and capture output
  # Use tee to write to both stdout and log file
  output=$(summary title --force "$title" 2>&1 | tee -a "$LOG_FILE")
  exit_code=${PIPESTATUS[0]}
  
  if [ $exit_code -eq 0 ]; then
    log ""
    log "✅ Successfully processed: $title"
    success=$((success + 1))
    
    # Extract costs from output (handle empty values gracefully)
    openai=$(echo "$output" | grep -oP 'OpenAI \(GPT-5\):\s+\K\$[\d.]+' | tr -d '$' || echo "0")
    elevenlabs=$(echo "$output" | grep -oP 'ElevenLabs \(TTS\):\s+\K\$[\d.]+' | tr -d '$' || echo "0")
    rainforest=$(echo "$output" | grep -oP 'Rainforest API:\s+\K\$[\d.]+' | tr -d '$' || echo "0")
    
    # Ensure values are valid numbers (default to 0 if empty or invalid)
    # Remove any non-numeric characters except dots
    openai=$(echo "$openai" | grep -oE '^[0-9]+\.?[0-9]*$' || echo "0")
    elevenlabs=$(echo "$elevenlabs" | grep -oE '^[0-9]+\.?[0-9]*$' || echo "0")
    rainforest=$(echo "$rainforest" | grep -oE '^[0-9]+\.?[0-9]*$' || echo "0")
    
    # Add to totals using bc for floating point math
    total_openai=$(echo "$total_openai + $openai" | bc)
    total_elevenlabs=$(echo "$total_elevenlabs + $elevenlabs" | bc)
    total_rainforest=$(echo "$total_rainforest + $rainforest" | bc)
    
    log ""
  else
    log ""
    log "⚠️  Failed to process: $title"
    log "   Exit code: $exit_code"
    log "   Continuing with next book..."
    failed=$((failed + 1))
    log ""
  fi
  
  # Add a delay between books to avoid rate limiting
  if [ $current -lt $total ]; then
    log "⏳ Waiting 30 seconds before next book..."
    sleep 30
  fi
done < titles.txt

# Calculate total cost
total_cost=$(echo "$total_openai + $total_elevenlabs + $total_rainforest" | bc)

log ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "✨ Batch processing complete!"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log ""
log "📊 Summary:"
log "   Total books:        $total"
log "   Successful:         $success"
log "   Failed:             $failed"
log ""
log "💰 Total Costs:"
log "   OpenAI (GPT-5):     \$$total_openai"
log "   ElevenLabs (TTS):   \$$total_elevenlabs"
log "   Rainforest API:     \$$total_rainforest"
log "   ─────────────────────────────"
log "   TOTAL:              \$$total_cost"
log ""
log "📝 Full log saved to: $LOG_FILE"
log ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"