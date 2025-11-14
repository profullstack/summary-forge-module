/**
 * CAPTCHA Solver Utility
 * Handles DDoS-Guard and hCaptcha solving using 2captcha service API v1
 */

export class CaptchaSolver {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async solve(page) {
    if (!this.apiKey) {
      console.log("⚠️  2captcha API key not configured, skipping CAPTCHA solving");
      return false;
    }

    console.log("🔍 Checking for CAPTCHA...");
    
    const captchaInfo = await page.evaluate(() => {
      const bodyHTML = document.body.innerHTML;
      const hasDdgCaptcha = bodyHTML.includes("ddg-captcha") ||
                            bodyHTML.includes("checking your browser") ||
                            bodyHTML.includes("DDoS-Guard") ||
                            bodyHTML.includes("complete the manual check");
      
      if (!hasDdgCaptcha) {
        return { hasCaptcha: false };
      }

      let sitekey = null;
      
      // Method 1: data-callback attribute
      const captchaDiv = document.querySelector('[data-callback="ddgCaptchaCallback"]');
      if (captchaDiv) {
        sitekey = captchaDiv.getAttribute('data-sitekey');
      }
      
      // Method 2: Look for hCaptcha iframe
      if (!sitekey) {
        const hcaptchaIframe = document.querySelector('iframe[src*="hcaptcha.com"]');
        if (hcaptchaIframe) {
          const src = hcaptchaIframe.getAttribute('src');
          const match = src.match(/sitekey=([^&]+)/);
          if (match) sitekey = match[1];
        }
      }
      
      // Method 3: Look in script tags
      if (!sitekey) {
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          const match = script.textContent.match(/sitekey["\s:=]+["']([^"']+)["']/i);
          if (match) {
            sitekey = match[1];
            break;
          }
        }
      }

      return {
        hasCaptcha: true,
        sitekey,
        captchaType: captchaDiv ? 'ddos-guard' : 'hcaptcha'
      };
    });

    if (!captchaInfo.hasCaptcha) {
      console.log("✅ No CAPTCHA detected");
      return false;
    }

    console.log(`🤖 ${captchaInfo.captchaType.toUpperCase()} CAPTCHA detected!`);

    if (!captchaInfo.sitekey) {
      console.error("❌ Could not find CAPTCHA sitekey");
      return false;
    }

    console.log("🔑 Sitekey:", captchaInfo.sitekey);

    // Submit CAPTCHA to 2captcha using v1 API
    const submitUrl = `https://2captcha.com/in.php?key=${this.apiKey}&method=hcaptcha&sitekey=${captchaInfo.sitekey}&pageurl=${encodeURIComponent(page.url())}`;
    
    console.log("📤 Submitting CAPTCHA to 2captcha...");
    const submitResponse = await fetch(submitUrl);
    const submitText = await submitResponse.text();
    
    if (!submitText.startsWith("OK|")) {
      console.error("❌ 2captcha submission failed:", submitText);
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
        console.log("\n✅ CAPTCHA solved!");
        
        await page.evaluate((token) => {
          if (window.ddgCaptchaCallback) {
            window.ddgCaptchaCallback(token);
          }
          const textarea = document.querySelector('[name="h-captcha-response"]') ||
                          document.querySelector('[name="g-recaptcha-response"]');
          if (textarea) {
            textarea.value = token;
          }
        }, solution);
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
      }
      
      console.error("\n❌ 2captcha error:", resultText);
      return false;
    }
    
    console.error("\n❌ CAPTCHA solving timeout");
    return false;
  }
}