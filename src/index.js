import 'dotenv/config';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { SessionManager } from './SessionManager.js';

const AMENITIZ_LOGIN_URL = 'https://domaine-de-pipangaille.amenitiz.io/fr/admin/dashboard';
const SCREENSHOT_DIR = './screenshots';

class AmenitizScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.sessionManager = new SessionManager();
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async screenshot(name) {
    if (process.env.SCREENSHOT === 'true') {
      await this.page.screenshot({ path: path.join(SCREENSHOT_DIR, name) });
    }
  }

  async promptFor2FACode() {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('🔐 Code 2FA reçu par email : ', (code) => {
        rl.close();
        resolve(code.trim());
      });
    });
  }

  async initialize() {
    console.log('🚀 Initialisation du scraper...');
    
    if (process.env.SCREENSHOT === 'true' && !fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    this.browser = await puppeteer.launch({
      headless: process.env.HEADLESS === 'true',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1920, height: 1080 }
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
  }

  async login() {
    console.log('🔐 Connexion à Amenitiz...');
    
    const { AMENITIZ_EMAIL: email, AMENITIZ_PASSWORD: password } = process.env;

    if (!email || !password) {
      throw new Error('Les credentials AMENITIZ_EMAIL et AMENITIZ_PASSWORD doivent être définis dans le fichier .env');
    }

    await this.page.goto(AMENITIZ_LOGIN_URL, { waitUntil: 'networkidle2' });
    
    // Tentative de restauration de session
    if (await this.sessionManager.loadCookies(this.page)) {
      console.log('🔄 Tentative de connexion avec la session sauvegardée...');
      await this.page.reload({ waitUntil: 'networkidle2' });
      
      if (await this.checkIfLoggedIn()) {
        console.log('✅ Session restaurée avec succès');
        return;
      }
      
      console.log('⚠️  Session expirée, connexion manuelle nécessaire');
      this.sessionManager.clearSession();
    }
    
    // Connexion manuelle
    await this.page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
    
    const emailInput = await this.page.$('input[type="email"], input[name="email"]');
    const passwordInput = await this.page.$('input[type="password"]');
    
    if (emailInput) await emailInput.type(email, { delay: 100 });
    if (passwordInput) await passwordInput.type(password, { delay: 100 });

    await this.screenshot('1-login-form.png');

    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
      this.page.click('button[type="submit"], input[type="submit"]')
    ]);

    await this.delay(2000);
    await this.screenshot('2-after-login.png');

    // Gestion 2FA
    if (await this.check2FARequired()) {
      console.log('🔐 Authentification à deux facteurs requise');
      const code = await this.promptFor2FACode();
      await this.submit2FACode(code);
    }

    console.log('✅ Connexion réussie');
    await this.sessionManager.saveCookies(this.page);
    await this.screenshot('3-dashboard.png');
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
        console.log(`ℹ️  Champ 2FA détecté: ${selector}`);
        return true;
      }
    }

    const pageText = await this.page.evaluate(() => document.body.innerText.toLowerCase());
    return ['code de vérification', 'two-factor', '2fa', 'verification code'].some(kw => pageText.includes(kw));
  }

  async submit2FACode(code) {
    console.log(`🔐 Saisie du code 2FA: ${code}`);
    
    const codeInput = await this.page.$('input[name="code"], input[name="otp"], input[name="token"], input[placeholder*="code"]');
    if (!codeInput) throw new Error('Impossible de trouver le champ de saisie du code 2FA');

    await codeInput.type(code, { delay: 100 });
    await this.screenshot('2b-2fa-code.png');

    // Chercher le bouton de validation
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
      console.log('ℹ️  Bouton non trouvé, utilisation de la touche Entrée');
      await codeInput.press('Enter');
      await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    }

    await this.delay(2000);
    console.log('✅ Code 2FA validé');
  }

  async getTodayGuests() {
    console.log('📅 Récupération des clients du jour...');
    
    console.log('🔗 Navigation vers la page des arrivées...');
    await this.page.goto('https://domaine-de-pipangaille.amenitiz.io/fr/admin/booking-manager/arrivals', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('⏳ Attente du chargement...');
    await this.delay(3000);
    
    try {
      await this.page.waitForSelector('.check-in-out-card', { timeout: 10000 });
      console.log('✅ Cartes de réservation détectées');
    } catch (e) {
      console.log('⚠️  Aucune carte de réservation trouvée');
    }
    
    await this.delay(2000);
    await this.screenshot('3-arrivals.png');

    console.log('📊 Extraction des données...');
    const guests = await this.page.evaluate(() => {
      const results = [];
      const bookingCards = document.querySelectorAll('.check-in-out-card');
      
      bookingCards.forEach(card => {
        const nameElement = card.querySelector('.check-in-out-card-title p');
        const name = nameElement?.textContent.trim() || '';
        
        // Type de chambre
        const roomElement = card.querySelector('.check-in-out-card-room p');
        let roomType = '';
        if (roomElement) {
          const match = roomElement.textContent.trim().match(/\(\d+\)\s*(.+)$/);
          roomType = match ? match[1].trim() : roomElement.textContent.trim();
        }
        
        // Dates
        const dates = card.querySelector('.check-in-out-card-date')?.textContent.trim() || '';
        
        // Nombre de personnes
        const personsElement = card.querySelector('.card-info.u-flex.pb2 .size0');
        const persons = personsElement?.textContent.match(/(\d+)\s*x/)?.[1] || '';
        
        // Montant dû
        let amount = '';
        card.querySelectorAll('.card-info p').forEach(p => {
          if (p.textContent.includes('Montant dû:')) {
            amount = p.querySelector('strong')?.textContent.trim() || '';
          }
        });
        
        if (name) {
          results.push({
            nom: name,
            typeChambre: roomType,
            nombrePersonnes: persons,
            montantDu: amount,
            dates: dates
          });
        }
      });
      
      return results;
    });

    console.log(`✅ ${guests.length} réservation(s) trouvée(s)`);
    return guests;
  }

  async exportData(guests, format = 'json') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dataDir = './data';
    
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const filename = path.join(dataDir, `guests-${timestamp}.${format === 'json' ? 'json' : 'txt'}`);
    
    if (format === 'json') {
      fs.writeFileSync(filename, JSON.stringify(guests, null, 2));
    } else {
      const content = guests.map(g => 
        `Nom: ${g.nom} | Chambre: ${g.typeChambre} | Personnes: ${g.nombrePersonnes} | Montant: ${g.montantDu} | Dates: ${g.dates}`
      ).join('\n');
      fs.writeFileSync(filename, content);
    }
    
    console.log(`💾 Données exportées vers: ${filename}`);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('👋 Navigateur fermé');
    }
  }

  async run() {
    try {
      await this.initialize();
      await this.login();
      const guests = await this.getTodayGuests();
      
      console.log('\n📋 Clients présents aujourd\'hui:');
      console.log('='.repeat(50));
      
      if (guests.length === 0) {
        console.log('Aucun client trouvé pour aujourd\'hui');
      } else {
        guests.forEach((guest, index) => {
          console.log(`${index + 1}. ${guest.nom}`);
          if (guest.typeChambre) console.log(`   Chambre: ${guest.typeChambre}`);
          if (guest.nombrePersonnes) console.log(`   Personnes: ${guest.nombrePersonnes}`);
          if (guest.montantDu) console.log(`   Montant dû: ${guest.montantDu}`);
          if (guest.dates) console.log(`   Dates: ${guest.dates}`);
        });
      }
      
      console.log('='.repeat(50));
      console.log(`\nTotal: ${guests.length} client(s)\n`);
      
      await this.exportData(guests, 'json');
      await this.exportData(guests, 'txt');
      
      return guests;
    } catch (error) {
      console.error('❌ Erreur:', error.message);
      await this.screenshot('error.png');
      throw error;
    } finally {
      await this.close();
    }
  }
}

// Exécution
const scraper = new AmenitizScraper();
scraper.run()
  .then(guests => {
    console.log('✅ Scraping terminé avec succès');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Échec du scraping:', error);
    process.exit(1);
  });
