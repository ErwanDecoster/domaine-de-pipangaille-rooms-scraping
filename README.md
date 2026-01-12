# Domaine de Pipangaille - Booking Scraper

Automated scraping tool to retrieve guest information currently staying at Domaine de Pipangaille via the Amenitiz platform.

## 📋 Features

- ✅ Automatic login to Amenitiz dashboard
- ✅ **Two-factor authentication (2FA) handling**
- ✅ **Persistent session to avoid 2FA on every run**
- ✅ Retrieval of current guests from arrivals page
- ✅ Export data in JSON and TXT formats
- ✅ Optional screenshots for debugging
- ✅ Headless or visible browser mode
- ✅ Optimized and clean codebase

## 🚀 Installation

1. **Navigate to the project**
   ```bash
   cd domaine-de-pipangaille-rooms-scraping
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure credentials**
   
   Copy the example file:
   ```bash
   cp .env.example .env
   ```
   
   Then edit `.env` and add your Amenitiz credentials:
   ```env
   AMENITIZ_EMAIL=your-email@example.com
   AMENITIZ_PASSWORD=your-password
   HEADLESS=true
   SCREENSHOT=false
   ```

## 🔐 Two-Factor Authentication (2FA)

The scraper automatically handles Amenitiz's two-factor authentication:

### **First Run** (with 2FA code)

On the first login, you'll need to provide the 2FA code received by email:

```bash
npm start
# The script will prompt: "🔐 2FA code received by email: "
# Enter the code (e.g., 687999)
```

### **Subsequent Runs** (without 2FA code)

After the first successful login:
- ✅ The session is **automatically saved** in `session/cookies.json`
- ✅ Next executions will **reuse this session**
- ✅ **No new 2FA code will be requested** as long as the session is valid

The session remains valid for several days/weeks depending on Amenitiz's configuration.

### Session Management

If the session expires or you want to reconnect:
```bash
# Delete the saved session
rm -rf session/

# Then run the script again (a new 2FA code will be requested)
npm start
```

## 💻 Usage

### Run the scraper

```bash
npm start
```

or

```bash
npm run scrape
```

### Configuration Options

In the `.env` file:

- `AMENITIZ_EMAIL`: Amenitiz login email (required)
- `AMENITIZ_PASSWORD`: Password (required)
- `HEADLESS`: `true` for invisible mode, `false` to see the browser
- `SCREENSHOT`: `true` to capture screenshots at each step

## 📂 Results

Data is exported to the `data/` folder:

- **JSON format**: `guests-YYYY-MM-DD.json` - Structured data
- **TXT format**: `guests-YYYY-MM-DD.txt` - Simple guest list

Example JSON output:
```json
[
  {
    "name": "Jean Dupont",
    "roomType": "Chambre Marocaine",
    "persons": "2",
    "amountDue": "0 €",
    "dates": "12/01/2026 - 14/01/2026"
  }
]
```

Example TXT output:
```
Name: Jean Dupont | Room: Chambre Marocaine | Persons: 2 | Amount: 0 € | Dates: 12/01/2026 - 14/01/2026
```

## 🔧 Debug

To debug the scraper:

1. Enable visual mode:
   ```env
   HEADLESS=false
   ```

2. Enable screenshots:
   ```env
   SCREENSHOT=true
   ```
   
   Screenshots will be saved in `screenshots/`

## ⚠️ Important

- **Security**: 
  - Never commit the `.env` file containing your credentials
  - Never commit the `session/` folder containing cookies
  - Sensitive files are already in `.gitignore`
- **Session**: The saved session allows bypassing 2FA but must be protected
- **Usage**: This tool is intended for legitimate personal/professional use
- **Maintenance**: If Amenitiz modifies its interface, CSS selectors may need to be updated

## 🛠️ Customization

The main file is [src/index.js](src/index.js). The scraper targets the Amenitiz arrivals page at:
```
https://domaine-de-pipangaille.amenitiz.io/fr/admin/booking-manager/arrivals
```

It extracts data from booking cards with the class `.check-in-out-card`:
- Guest name
- Room type
- Number of persons
- Amount due
- Check-in/check-out dates

## 📝 Project Structure

```
domaine-de-pipangaille-rooms-scraping/
├── src/
│   ├── index.js          # Main script (optimized)
│   └── SessionManager.js # Persistent session management
├── data/                 # Export folder (generated)
├── screenshots/          # Screenshots (generated if enabled)
├── session/              # Saved session (generated after first login)
├── .env                  # Configuration (to create)
├── .env.example          # Configuration example
├── .gitignore
├── package.json
└── README.md
```

## 🐛 Troubleshooting

### Scraper doesn't find guests

1. Check that credentials are correct
2. Enable `HEADLESS=false` and `SCREENSHOT=true` to see what's happening
3. Check the generated screenshots

### Login error

- Verify the Amenitiz dashboard URL
- Verify your credentials are valid
- Check your internet connection

### 2FA issues

**2FA code not accepted:**
- Verify you entered the complete code (usually 6 digits)
- The code has a limited validity, request a new code if necessary
- Enable `HEADLESS=false` and `SCREENSHOT=true` to see the interface

**Session expired:**
```bash
# Delete the session and start over
rm -rf session/
npm start
```

**Scraper always requests 2FA:**
- Check that the `session/` folder was created
- Check folder write permissions
- Review logs to see if the session was saved successfully

## 📄 License

ISC
