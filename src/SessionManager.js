import fs from 'fs';
import path from 'path';

const SESSION_DIR = './session';
const COOKIES_FILE = path.join(SESSION_DIR, 'cookies.json');

export class SessionManager {
  constructor() {
    this.ensureSessionDir();
  }

  ensureSessionDir() {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }
  }

  async saveCookies(page) {
    try {
      const cookies = await page.cookies();
      fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
      console.log('💾 Session sauvegardée');
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde de la session:', error.message);
      return false;
    }
  }

  async loadCookies(page) {
    try {
      if (!fs.existsSync(COOKIES_FILE)) {
        console.log('ℹ️  Aucune session sauvegardée trouvée');
        return false;
      }

      const cookiesString = fs.readFileSync(COOKIES_FILE, 'utf8');
      const cookies = JSON.parse(cookiesString);
      
      if (cookies.length === 0) {
        console.log('ℹ️  Session vide');
        return false;
      }

      // Vérifier si les cookies ne sont pas expirés
      const now = Date.now() / 1000;
      const validCookies = cookies.filter(cookie => {
        return !cookie.expires || cookie.expires > now;
      });

      if (validCookies.length === 0) {
        console.log('⚠️  Session expirée');
        this.clearSession();
        return false;
      }

      await page.setCookie(...validCookies);
      console.log('✅ Session restaurée');
      return true;
    } catch (error) {
      console.error('❌ Erreur lors du chargement de la session:', error.message);
      return false;
    }
  }

  clearSession() {
    try {
      if (fs.existsSync(COOKIES_FILE)) {
        fs.unlinkSync(COOKIES_FILE);
        console.log('🗑️  Session supprimée');
      }
    } catch (error) {
      console.error('❌ Erreur lors de la suppression de la session:', error.message);
    }
  }

  sessionExists() {
    return fs.existsSync(COOKIES_FILE);
  }
}
