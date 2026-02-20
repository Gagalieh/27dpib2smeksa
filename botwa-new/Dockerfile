# Dockerfile untuk deploy ke container (Railway, Render, Docker)

FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy bot files
COPY . .

# Create photos-upload directory
RUN mkdir -p photos-upload

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Run bot
CMD ["node", "index.js"]
