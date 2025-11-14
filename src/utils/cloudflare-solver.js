/**
 * Cloudflare Turnstile Solver
 * Uses 2captcha API v2 to bypass Cloudflare Turnstile challenges
 * 
 * Supports both:
 * - Standalone Turnstile widgets
 * - Cloudflare Challenge pages (with action, cData, chlPageData)
 */

export class CloudflareSolver {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.apiBaseUrl = 'https://api.2captcha.com';
    this.lastSitekey = null; // Cache sitekey for subsequent challenges
  }

  /**
   * Inject script to intercept Turnstile render call
   * Must be called BEFORE navigating to the page
   */
  async interceptTurnstileRender(page) {
    // Enable console logging from the page
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[CloudflareSolver]')) {
        console.log(text);
      }
    });
    
    await page.evaluateOnNewDocument(() => {
      window.turnstileParams = null;
      window.tsCallback = null;
      
      console.log('[CloudflareSolver] Interception script loaded');
      
      // Intercept turnstile.render
      const checkInterval = setInterval(() => {
        if (window.turnstile) {
          console.log('[CloudflareSolver] Found window.turnstile object');
          clearInterval(checkInterval);
          
          const originalRender = window.turnstile.render;
          window.turnstile.render = (container, params) => {
            console.log('[CloudflareSolver] turnstile.render() called!');
            window.turnstileParams = {
              sitekey: params.sitekey,
              action: params.action,
              cData: params.cData,
              chlPageData: params.chlPageData
            };
            window.tsCallback = params.callback;
            console.log('[CloudflareSolver] Intercepted params:', JSON.stringify(window.turnstileParams));
            return originalRender(container, params);
          };
          console.log('[CloudflareSolver] Render function intercepted');
        }
      }, 10);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!window.turnstile) {
          console.log('[CloudflareSolver] Timeout: window.turnstile never appeared');
        }
      }, 30000);
    });
  }

  /**
   * Extract Turnstile parameters - tries interception, direct extraction, cache, and known sitekeys
   */
  async extractTurnstileParams(page) {
    console.log('⏳ Waiting for Turnstile render call (up to 20s)...');
    
    // First try: wait for intercepted params (increased timeout)
    let attempts = 0;
    while (attempts < 20) {
      const params = await page.evaluate(() => window.turnstileParams);
      if (params && params.sitekey) {
        console.log('✅ Turnstile parameters extracted via interception');
        this.lastSitekey = params.sitekey; // Cache for reuse
        return params;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      if (attempts % 5 === 0) {
        process.stdout.write('.');
      }
    }
    
    console.log('\n⚠️  Render call not intercepted (widget may be pre-rendered)');
    console.log('🔍 Extracting sitekey directly from page...');
    
    // Fallback: try to extract sitekey directly from the page
    const directParams = await page.evaluate(() => {
      let sitekey = null;
      let foundMethod = null;
      
      // Debug: log what we're finding
      const debugInfo = {
        hasTurnstile: !!window.turnstile,
        dataSitekeyElements: document.querySelectorAll('[data-sitekey]').length,
        iframes: document.querySelectorAll('iframe').length,
        scripts: document.querySelectorAll('script').length
      };
      console.log('[CloudflareSolver] Debug info:', JSON.stringify(debugInfo));
      
      // Method 1: Look for data-sitekey attribute
      const elements = document.querySelectorAll('[data-sitekey]');
      if (elements.length > 0) {
        sitekey = elements[0].getAttribute('data-sitekey');
        foundMethod = 'data-sitekey attribute';
        console.log('[CloudflareSolver] Found sitekey in data-sitekey attribute:', sitekey);
      }
      
      // Method 2: Look in script tags
      if (!sitekey) {
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          const patterns = [
            /sitekey["\s:=]+["']([^"']+)["']/i,
            /'sitekey':\s*["']([^"']+)["']/i,
            /"sitekey":\s*["']([^"']+)["']/i,
            /data-sitekey=["']([^"']+)["']/i
          ];
          
          for (const pattern of patterns) {
            const match = script.textContent.match(pattern);
            if (match) {
              sitekey = match[1];
              foundMethod = 'script tag';
              console.log('[CloudflareSolver] Found sitekey in script tag:', sitekey);
              break;
            }
          }
          if (sitekey) break;
        }
      }
      
      // Method 3: Check iframes
      if (!sitekey) {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          const src = iframe.getAttribute('src') || '';
          if (src.includes('challenges.cloudflare.com') || src.includes('turnstile')) {
            const match = src.match(/sitekey=([^&]+)/);
            if (match) {
              sitekey = match[1];
              foundMethod = 'iframe src';
              console.log('[CloudflareSolver] Found sitekey in iframe src:', sitekey);
              break;
            }
          }
        }
      }
      
      // Method 4: Look in page HTML source
      if (!sitekey) {
        const htmlMatch = document.documentElement.outerHTML.match(/data-sitekey=["']([^"']+)["']/i);
        if (htmlMatch) {
          sitekey = htmlMatch[1];
          foundMethod = 'HTML source';
          console.log('[CloudflareSolver] Found sitekey in HTML source:', sitekey);
        }
      }
      
      if (sitekey) {
        return { sitekey, foundMethod };
      }
      
      console.log('[CloudflareSolver] No sitekey found with any method');
      return null;
    });
    
    if (directParams && directParams.sitekey) {
      console.log(`✅ Sitekey extracted directly: ${directParams.sitekey}`);
      this.lastSitekey = directParams.sitekey; // Cache for reuse
      return directParams;
    }
    
    // Last resort: reuse cached sitekey from previous challenge
    if (this.lastSitekey) {
      console.log(`🔄 Reusing sitekey from previous challenge: ${this.lastSitekey}`);
      return { sitekey: this.lastSitekey };
    }
    
    // Final fallback: use known sitekey for 1lib.sk
    const pageUrl = await page.url();
    if (pageUrl.includes('1lib.sk')) {
      const knownSitekey = '0x4AAAAAAADnPIDROrmt1Wwj';
      console.log(`🔑 Using known sitekey for 1lib.sk: ${knownSitekey}`);
      this.lastSitekey = knownSitekey; // Cache it
      return { sitekey: knownSitekey };
    }
    
    return null;
  }

  /**
   * Solve Turnstile using 2captcha API v1 (fallback for standalone widgets)
   */
  async solveTurnstileV1(page, sitekey) {
    console.log('🔑 Using v1 API with turnstile method');
    
    const submitUrl = `https://2captcha.com/in.php?key=${this.apiKey}&method=turnstile&sitekey=${sitekey}&pageurl=${encodeURIComponent(page.url())}`;
    
    console.log("📤 Submitting to 2captcha v1 API...");
    const submitResponse = await fetch(submitUrl);
    const submitText = await submitResponse.text();
    
    if (!submitText.startsWith("OK|")) {
      console.error("❌ v1 API submission failed:", submitText);
      return false;
    }

    const captchaId = submitText.split("|")[1];
    console.log("⏳ CAPTCHA ID:", captchaId, "- waiting for solution...");

    // Poll for solution
    let attempts = 0;
    const maxAttempts = 60;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const resultUrl = `https://2captcha.com/res.php?key=${this.apiKey}&action=get&id=${captchaId}`;
      const resultResponse = await fetch(resultUrl);
      const resultText = await resultResponse.text();
      
      if (resultText === "CAPCHA_NOT_READY") {
        attempts++;
        process.stdout.write(".");
        continue;
      }
      
      if (resultText.startsWith("OK|")) {
        const solution = resultText.split("|")[1];
        console.log("\n✅ Turnstile solved (v1 API)!");
        
        // Inject solution
        await page.evaluate((token) => {
          const responseField = document.querySelector('[name="cf-turnstile-response"]');
          if (responseField) {
            responseField.value = token;
            console.log('[CloudflareSolver] Set cf-turnstile-response');
          }
          
          if (window.tsCallback && typeof window.tsCallback === 'function') {
            try {
              window.tsCallback(token);
              console.log('[CloudflareSolver] Called turnstile callback');
            } catch (e) {
              console.error('[CloudflareSolver] Callback error:', e);
            }
          }
        }, solution);
        
        // Wait for verification
        console.log('⏳ Waiting for Cloudflare to verify and redirect (up to 15s)...');
        try {
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
          console.log('✅ Page redirected after verification');
        } catch (navError) {
          console.log('ℹ️  No redirect detected');
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
      }
      
      console.error("\n❌ v1 API error:", resultText);
      return false;
    }
    
    console.error("\n❌ v1 API timeout");
    return false;
  }

  /**
   * Solve Cloudflare Turnstile using 2captcha API v2
   */
  async solveTurnstile(page, params) {
    const { sitekey, action, cData, chlPageData } = params;
    
    console.log('🔑 Turnstile parameters:');
    console.log(`   Sitekey: ${sitekey}`);
    if (action) console.log(`   Action: ${action}`);
    if (cData) console.log(`   cData: ${cData}`);
    if (chlPageData) console.log(`   chlPageData: ${chlPageData?.substring(0, 50)}...`);
    
    // Determine if this is a Challenge page or standalone widget
    const isChallengePage = !!(action || cData || chlPageData);
    
    if (!isChallengePage) {
      console.log('ℹ️  Standalone widget detected (no action/cData/pagedata)');
      console.log('🔄 Using v1 API for standalone widget...');
      return await this.solveTurnstileV1(page, sitekey);
    }
    
    // Create task using API v2 for Challenge pages
    const taskPayload = {
      clientKey: this.apiKey,
      task: {
        type: 'TurnstileTaskProxyless',
        websiteURL: page.url(),
        websiteKey: sitekey,
        action: action,
        data: cData,
        pagedata: chlPageData
      }
    };
    
    console.log('📤 Submitting Turnstile task to 2captcha API v2 (Challenge page)...');
    
    const createResponse = await fetch(`${this.apiBaseUrl}/createTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskPayload)
    });
    
    const createResult = await createResponse.json();
    
    if (createResult.errorId !== 0) {
      console.error('❌ Task creation failed:', createResult.errorDescription || createResult.errorCode);
      return false;
    }
    
    const taskId = createResult.taskId;
    console.log(`⏳ Task ID: ${taskId} - waiting for solution...`);
    
    // Poll for solution
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const resultResponse = await fetch(`${this.apiBaseUrl}/getTaskResult`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey: this.apiKey,
          taskId: taskId
        })
      });
      
      const resultData = await resultResponse.json();
      
      if (resultData.errorId !== 0) {
        console.error('\n❌ Error getting result:', resultData.errorDescription || resultData.errorCode);
        return false;
      }
      
      if (resultData.status === 'processing') {
        attempts++;
        process.stdout.write('.');
        continue;
      }
      
      if (resultData.status === 'ready') {
        const token = resultData.solution.token;
        const userAgent = resultData.solution.userAgent;
        
        console.log('\n✅ Turnstile solved!');
        console.log(`💰 Cost: $${resultData.cost || '0.00145'}`);
        
        // Inject the solution
        const injected = await page.evaluate((token, userAgent) => {
          // Set the token in the response field
          const responseField = document.querySelector('[name="cf-turnstile-response"]');
          if (responseField) {
            responseField.value = token;
            console.log('[CloudflareSolver] Set cf-turnstile-response');
          }
          
          // Call the callback if available
          if (window.tsCallback && typeof window.tsCallback === 'function') {
            try {
              window.tsCallback(token);
              console.log('[CloudflareSolver] Called turnstile callback');
            } catch (e) {
              console.error('[CloudflareSolver] Callback error:', e);
            }
          }
          
          // Update user agent if provided (for Challenge pages)
          if (userAgent) {
            try {
              Object.defineProperty(navigator, 'userAgent', {
                get: () => userAgent,
                configurable: true
              });
              console.log('[CloudflareSolver] Updated user agent');
            } catch (e) {
              console.error('[CloudflareSolver] User agent update failed:', e);
            }
          }
          
          // Try to find and submit the form
          const form = document.querySelector('form');
          if (form) {
            console.log('[CloudflareSolver] Found form, submitting...');
            try {
              form.submit();
              return { submitted: true };
            } catch (e) {
              console.error('[CloudflareSolver] Form submit error:', e);
            }
          }
          
          return { submitted: false };
        }, token, userAgent);
        
        console.log(`📝 Token injected, form ${injected.submitted ? 'submitted' : 'not found'}`);
        
        // Wait for redirect/verification
        console.log('⏳ Waiting for Cloudflare to verify and redirect (up to 15s)...');
        try {
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
          console.log('✅ Page redirected after verification');
        } catch (navError) {
          console.log('ℹ️  No redirect detected, checking if verification happened in place...');
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
      }
      
      console.error('\n❌ Unexpected status:', resultData.status);
      return false;
    }
    
    console.error('\n❌ Turnstile solving timeout');
    return false;
  }

  /**
   * Main solve method - detects and solves Cloudflare Turnstile
   */
  async solve(page) {
    if (!this.apiKey) {
      console.log("⚠️  2captcha API key not configured");
      return false;
    }

    console.log("🔧 Using Turnstile interception method...");
    
    // Extract parameters from intercepted render call
    const params = await this.extractTurnstileParams(page);
    
    if (!params || !params.sitekey) {
      console.error('❌ Could not extract Turnstile parameters');
      console.log('   The turnstile.render() call may not have been intercepted');
      console.log('   Make sure interceptTurnstileRender() was called before navigation');
      return false;
    }
    
    return await this.solveTurnstile(page, params);
  }
}