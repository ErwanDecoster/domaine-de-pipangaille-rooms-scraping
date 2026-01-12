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
    
    // Créer le dossier screenshots si nécessaire
    if (process.env.SCREENSHOT === 'true' && !fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    this.browser = await puppeteer.launch({
      headless: process.env.HEADLESS === 'true',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: {
        width: 1920,
        height: 1080
      }
    });

    this.page = await this.browser.newPage();
    
    // Définir un user agent pour éviter les blocages
    await this.page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
  }

  async login() {
    console.log('🔐 Connexion à Amenitiz...');
    
    const email = process.env.AMENITIZ_EMAIL;
    const password = process.env.AMENITIZ_PASSWORD;
    const twoFACode = process.env.TWO_FA_CODE; // Code 2FA optionnel via .env

    if (!email || !password) {
      throw new Error('Les credentials AMENITIZ_EMAIL et AMENITIZ_PASSWORD doivent être définis dans le fichier .env');
    }

    // Essayer de charger une session existante
    await this.page.goto(AMENITIZ_LOGIN_URL, { waitUntil: 'networkidle2' });
    
    const sessionLoaded = await this.sessionManager.loadCookies(this.page);
    
    if (sessionLoaded) {
      console.log('🔄 Tentative de connexion avec la session sauvegardée...');
      await this.page.reload({ waitUntil: 'networkidle2' });
      
      // Vérifier si on est bien connecté
      const isLoggedIn = await this.checkIfLoggedIn();
      if (isLoggedIn) {
        console.log('✅ Session restaurée avec succès');
        return;
      }
      
      console.log('⚠️  Session expirée, connexion manuelle nécessaire');
      this.sessionManager.clearSession();
    }
    
    // Attendre le formulaire de connexion
    await this.page.waitForSelector('input[type="email"], input[name="email"], input[type="text"]', { timeout: 10000 });
    
    // Remplir le formulaire
    const emailInput = await this.page.$('input[type="email"], input[name="email"]');
    if (emailInput) {
      await emailInput.type(email, { delay: 100 });
    }

    const passwordInput = await this.page.$('input[type="password"], input[name="password"]');
    if (passwordInput) {
      await passwordInput.type(password, { delay: 100 });
    }

    if (process.env.SCREENSHOT === 'true') {
      await this.page.screenshot({ path: path.join(SCREENSHOT_DIR, '1-login-form.png') });
    }

    // Soumettre le formulaire
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
      this.page.click('button[type="submit"], input[type="submit"]')
    ]);

    // Attendre un peu pour que la page se charge
    await this.delay(2000);

    if (process.env.SCREENSHOT === 'true') {
      await this.page.screenshot({ path: path.join(SCREENSHOT_DIR, '2-after-login.png') });
    }

    // Vérifier si un code 2FA est demandé
    const needs2FA = await this.check2FARequired();
    
    if (needs2FA) {
      console.log('🔐 Authentification à deux facteurs requise');
      
      let code = twoFACode;
      
      // Si pas de code dans .env, demander interactivement
      if (!code) {
        code = await this.promptFor2FACode();
      } else {
        console.log('✅ Code 2FA trouvé dans .env');
      }
      
      await this.submit2FACode(code);
    }

    console.log('✅ Connexion réussie');
    
    // Sauvegarder la session pour les prochaines fois
    await this.sessionManager.saveCookies(this.page);
    
    if (process.env.SCREENSHOT === 'true') {
      await this.page.screenshot({ path: path.join(SCREENSHOT_DIR, '3-dashboard.png') });
    }
  }

  async checkIfLoggedIn() {
    try {
      // Vérifier si on est sur le dashboard ou si on voit des éléments de l'interface admin
      const url = this.page.url();
      
      // Si on est toujours sur la page de login, on n'est pas connecté
      if (url.includes('/login') || url.includes('/signin')) {
        return false;
      }
      
      // Chercher des éléments typiques du dashboard
      const dashboardElement = await this.page.$('nav, .dashboard, .admin, [class*="menu"]');
      return dashboardElement !== null;
    } catch (error) {
      return false;
    }
  }

  async check2FARequired() {
    try {
      // Chercher des indices de demande de 2FA
      const possible2FASelectors = [
        'input[name="code"]',
        'input[name="otp"]',
        'input[name="token"]',
        'input[placeholder*="code"]',
        'input[type="text"][maxlength="6"]',
        'input[type="number"][maxlength="6"]',
        '[class*="two-factor"]',
        '[class*="2fa"]',
        '[class*="verification"]'
      ];

      for (const selector of possible2FASelectors) {
        const element = await this.page.$(selector);
        if (element) {
          console.log(`ℹ️  Champ 2FA détecté: ${selector}`);
          return true;
        }
      }

      // Vérifier le texte de la page
      const pageText = await this.page.evaluate(() => document.body.innerText.toLowerCase());
      const keywords2FA = ['code de vérification', 'two-factor', '2fa', 'authentification', 'verification code', 'code envoyé'];
      
      for (const keyword of keywords2FA) {
        if (pageText.includes(keyword)) {
          console.log(`ℹ️  Mention 2FA détectée: "${keyword}"`);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Erreur lors de la vérification 2FA:', error.message);
      return false;
    }
  }

  async submit2FACode(code) {
    console.log(`🔐 Saisie du code 2FA: ${code}`);
    
    try {
      // Chercher le champ de code
      const codeInput = await this.page.$('input[name="code"], input[name="otp"], input[name="token"], input[placeholder*="code"], input[type="text"][maxlength="6"], input[type="number"][maxlength="6"]');
      
      if (!codeInput) {
        throw new Error('Impossible de trouver le champ de saisie du code 2FA');
      }

      await codeInput.type(code, { delay: 100 });

      if (process.env.SCREENSHOT === 'true') {
        await this.page.screenshot({ path: path.join(SCREENSHOT_DIR, '2b-2fa-code.png') });
      }

      // Chercher et cliquer sur le bouton de validation
      // D'abord essayer les sélecteurs CSS standards
      let submitButton = await this.page.$('button[type="submit"], input[type="submit"]');
      
      // Si pas trouvé, chercher un bouton par son texte
      if (!submitButton) {
        submitButton = await this.page.evaluateHandle(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const textToFind = ['valider', 'verify', 'confirmer', 'submit', 'envoyer', 'continuer'];
          return buttons.find(btn => {
            const text = btn.textContent.toLowerCase();
            return textToFind.some(keyword => text.includes(keyword));
          });
        });
        
        // Vérifier si un bouton a été trouvé
        const buttonElement = submitButton.asElement();
        if (buttonElement) {
          submitButton = buttonElement;
        } else {
          submitButton = null;
        }
      }
      
      if (submitButton) {
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
          submitButton.click()
        ]);
      } else {
        // Si pas de bouton trouvé, essayer d'appuyer sur Entrée
        console.log('ℹ️  Bouton non trouvé, tentative avec la touche Entrée');
        await codeInput.press('Enter');
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      }

      await this.delay(2000);
      
      console.log('✅ Code 2FA validé');
    } catch (error) {
      console.error('❌ Erreur lors de la saisie du code 2FA:', error.message);
      throw error;
    }
  }

  async getTodayGuests() {
    console.log('📅 Récupération des clients du jour...');
    
    try {
      // Naviguer vers la page des arrivées (booking manager)
      console.log('🔗 Navigation vers la page des arrivées...');
      await this.page.goto('https://domaine-de-pipangaille.amenitiz.io/fr/admin/booking-manager/arrivals', { 
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      console.log('⏳ Attente du chargement complet de la page...');
      // Attendre le chargement initial
      await this.delay(3000);
      
      // Attendre que les cartes de réservation apparaissent
      console.log('🔍 Recherche des réservations sur la page...');
      try {
        await this.page.waitForSelector('.check-in-out-card', { 
          timeout: 10000 
        });
        console.log('✅ Cartes de réservation détectées');
      } catch (e) {
        console.log('⚠️  Aucune carte de réservation trouvée');
      }
      
      // Attendre un peu plus pour être sûr que tout est chargé
      await this.delay(2000);
      
      if (process.env.SCREENSHOT === 'true') {
        await this.page.screenshot({ path: path.join(SCREENSHOT_DIR, '3-arrivals.png') });
      }

      // Extraire les informations des clients selon la structure HTML fournie
      console.log('📊 Extraction des données...');
      const guests = await this.page.evaluate(() => {
        const results = [];
        
        // Sélectionner toutes les cartes de réservation
        const bookingCards = document.querySelectorAll('.check-in-out-card');
        
        bookingCards.forEach(card => {
          try {
            // Nom du client
            const nameElement = card.querySelector('.check-in-out-card-title p');
            const name = nameElement ? nameElement.textContent.trim() : '';
            
            // Type de chambre - extraire depuis le titre complet
            const roomElement = card.querySelector('.check-in-out-card-room p');
            let roomType = '';
            if (roomElement) {
              const fullRoomText = roomElement.textContent.trim();
              // Extraire le nom de la chambre après le numéro entre parenthèses
              // Format: "Chambre  (4) Chambre Marocaine" -> "Chambre Marocaine"
              const match = fullRoomText.match(/\(\d+\)\s*(.+)$/);
              roomType = match ? match[1].trim() : fullRoomText;
            }
            
            // Vérifier aussi dans le paragraphe "Type de chambre:"
            if (!roomType) {
              const roomInfoElements = card.querySelectorAll('.card-info p');
              roomInfoElements.forEach(p => {
                const text = p.textContent;
                if (text.includes('Type de chambre:')) {
                  const strong = p.querySelector('strong');
                  if (strong) {
                    roomType = strong.textContent.trim();
                  }
                }
              });
            }
            
            // Dates
            const dateElement = card.querySelector('.check-in-out-card-date');
            const dates = dateElement ? dateElement.textContent.trim() : '';
            
            // Nombre de personnes
            const personsElement = card.querySelector('.card-info.u-flex.pb2 .size0');
            let persons = '';
            if (personsElement) {
              const personsText = personsElement.textContent.trim();
              // Extraire le nombre avant "x" (ex: "1  x" -> "1")
              const match = personsText.match(/(\d+)\s*x/);
              persons = match ? match[1] : personsText.replace(/\s*x\s*/, '').trim();
            }
            
            // Montant dû
            const amountElements = card.querySelectorAll('.card-info p');
            let amount = '';
            amountElements.forEach(p => {
              const text = p.textContent;
              if (text.includes('Montant dû:')) {
                const strong = p.querySelector('strong');
                if (strong) {
                  amount = strong.textContent.trim();
                }
              }
            });
            
            // Ajouter la réservation si on a au moins un nom
            if (name) {
              results.push({
                nom: name,
                typeChambre: roomType,
                nombrePersonnes: persons,
                montantDu: amount,
                dates: dates
              });
            }
          } catch (error) {
            console.error('Erreur lors de l\'extraction d\'une carte:', error);
          }
        });
        
        return results;
      });

      console.log(`✅ ${guests.length} réservation(s) trouvée(s)`);
      
      // Si aucune réservation trouvée, extraire le contenu pour debug
      if (guests.length === 0) {
        console.log('⚠️  Aucune réservation trouvée, analyse du contenu de la page...');
        const pageContent = await this.page.evaluate(() => {
          return {
            bodyText: document.body.innerText.substring(0, 2000),
            hasCards: document.querySelectorAll('.check-in-out-card').length
          };
        });
        console.log('\n📄 Contenu textuel de la page:');
        console.log(pageContent.bodyText);
        console.log(`\nNombre de cartes .check-in-out-card trouvées: ${pageContent.hasCards}`);
      }
      
      return guests;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des clients:', error.message);
      
      // En cas d'erreur, extraire toutes les données textuelles visibles pour analyse
      const pageText = await this.page.evaluate(() => document.body.innerText);
      console.log('\n📄 Contenu de la page:');
      console.log(pageText.substring(0, 1000) + '...');
      
      throw error;
    }
  }

  filterTodayGuests(guests) {
    // Pour l'instant, retourner tous les invités trouvés
    // Cette fonction pourra être affinée si on a accès aux dates
    return guests;
  }

  async exportData(guests, format = 'json') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dataDir = './data';
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (format === 'json') {
      const filename = path.join(dataDir, `guests-${timestamp}.json`);
      fs.writeFileSync(filename, JSON.stringify(guests, null, 2));
      console.log(`💾 Données exportées vers: ${filename}`);
    } else if (format === 'txt') {
      const filename = path.join(dataDir, `guests-${timestamp}.txt`);
      const content = guests.map(g => {
        const parts = [
          `Nom: ${g.nom}`,
          `Chambre: ${g.typeChambre}`,
          `Personnes: ${g.nombrePersonnes}`,
          `Montant: ${g.montantDu}`,
          `Dates: ${g.dates}`
        ];
        return parts.join(' | ');
      }).join('\n');
      fs.writeFileSync(filename, content);
      console.log(`💾 Données exportées vers: ${filename}`);
    }
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
      
      if (process.env.SCREENSHOT === 'true' && this.page) {
        await this.page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error.png') });
      }
      
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
