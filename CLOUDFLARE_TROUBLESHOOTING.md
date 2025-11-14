# Cloudflare Turnstile Troubleshooting

## Issue: Multiple Challenges in Sequence

If you're seeing Cloudflare show 3+ challenges in a row, this indicates Cloudflare is detecting automated behavior and rate-limiting you.

### Symptoms

```
🔑 Solving attempt 1/3...
✅ Turnstile solved!
⚠️ Another Cloudflare challenge appeared
🔑 Solving attempt 2/3...
✅ Turnstile solved!
⚠️ Another Cloudflare challenge appeared
🔑 Solving attempt 3/3...
✅ Turnstile solved!
⚠️ Max solve attempts reached
```

### Root Causes

1. **No Proxy** - Direct connections are flagged as suspicious
2. **Browser Fingerprint** - Automated browser is detected
3. **Rate Limiting** - Too many requests from same IP

### Solutions

#### 1. Enable Proxy (REQUIRED for 1lib.sk)

```bash
summary config --proxy true
```

Then run setup to configure proxy credentials:
```bash
summary setup
```

Enter your proxy details when prompted:
- Proxy URL: `http://p.webshare.io:80`
- Proxy Username: Your username
- Proxy Password: Your password

#### 2. Use Headless Mode

```bash
summary config --headless true
```

Headless mode is less detectable than headed mode.

#### 3. Increase Max Solve Attempts

If you're still seeing chained challenges with proxy enabled, you can increase the max attempts in [`src/utils/browser.js`](src/utils/browser.js:218):

```javascript
const maxSolveAttempts = 5; // Increase from 3 to 5
```

## Why Proxy is Critical

1lib.sk uses Cloudflare to block:
- Direct connections (no proxy)
- Data center IPs
- Known VPN/proxy IPs
- Automated browsers

**Residential proxies** (like Webshare) are required because they:
- Use real residential IPs
- Rotate IPs to avoid rate limits
- Look like normal user traffic
- Have better success rates with Cloudflare

## Current Implementation Status

✅ **Working**: 2captcha integration with API v2
✅ **Working**: Turnstile parameter interception
✅ **Working**: Token injection and callback
✅ **Working**: Multiple challenge handling (up to 3)
⚠️  **Issue**: Cloudflare shows endless challenges without proxy

## Recommended Configuration

```bash
# 1. Enable proxy
summary config --proxy true

# 2. Configure credentials
summary setup

# 3. Enable headless mode
summary config --headless true

# 4. Test
summary search "next react"
```

## Expected Behavior with Proxy

With proxy enabled, you should see:
```
🔒 Using proxy session 12 (username@p.webshare.io:80)
🔧 Turnstile interception script injected
🌐 Navigating to: https://1lib.sk/s/next%20react...
🛡️ Cloudflare challenge detected!
🔑 Solving attempt 1/3...
✅ Turnstile solved!
✅ Successfully bypassed all Cloudflare challenges
⏳ Waiting for search results...
✅ Search results loaded
📚 Found 10 results
```

## Alternative: Use Anna's Archive

If you don't have a proxy, use Anna's Archive instead (has DDoS-Guard, not Cloudflare):

```bash
summary search "next react" --source anna
```

## Cost Considerations

Each Cloudflare challenge costs ~$0.00145 with 2captcha.

If seeing 3 challenges per search:
- Cost per search: ~$0.00435
- With proxy: Usually 1 challenge or none
- Without proxy: 3+ challenges (rate limited)

**Recommendation**: Enable proxy to reduce costs and improve success rate.