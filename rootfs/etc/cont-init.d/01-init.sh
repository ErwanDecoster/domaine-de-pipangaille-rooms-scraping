#!/usr/bin/with-contenv bashio
# ==============================================================================
# Home Assistant Add-on: Domaine de Pipangaille Guest Manager
# Initialization script - runs before services start
# ==============================================================================

bashio::log.info "Initializing Domaine de Pipangaille Guest Manager..."

# Create necessary directories
bashio::log.info "Creating data directories..."
mkdir -p /data/session /data/data /data/screenshots

# Set proper permissions
chmod -R 755 /data/session /data/data /data/screenshots

# Validate configuration
if ! bashio::config.has_value 'amenitiz_email'; then
    bashio::log.warning "No amenitiz_email configured!"
fi

if ! bashio::config.has_value 'amenitiz_password'; then
    bashio::log.warning "No amenitiz_password configured!"
fi

# Display add-on configuration
bashio::log.info "Add-on configuration:"
bashio::log.info "  Port: $(bashio::config 'port')"
bashio::log.info "  Headless mode: $(bashio::config 'headless')"
bashio::log.info "  Screenshot enabled: $(bashio::config 'screenshot')"
bashio::log.info "  Data retention: $(bashio::config 'data_retention_days') days"

bashio::log.info "Initialization complete!"
