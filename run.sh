#!/usr/bin/env bashio

config_path="/data/options.json"

# Create default options if file doesn't exist
if [ ! -f "$config_path" ]; then
  mkdir -p /data
  cat > "$config_path" << 'EOF'
{
  "amenitiz_email": "",
  "amenitiz_password": "",
  "port": 3000,
  "headless": true,
  "screenshot": false,
  "data_retention_days": 7
}
EOF
  echo "⚠️  Created default /data/options.json. Please configure credentials."
fi

# Load and parse options from Home Assistant config file (default)
amenitiz_email=$(jq -r '.amenitiz_email // ""' "$config_path" 2>/dev/null)
amenitiz_password=$(jq -r '.amenitiz_password // ""' "$config_path" 2>/dev/null)
port=$(jq -r '.port // 3000' "$config_path" 2>/dev/null)
headless=$(jq -r '.headless // true' "$config_path" 2>/dev/null)
screenshot=$(jq -r '.screenshot // false' "$config_path" 2>/dev/null)
data_retention_days=$(jq -r '.data_retention_days // 7' "$config_path" 2>/dev/null)

# Allow environment variables to override config file values
amenitiz_email="${AMENITIZ_EMAIL:-$amenitiz_email}"
amenitiz_password="${AMENITIZ_PASSWORD:-$amenitiz_password}"
port="${PORT:-$port}"
headless="${HEADLESS:-$headless}"
screenshot="${SCREENSHOT:-$screenshot}"
data_retention_days="${DATA_RETENTION_DAYS:-$data_retention_days}"

# Warn if credentials not configured
if [ -z "$amenitiz_email" ] || [ -z "$amenitiz_password" ]; then
  echo "⚠️  Warning: amenitiz_email and amenitiz_password not configured"
  echo "    The API will start but scraping will fail without credentials"
fi

# Export as environment variables for Node.js
export AMENITIZ_EMAIL="$amenitiz_email"
export AMENITIZ_PASSWORD="$amenitiz_password"
export PORT="$port"
export HEADLESS="$headless"
export SCREENSHOT="$screenshot"
export DATA_RETENTION_DAYS="$data_retention_days"

# Log startup info
echo "🚀 Starting Domaine de Pipangaille Guest Manager"
echo "📧 Email: $amenitiz_email"
echo "🔌 Port: $port"
echo "🖥️  Headless: $headless"
echo "📸 Screenshots: $screenshot"
echo "🗑️  Data retention: $data_retention_days days"
echo ""

# Start the Node.js server
cd /app
exec node src/server.js
