ARG BUILD_FROM
FROM ${BUILD_FROM}

# Install Node.js and additional dependencies
RUN apk add --no-cache \
  nodejs \
  npm \
  ca-certificates \
  chromium \
  chromium-chromedriver

# Create app directory
WORKDIR /app

# Copy package files
COPY rootfs/app/package*.json ./

# Install Node.js dependencies
RUN npm install --only=production --no-optional

# Copy application files
COPY rootfs/app/src ./src

# Copy s6-overlay configuration
COPY rootfs/ /

# Set proper permissions for s6 scripts
RUN chmod a+x /etc/services.d/guest-manager/run && \
  chmod a+x /etc/services.d/guest-manager/finish && \
  chmod a+x /etc/cont-init.d/01-init.sh

# Set environment
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
