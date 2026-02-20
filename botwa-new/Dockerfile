FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /app/botwa-new

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

COPY botwa-new/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY botwa-new/ ./

RUN mkdir -p /data/session /data/photos-upload \
    && chown -R node:node /app /data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');const port=process.env.PORT||3000;http.get('http://127.0.0.1:'+port+'/health',(res)=>process.exit(res.statusCode===200?0:1)).on('error',()=>process.exit(1));"

CMD ["npm", "start"]
