import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import NodeCache from 'node-cache';
import { ScraperService } from './ScraperService.js';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

const app = express();
const port = process.env.PORT || 3000;

// Data directories (Home Assistant addon compatible)
const DATA_DIR = process.env.DATA_DIR || '/data/data';
const SESSION_DIR = process.env.SESSION_DIR || '/data/session';

// Ensure directories exist
[DATA_DIR, SESSION_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Cache with 10-minute TTL (600 seconds)
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// Middleware
app.use(cors());
app.use(express.json());

// State management
let isRefreshing = false;
let lastRefreshTime = null;
let lastRefreshTimestamp = null;
let lastError = null;
let twoFARequired = false;
let twoFAResolver = null;
let twoFATimeoutId = null;
let autoRefreshDisabled = false;  // Flag to disable auto-refresh until manual intervention

// Refresh interval: 10 minutes
const REFRESH_INTERVAL = 10 * 60 * 1000;

/**
 * Calculates seconds until the next refresh
 */
function getSecondsUntilNextRefresh() {
  if (!lastRefreshTimestamp) {
    return REFRESH_INTERVAL / 1000;
  }
  
  const elapsedMs = Date.now() - lastRefreshTimestamp;
  const remainingMs = Math.max(0, REFRESH_INTERVAL - elapsedMs);
  return Math.ceil(remainingMs / 1000);
}

/**
 * Prompts for 2FA code - handles both interactive and Docker environments
 */
async function prompt2FACode(errorMessage = null) {
  // If stdin is not a TTY (Docker detached mode), wait for API submission
  if (!process.stdin.isTTY) {
    if (errorMessage) {
      console.log(`[ERROR] ${errorMessage}`);
    }
    console.log('[INFO] 2FA required. Use POST /api/2fa to submit the code.');
    twoFARequired = true;
    
    return new Promise((resolve) => {
      twoFAResolver = (code) => {
        twoFARequired = false;
        resolve(code);
      };
      
      // Set timeout only once per refresh attempt (not per prompt)
      if (!twoFATimeoutId) {
        twoFATimeoutId = setTimeout(() => {
          if (twoFAResolver) {
            twoFAResolver(''); // Return empty to fail gracefully
            twoFAResolver = null;
            twoFARequired = false;
            twoFATimeoutId = null;
            console.log('[ERROR] 2FA code submission timeout (5 minutes). Please retry with /api/refresh');
          }
        }, 5 * 60 * 1000);
      }
    });
  }
  
  // Interactive mode (CLI)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const prompt = errorMessage ? `[ERROR] ${errorMessage}\nEnter 2FA code: ` : 'Enter 2FA code: ';

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Fetches fresh data from Amenitiz
 */
async function refreshData(isMandatory = false) {
  // Check if auto-refresh is disabled
  if (!isMandatory && autoRefreshDisabled) {
    console.log('[INFO] Auto-refresh is disabled. Use POST /api/refresh to manually trigger a refresh.');
    return;
  }
  
  if (isRefreshing) {
    console.log('[INFO] Refresh already in progress, skipping...');
    return;
  }

  isRefreshing = true;
  const startTime = new Date().toISOString();
  console.log(`[${startTime}] Starting data refresh...`);

  try {
    const scraper = new ScraperService({
      headless: process.env.HEADLESS !== 'false',
      screenshot: process.env.SCREENSHOT === 'true'
    });

    const guests = await scraper.scrape(prompt2FACode);
    
    cache.set('guests', guests);
    cache.set('rooms', extractRoomData(guests));
    
    lastRefreshTime = new Date().toISOString();
    lastRefreshTimestamp = Date.now();
    lastError = null;
    autoRefreshDisabled = false;   // Re-enable auto-refresh on success
    
    // Clear 2FA state on success
    if (twoFATimeoutId) {
      clearTimeout(twoFATimeoutId);
      twoFATimeoutId = null;
    }
    twoFARequired = false;
    twoFAResolver = null;
    
    console.log(`[${lastRefreshTime}] Data refreshed successfully: ${guests.length} guests found`);
    if (isMandatory) {
      console.log('[INFO] Auto-refresh has been re-enabled');
    }
  } catch (error) {
    lastError = {
      message: error.message,
      timestamp: new Date().toISOString()
    };
    console.error(`[${new Date().toISOString()}] Refresh failed: ${error.message}`);
    
    // Disable auto-refresh on any failure
    if (isMandatory) {
      autoRefreshDisabled = true;
      console.error('[ERROR] Auto-refresh disabled due to failure. Use POST /api/refresh to retry manually.');
    } else {
      autoRefreshDisabled = true;
    }
    
    // Clear 2FA state on failure
    if (twoFATimeoutId) {
      clearTimeout(twoFATimeoutId);
      twoFATimeoutId = null;
    }
    twoFARequired = false;
    twoFAResolver = null;
  } finally {
    isRefreshing = false;
  }
}

/**
 * Extracts room-specific data from guests
 */
function extractRoomData(guests) {
  const rooms = {};
  
  guests.forEach(guest => {
    if (!rooms[guest.roomType]) {
      rooms[guest.roomType] = [];
    }
    rooms[guest.roomType].push({
      name: guest.name,
      persons: guest.persons,
      dates: guest.dates,
      amountDue: guest.amountDue
    });
  });
  
  return rooms;
}

// API Endpoints

/**
 * GET /api/guests - Returns all guests for today
 */
app.get('/api/guests', (req, res) => {
  const guests = cache.get('guests');
  
  if (!guests) {
    return res.status(503).json({
      error: 'Data not available yet',
      message: 'Please wait for the first data refresh',
      lastError: lastError
    });
  }
  
  res.json({
    guests: guests,
    count: guests.length,
    lastRefreshTime: lastRefreshTime,
    nextRefreshIn: getSecondsUntilNextRefresh()
  });
});

/**
 * GET /api/rooms - Returns guests grouped by room type
 */
app.get('/api/rooms', (req, res) => {
  const rooms = cache.get('rooms');
  
  if (!rooms) {
    return res.status(503).json({
      error: 'Data not available yet',
      message: 'Please wait for the first data refresh',
      lastError: lastError
    });
  }
  
  res.json({
    rooms: rooms,
    lastRefreshTime: lastRefreshTime,
    nextRefreshIn: getSecondsUntilNextRefresh()
  });
});

/**
 * GET /api/status - Returns server and cache status
 */
app.get('/api/status', (req, res) => {
  const guests = cache.get('guests');
  
  res.json({
    status: 'running',
    isRefreshing: isRefreshing,
    twoFARequired: twoFARequired,
    autoRefreshEnabled: !autoRefreshDisabled,
    autoRefreshStatus: autoRefreshDisabled ? 'disabled (manual refresh required)' : 'enabled',
    lastRefreshTime: lastRefreshTime,
    nextRefreshIn: autoRefreshDisabled ? null : getSecondsUntilNextRefresh(),
    cacheStatus: guests ? 'ready' : 'empty',
    guestCount: guests ? guests.length : 0,
    lastError: lastError
  });
});

/**
 * GET /api/health - Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/2fa - Submit 2FA code for ongoing refresh
 */
app.post('/api/2fa', (req, res) => {
  const { code } = req.body;
  
  if (!code || !twoFAResolver) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'No 2FA code provided or no 2FA verification in progress'
    });
  }
  
  twoFAResolver(code);
  twoFAResolver = null;
  
  res.json({
    message: '2FA code submitted',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/refresh - Force a manual refresh
 */
app.post('/api/refresh', async (req, res) => {
  if (isRefreshing) {
    return res.status(429).json({
      error: 'Refresh already in progress',
      message: 'Please wait for the current refresh to complete'
    });
  }
  
  res.json({
    message: 'Refresh started',
    timestamp: new Date().toISOString()
  });
  
  // Start refresh in background with mandatory flag to bypass auto-refresh checks
  refreshData(true);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[INFO] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[INFO] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('[INFO] SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('[INFO] Server closed');
    process.exit(0);
  });
});

// Start server
const server = app.listen(port, async () => {
  console.log(`[INFO] Server running on http://localhost:${port}`);
  console.log(`[INFO] Auto-refresh interval: ${REFRESH_INTERVAL / 1000} seconds (10 minutes)`);
  console.log('[INFO] Available endpoints:');
  console.log(`[INFO]   GET  http://localhost:${port}/api/guests   - Get all guests`);
  console.log(`[INFO]   GET  http://localhost:${port}/api/rooms    - Get guests by room`);
  console.log(`[INFO]   GET  http://localhost:${port}/api/status   - Get server status`);
  console.log(`[INFO]   GET  http://localhost:${port}/api/health   - Health check`);
  console.log(`[INFO]   POST http://localhost:${port}/api/refresh  - Force refresh`);
  console.log(`[INFO]   POST http://localhost:${port}/api/2fa      - Submit 2FA code`);
  
  // Initial data fetch
  console.log('[INFO] Starting initial data fetch...');
  await refreshData();
  
  // Set up auto-refresh interval
  setInterval(refreshData, REFRESH_INTERVAL);
  console.log('[INFO] Auto-refresh scheduled');
});

export default app;
