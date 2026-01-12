# Domaine de Pipangaille - Scraper de Réservations

Outil de scraping pour récupérer automatiquement les informations des clients séjournant actuellement au Domaine de Pipangaille via la plateforme Amenitiz.

## 📋 Fonctionnalités

- ✅ Connexion automatique au dashboard Amenitiz
- ✅ **Gestion de l'authentification à deux facteurs (2FA)**
- ✅ **Session persistante pour éviter la 2FA à chaque exécution**
- ✅ Récupération des clients présents à la date actuelle
- ✅ Export des données en JSON et TXT
- ✅ Captures d'écran optionnelles pour debug
- ✅ Mode headless ou avec interface

## 🚀 Installation

1. **Cloner ou préparer le projet**
   ```bash
   cd domaine-de-pipangaille-rooms-scraping
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Configurer les credentials**
   
   Copier le fichier d'exemple :
   ```bash
   cp .env.example .env
   ```
   
   Puis éditer `.env` et renseigner vos identifiants Amenitiz :
   ```env
   AMENITIZ_EMAIL=votre-email@example.com
   AMENITIZ_PASSWORD=votre-mot-de-passe
   TWO_FA_CODE=
   HEADLESS=true
   SCREENSHOT=false
   ```

## 🔐 Authentification à deux facteurs (2FA)

Le scraper gère automatiquement l'authentification à deux facteurs d'Amenitiz de deux façons :

### **Première utilisation** (avec code 2FA)

Lors de la première connexion, vous devrez fournir le code 2FA reçu par email :

#### Option 1 : Saisie interactive (recommandée)
Lancez simplement le script, il vous demandera le code :
```bash
npm start
# Le script affichera : "🔐 Code 2FA reçu par email : "
# Entrez le code reçu (ex: 687999)
```

#### Option 2 : Via le fichier .env
Ajoutez temporairement le code dans `.env` :
```env
TWO_FA_CODE=687999
```
Puis lancez le script. **N'oubliez pas de retirer le code après** !

### **Utilisations suivantes** (sans code 2FA)

Après la première connexion réussie :
- ✅ La session est **sauvegardée automatiquement** dans `session/cookies.json`
- ✅ Les prochaines exécutions **réutiliseront cette session**
- ✅ **Aucun nouveau code 2FA ne sera demandé** tant que la session est valide

La session reste valide pendant plusieurs jours/semaines selon la configuration d'Amenitiz.

### Gestion de la session

Si la session expire ou si vous souhaitez vous reconnecter :
```bash
# Supprimer la session sauvegardée
rm -rf session/

# Puis relancer le script (un nouveau code 2FA sera demandé)
npm start
```

## 💻 Utilisation

### Lancer le scraper

```bash
npm start
```

ou

```bash
npm run scrape
```

### Options de configuration

Dans le fichier `.env` :

- `AMENITIZ_EMAIL` : Email de connexion à Amenitiz (requis)
- `AMENITIZ_PASSWORD` : Mot de passe (requis)
- `TWO_FA_CODE` : Code 2FA (optionnel - si vide, sera demandé interactivement)
- `HEADLESS` : `true` pour mode invisible, `false` pour voir le navigateur
- `SCREENSHOT` : `true` pour capturer des screenshots à chaque étape

## 📂 Résultats

Les données sont exportées dans le dossier `data/` :

- **Format JSON** : `guests-YYYY-MM-DD.json` - Données structurées
- **Format TXT** : `guests-YYYY-MM-DD.txt` - Liste simple des clients

Exemple de sortie JSON :
```json
[
  {
    "name": "Jean Dupont",
    "checkIn": "12/01/2026",
    "checkOut": "14/01/2026"
  }
]
```

## 🔧 Debug

Pour déboguer le scraper :

1. Activer le mode visuel :
   ```env
   HEADLESS=false
   ```

2. Activer les screenshots :
   ```env
   SCREENSHOT=true
   ```
   
   Les captures seront sauvegardées dans `screenshots/`

## ⚠️ Important

- **Sécurité** : 
  - Ne jamais committer le fichier `.env` contenant vos credentials
  - Ne jamais committer le dossier `session/` contenant les cookies
  - Les fichiers sensibles sont déjà dans `.gitignore`
- **Session** : La session sauvegardée permet d'éviter la 2FA mais doit être protégée
- **Usage** : Cet outil est destiné à un usage personnel/professionnel légitime
- **Maintenance** : Si Amenitiz modifie son interface, les sélecteurs CSS devront être mis à jour

## 🛠️ Personnalisation

Le fichier principal est `src/index.js`. Les sélecteurs CSS peuvent nécessiter des ajustements selon :
- La structure HTML d'Amenitiz
- Le format d'affichage des dates
- Les classes CSS utilisées

### Ajuster les sélecteurs

Dans la méthode `getTodayGuests()`, modifiez les sélecteurs CSS selon la structure réelle :

```javascript
const nameElement = element.querySelector('.guest-name, .customer-name, [class*="name"]');
```

## 📝 Structure du projet

```
domaine-de-pipangaille-rooms-scraping/
├── src/
│   ├── index.js          # Script principal
│   └── SessionManager.js # Gestion de la session persistante
├── data/                 # Dossier des exports (généré)
├── screenshots/          # Captures d'écran (généré si activé)
├── session/              # Session sauvegardée (généré après première connexion)
├── .env                  # Configuration (à créer)
├── .env.example          # Exemple de configuration
├── .gitignore
├── package.json
└── README.md
```

## 🐛 Dépannage

### Le scraper ne trouve pas les clients

1. Vérifier que les credentials sont corrects
2. Activer `HEADLESS=false` et `SCREENSHOT=true` pour voir ce qui se passe
3. Vérifier les sélecteurs CSS dans le code
4. Consulter les screenshots générés

### Erreur de connexion

- Vérifier l'URL du dashboard Amenitiz
- Vérifier que vos identifiants sont valides
- Vérifier votre connexion internet

### Problème avec la 2FA

**Code 2FA non accepté :**
- Vérifier que vous avez bien entré le code complet (généralement 6 chiffres)
- Le code a une durée de validité limitée, demander un nouveau code si nécessaire
- Activer `HEADLESS=false` et `SCREENSHOT=true` pour voir l'interface

**Session expirée :**
```bash
# Supprimer la session et recommencer
rm -rf session/
npm start
```

**Le scraper redemande toujours la 2FA :**
- Vérifier que le dossier `session/` a bien été créé
- Vérifier les permissions d'écriture du dossier
- Consulter les logs pour voir si la session a bien été sauvegardée

## 📄 License

ISC

## 👨‍💻 Support

Pour toute question ou amélioration, consulter le code source ou adapter selon vos besoins spécifiques.
