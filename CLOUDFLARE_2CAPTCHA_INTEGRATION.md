# Cloudflare & 2captcha Integration

## Overview

This document describes the integration of 2captcha service to automatically bypass Cloudflare bot detection challenges when searching on 1lib.sk and other protected sites.

## Implementation

### Files Modified

1. **[`src/utils/browser.js`](src/utils/browser.js:1)**
   - Added import for [`CaptchaSolver`](src/utils/captcha-solver.js:6)
   - Added [`detectCloudflareChallenge()`](src/utils/browser.js:100) function to detect Cloudflare Turnstile challenges
   - Updated [`navigateWithDdgBypass()`](src/utils/browser.js:150) to accept `twocaptchaApiKey` parameter
   - Added Cloudflare challenge detection and solving logic
   - Updated [`getDownloadUrlWithPuppeteer()`](src/utils/browser.js:245) to accept and pass through `twocaptchaApiKey`

2. **[`src/summary-forge.js`](src/summary-forge.js:1)**
   - Updated call to [`getDownloadUrlWithPuppeteer()`](src/summary-forge.js:2364) to pass `this.twocaptchaApiKey`

### How It Works

1. **Detection**: When navigating to a URL, the browser first checks for Cloudflare challenge indicators:
   - Page title contains "just a moment" or "attention required"
   - Body HTML contains "cloudflare", "cf-challenge", "cf_chl_", or "ray id"

2. **Sitekey Extraction**: If a challenge is detected, the system attempts to extract the Turnstile sitekey:
   - Looks for `[data-sitekey]` attribute on DOM elements
   - Searches script tags for sitekey patterns

3. **Challenge Solving**: If both API key and sitekey are found:
   - Creates a [`CaptchaSolver`](src/utils/captcha-solver.js:6) instance with the 2captcha API key
   - Submits the challenge to 2captcha service
   - Polls for the solution (up to 5 minutes)
   - Injects the solution token into the page
   - Waits for page to process the solution

4. **Fallback**: If 2captcha solving fails or is not configured:
   - Falls back to existing DDoS-Guard bypass logic
   - Attempts to click "verify/continue" buttons
   - Waits for cookies to be set

## Configuration

### Environment Variable

Set the 2captcha API key as an environment variable:

```bash
export TWOCAPTCHA_API_KEY=0e8ba563d9fce0354517ee4ea3267186
```

### Programmatic Usage

Pass the API key when instantiating SummaryForge:

```javascript
import { SummaryForge } from './src/summary-forge.js';

const forge = new SummaryForge({
  openaiApiKey: process.env.OPENAI_API_KEY,
  twocaptchaApiKey: process.env.TWOCAPTCHA_API_KEY,
  enableProxy: true,
  proxyUrl: process.env.PROXY_URL,
  proxyUsername: process.env.PROXY_USERNAME,
  proxyPassword: process.env.PROXY_PASSWORD
});

// Now search1lib will automatically use 2captcha if Cloudflare is detected
const results = await forge.search1lib('JavaScript', { maxResults: 5 });
```

## Supported Challenge Types

The integration currently supports:

- **Cloudflare Turnstile**: Modern Cloudflare CAPTCHA system
- **hCaptcha**: Alternative CAPTCHA system (via existing [`CaptchaSolver`](src/utils/captcha-solver.js:6))
- **DDoS-Guard**: Existing bypass logic remains functional

## Cost Considerations

2captcha pricing (approximate):
- **hCaptcha/Turnstile**: ~$0.001 per solve
- **reCAPTCHA v2**: ~$0.003 per solve

The system only uses 2captcha when:
1. A challenge is actually detected
2. The API key is configured
3. A sitekey can be extracted

## Error Handling

The implementation includes comprehensive error handling:

- **No API Key**: Logs warning and continues with fallback methods
- **No Sitekey Found**: Logs warning and continues with fallback methods
- **Solving Failed**: Logs error and continues with fallback methods
- **Timeout**: After 5 minutes, returns error and continues with fallback

## Testing

To test the integration:

```bash
# Set environment variables
export TWOCAPTCHA_API_KEY=your_api_key_here
export OPENAI_API_KEY=your_openai_key
export PROXY_URL=http://proxy.example.com:80
export PROXY_USERNAME=your_username
export PROXY_PASSWORD=your_password

# Run 1lib search test
npm test -- test/1lib-search.test.js
```

## Logging

The integration provides detailed console logging:

- `🔍 Checking for Cloudflare challenge...` - Detection phase
- `🛡️ Cloudflare challenge detected!` - Challenge found
- `🔑 Attempting to solve with 2captcha...` - Solving initiated
- `✅ Cloudflare challenge solved!` - Solution successful
- `✅ Successfully bypassed Cloudflare` - Verification passed
- `⚠️ 2captcha API key not provided` - Configuration warning
- `⚠️ Failed to solve Cloudflare challenge` - Solving failed

## Future Enhancements

Potential improvements:
1. Support for reCAPTCHA v2/v3
2. Retry logic with exponential backoff
3. Cost tracking for 2captcha usage
4. Alternative CAPTCHA solving services
5. Browser fingerprint randomization

## References

- [2captcha API Documentation](https://2captcha.com/2captcha-api)
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)
- [CaptchaSolver Implementation](src/utils/captcha-solver.js)