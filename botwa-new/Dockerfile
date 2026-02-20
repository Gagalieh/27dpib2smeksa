# Use Node 18 slim image
FROM node:18-slim

# Set working directory
WORKDIR /app/botwa-new

# Install dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Copy package files from botwa-new
COPY botwa-new/package*.json ./

# Install npm dependencies
RUN npm install --production

# Copy bot files
COPY botwa-new/ ./

# Create photos directory
RUN mkdir -p ../photos-upload

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('ok')" || exit 1

# Run bot
CMD ["npm", "start"]
