import 'dotenv/config';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { SessionManager } from './SessionManager.js';

const AMENITIZ_LOGIN_URL = 'https://domaine-de-pipangaille.amenitiz.io/fr/admin/dashboard';
const DATA_DIR = process.env.DATA_DIR || '/data/data';
const SESSION_DIR = process.env.SESSION_DIR || '/data/session';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '/data/screenshots';
const DATA_RETENTION_DAYS = parseInt(process.env.DATA_RETENTION_DAYS) || 7;

export class ScraperService {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.sessionManager = new SessionManager(SESSION_DIR);
    this.headless = options.headless ?? (process.env.HEADLESS === 'true');
    this.screenshot = options.screenshot ?? (process.env.SCREENSHOT === 'true');
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async takeScreenshot(name) {
    if (this.screenshot) {
      if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      }
      await this.page.screenshot({ path: path.join(SCREENSHOT_DIR, name) });
    }
  }

  async initialize() {
    if (this.screenshot && !fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    const launchOptions = {
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage'
      ],
      defaultViewport: { width: 1920, height: 1080 }
    };

    // Use system Chromium if available (addon environment)
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();
    await this.page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
  }

  async login(twoFACodeProvider = null) {
    const { AMENITIZ_EMAIL: email, AMENITIZ_PASSWORD: password } = process.env;

    if (!email || !password) {
      throw new Error('AMENITIZ_EMAIL and AMENITIZ_PASSWORD must be defined');
    }

    await this.page.goto(AMENITIZ_LOGIN_URL, { waitUntil: 'networkidle2' });
    
    if (await this.sessionManager.loadCookies(this.page)) {
      await this.page.reload({ waitUntil: 'networkidle2' });
      
      if (await this.checkIfLoggedIn()) {
        return;
      }
      
      this.sessionManager.clearSession();
    }
    
    await this.page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
    
    const emailInput = await this.page.$('input[type="email"], input[name="email"]');
    const passwordInput = await this.page.$('input[type="password"]');
    
    if (emailInput) await emailInput.type(email, { delay: 100 });
    if (passwordInput) await passwordInput.type(password, { delay: 100 });

    await this.takeScreenshot('1-login-form.png');

    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
      this.page.click('button[type="submit"], input[type="submit"]')
    ]);

    await this.delay(2000);
    await this.takeScreenshot('2-after-login.png');

    // Handle 2FA - single attempt only
    if (await this.check2FARequired()) {
      if (!twoFACodeProvider) {
        throw new Error('2FA required but no code provider available');
      }
      
      const code = await twoFACodeProvider(null);
      await this.submit2FACode(code);
      
      await this.delay(2000);
      
      // Check if login was successful
      if (!await this.checkIfLoggedIn()) {
        throw new Error('2FA verification failed');
      }
    }

    await this.sessionManager.saveCookies(this.page);
    await this.takeScreenshot('3-dashboard.png');
  }

  async checkIfLoggedIn() {
    const url = this.page.url();
    if (url.includes('/login') || url.includes('/signin')) return false;
    return await this.page.$('nav, .dashboard, .admin') !== null;
  }

  async check2FARequired() {
    const selectors = [
      'input[name="code"]', 'input[name="otp"]', 'input[name="token"]',
      'input[placeholder*="code"]', 'input[type="text"][maxlength="6"]'
    ];

    for (const selector of selectors) {
      if (await this.page.$(selector)) {
        return true;
      }
    }

    const pageText = await this.page.evaluate(() => document.body.innerText.toLowerCase());
    return ['code de vérification', 'two-factor', '2fa', 'verification code'].some(kw => pageText.includes(kw));
  }

  async submit2FACode(code) {
    const codeInput = await this.page.$('input[name="code"], input[name="otp"], input[name="token"], input[placeholder*="code"]');
    if (!codeInput) throw new Error('Unable to find 2FA code input field');

    await codeInput.type(code, { delay: 100 });
    await this.takeScreenshot('2b-2fa-code.png');

    let submitButton = await this.page.$('button[type="submit"], input[type="submit"]');
    
    if (!submitButton) {
      const buttonHandle = await this.page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(btn => 
          ['valider', 'verify', 'confirmer', 'submit'].some(kw => 
            btn.textContent.toLowerCase().includes(kw)
          )
        );
      });
      submitButton = buttonHandle.asElement();
    }
    
    if (submitButton) {
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
        submitButton.click()
      ]);
    } else {
      await codeInput.press('Enter');
      await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    }

    await this.delay(2000);
  }

  async fetchGuests() {
    await this.page.goto('https://domaine-de-pipangaille.amenitiz.io/fr/admin/booking-manager/arrivals', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await this.delay(3000);
    
    try {
      await this.page.waitForSelector('.check-in-out-card', { timeout: 10000 });
    } catch (e) {
      // No cards found
    }
    
    await this.delay(2000);
    await this.takeScreenshot('3-arrivals.png');

    const guests = await this.page.evaluate(() => {
      const results = [];
      const bookingCards = document.querySelectorAll('.check-in-out-card');
      
      bookingCards.forEach(card => {
        const nameElement = card.querySelector('.check-in-out-card-title p');
        const name = nameElement?.textContent.trim() || '';
        
        const roomElement = card.querySelector('.check-in-out-card-room p');
        let roomType = '';
        if (roomElement) {
          const match = roomElement.textContent.trim().match(/\(\d+\)\s*(.+)$/);
          roomType = match ? match[1].trim() : roomElement.textContent.trim();
        }
        
        const dates = card.querySelector('.check-in-out-card-date')?.textContent.trim() || '';
        
        const personsElement = card.querySelector('.card-info.u-flex.pb2 .size0');
        const persons = personsElement?.textContent.match(/(\d+)\s*x/)?.[1] || '';
        
        let amount = '';
        card.querySelectorAll('.card-info p').forEach(p => {
          if (p.textContent.includes('Montant dû:')) {
            amount = p.querySelector('strong')?.textContent.trim() || '';
          }
        });
        
        if (name) {
          results.push({
            name: name,
            roomType: roomType,
            persons: persons,
            amountDue: amount,
            dates: dates
          });
        }
      });
      
      return results;
    });

    return guests;
  }

  async cleanupData() {
    if (!DATA_RETENTION_DAYS || DATA_RETENTION_DAYS <= 0) {
      return;
    }

    const cutoffMs = Date.now() - DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const targets = [DATA_DIR, SCREENSHOT_DIR];

    targets.forEach(dir => {
      if (!fs.existsSync(dir)) return;

      fs.readdirSync(dir).forEach(entry => {
        const fullPath = path.join(dir, entry);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isFile() && stats.mtimeMs < cutoffMs) {
            fs.unlinkSync(fullPath);
          }
        } catch (err) {
          // Ignore cleanup errors to avoid failing the scrape
          console.warn(`[WARN] Cleanup skipped for ${fullPath}: ${err.message}`);
        }
      });
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  async scrape(twoFACodeProvider = null) {
    try {
      await this.initialize();
      await this.login(twoFACodeProvider);
      const guests = await this.fetchGuests();
      await this.cleanupData();
      return guests;
    } finally {
      await this.close();
    }
  }
}
