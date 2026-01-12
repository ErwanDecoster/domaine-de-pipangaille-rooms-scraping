# Domaine de Pipangaille - Guest Information System

Automated system to retrieve guest information from Amenitiz booking platform. Available as both CLI tool and REST API for Home Assistant integration.

## 📋 Features

- ✅ Automatic login to Amenitiz dashboard
- ✅ **Two-factor authentication (2FA) handling**
- ✅ **Persistent session to avoid 2FA on every run**
- ✅ Retrieval of current guests from arrivals page
- ✅ **REST API with 10-minute auto-refresh**
- ✅ **Home Assistant integration ready**
- ✅ Export data in JSON and TXT formats (CLI mode)
- ✅ Optional screenshots for debugging
- ✅ Headless or visible browser mode
- ✅ Optimized and clean codebase

## 🚀 Quick Start

### 1. Installation

```bash
cd domaine-de-pipangaille-rooms-scraping
npm install
```

### 2. Configuration

Copy the example file:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
AMENITIZ_EMAIL=your-email@example.com
AMENITIZ_PASSWORD=your-password
HEADLESS=true
SCREENSHOT=false
PORT=3000
```

### 3. Start the API Server

```bash
npm start
```

The server will:
- Start on port 3000
- Fetch initial data
- Auto-refresh every 10 minutes
- Expose REST API endpoints

**API Endpoints:**
- `GET /api/guests` - All guests checking in today
- `GET /api/rooms` - Guests grouped by room type
- `GET /api/status` - Server and cache status
- `GET /api/health` - Health check
- `POST /api/refresh` - Force manual refresh

📖 **Full API documentation:** See [API.md](API.md)

### 4. CLI Mode (Manual Scraping)

```bash
npm run scrape
```

Outputs:
- `data/guests-YYYY-MM-DD.json`
- `data/guests-YYYY-MM-DD.txt`

## 🏠 Home Assistant Integration

Add to your `configuration.yaml`:

```yaml
sensor:
  - platform: rest
    name: "Pipangaille Guests"
    resource: "http://YOUR_SERVER_IP:3000/api/guests"
    method: GET
    scan_interval: 600  # 10 minutes
    value_template: "{{ value_json.count }}"
    json_attributes:
      - guests
      - lastRefreshTime
```

The API automatically refreshes data every 10 minutes.

📖 **Complete Home Assistant examples:** See [API.md](API.md)

## 🔐 Two-Factor Authentication (2FA)

The system automatically handles Amenitiz's two-factor authentication:

### **First Run** (with 2FA code)

On the first login, you'll be prompted for the 2FA code received by email:


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

# Then restart the API/CLI (a new 2FA code will be requested)
npm start
```

## 💻 Usage Modes

### API Mode (Recommended for Home Assistant)

```bash
npm start
```

The API server will:
- Start and listen on port 3000
- Perform initial data fetch (may prompt for 2FA)
- Auto-refresh every 10 minutes in the background
- Serve data via REST endpoints

Access the API:
```bash
curl http://localhost:3000/api/guests
curl http://localhost:3000/api/status
```

### CLI Mode (One-time Scraping)

```bash
npm run scrape
```

Performs a single scrape and outputs to:
- `data/guests-YYYY-MM-DD.json` - Structured data
- `data/guests-YYYY-MM-DD.txt` - Simple guest list

## ⚙️ Configuration Options

In the `.env` file:

- `AMENITIZ_EMAIL`: Amenitiz login email (required)
- `AMENITIZ_PASSWORD`: Password (required)
- `HEADLESS`: `true` for invisible mode, `false` to see the browser
- `SCREENSHOT`: `true` to capture screenshots at each step
- `PORT`: API server port (default: 3000)
- `DATA_RETENTION_DAYS`: Keep exported files for N days, older files are automatically deleted (default: 7, set to 0 to disable)

## 📊 Data Format

### API Response Example

```json
{
  "guests": [
    {
      "name": "Jean Dupont",
      "roomType": "Chambre Marocaine",
      "persons": "2",
      "amountDue": "0 €",
      "dates": "12/01/2026 - 14/01/2026"
    }
  ],
  "count": 1,
  "lastRefreshTime": "2024-01-01T10:00:00.000Z",
  "nextRefreshIn": 600
}
```

### CLI Output Files

JSON format: `data/guests-YYYY-MM-DD.json`
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

TXT format: `data/guests-YYYY-MM-DD.txt`
```
Name: Jean Dupont | Room: Chambre Marocaine | Persons: 2 | Amount: 0 € | Dates: 12/01/2026 - 14/01/2026
```

**Automatic Cleanup:** Files older than 7 days (configurable via `DATA_RETENTION_DAYS` in `.env`) are automatically deleted each time you run the scraper. Set `DATA_RETENTION_DAYS=0` to disable cleanup.

## 🔧 Debugging

To debug the scraper:

1. Enable visual mode (see browser actions):
   ```env
   HEADLESS=false
   ```

2. Enable screenshots:
   ```env
   SCREENSHOT=true
   ```
   
   Screenshots will be saved in `screenshots/`

## 🚀 Production Deployment

### Using PM2 (Recommended)

```bash
npm install -g pm2
pm2 start src/server.js --name pipangaille-api
pm2 save
pm2 startup
```

Monitor:
```bash
pm2 logs pipangaille-api
pm2 status
```

### Using systemd

See [API.md](API.md) for complete systemd configuration.

## ⚠️ Important Notes

- **Security**: 
  - Never commit the `.env` file containing your credentials
  - Never commit the `session/` folder containing cookies
  - Sensitive files are already in `.gitignore`
  - **Local network only**: Do not expose API to the internet
- **Session**: The saved session allows bypassing 2FA but must be protected
- **Usage**: This tool is intended for legitimate personal/professional use
- **Maintenance**: If Amenitiz modifies its interface, CSS selectors may need updates

## 🛠️ Architecture

### Files

```
domaine-de-pipangaille-rooms-scraping/
├── src/
│   ├── server.js          # REST API server with auto-refresh
│   ├── cli.js             # CLI scraper (manual usage)
│   ├── ScraperService.js  # Reusable scraping logic
│   └── SessionManager.js  # Persistent session management
├── data/                  # Export folder (CLI mode)
├── screenshots/           # Screenshots (if enabled)
├── session/               # Saved cookies
├── .env                   # Credentials (not committed)
├── .env.example           # Configuration template
├── README.md              # This file
├── API.md                 # API documentation
└── package.json           # Project dependencies
```

### How It Works

1. **ScraperService** - Core browser automation:
   - Launches Puppeteer browser
   - Handles login and 2FA
   - Navigates to arrivals page
   - Extracts guest data from HTML cards

2. **SessionManager** - Session persistence:
   - Saves cookies after successful login
   - Loads cookies on subsequent runs
   - Avoids repeated 2FA prompts

3. **server.js** - REST API (Home Assistant integration):
   - Express server on port 3000
   - 10-minute auto-refresh with NodeCache
   - Multiple endpoints for different data views
   - Non-blocking refresh operations

4. **cli.js** - One-time scraping:
   - Interactive 2FA prompt
   - Exports to JSON/TXT files
   - Useful for manual checks

### Target Page

The scraper accesses the Amenitiz arrivals page:
```
https://domaine-de-pipangaille.amenitiz.io/fr/admin/booking-manager/arrivals
```

It extracts data from booking cards (`.check-in-out-card`):
- Guest name
- Room type
- Number of persons
- Amount due
- Check-in/check-out dates

## 📚 Additional Documentation

- **[API.md](API.md)** - Complete REST API documentation
  - All endpoints
  - Home Assistant integration examples
  - Production deployment guides
  - Troubleshooting

## 🔄 Auto-Refresh Behavior

When running in API mode (`npm start`):
- Initial data fetch on startup
- Auto-refresh every 10 minutes (600 seconds)
- Data cached and served instantly via API
- Background refresh doesn't block requests
- Graceful error handling (continues running on failures)

## 🐛 Troubleshooting

### 2FA Not Working

If running as a background service, the 2FA prompt won't appear. Solution:
1. Run manually first: `npm start`
2. Enter 2FA code when prompted
3. Session saved to `session/cookies.json`
4. Service can now use saved session

### Port Already in Use

Change port in `.env`:
```env
PORT=3001
```

### Data Not Refreshing

Check server logs for errors. The API continues running even if refresh fails.

### Session Expired

Delete session and restart:
```bash
rm -rf session/
npm start
```

### Scraper Doesn't Find Guests

1. Check credentials are correct in `.env`
2. Enable `HEADLESS=false` and `SCREENSHOT=true` to see browser actions
3. Review generated screenshots in `screenshots/`
4. Verify Amenitiz hasn't changed their interface

### Login Error

- Verify Amenitiz dashboard URL is still correct
- Check credentials are valid
- Verify internet connection

## 📄 License

ISC

