FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libnss3 libatk-bridge2.0-0 libx11-xcb1 libxcb1 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
    libcups2 libdrm2 libatk1.0-0 libglib2.0-0 fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG RENDER_GIT_COMMIT
RUN npm run build && npm run video:browser
RUN mkdir -p /app/data && chown -R node:node /app/data /app/node_modules/.remotion
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATA_DIR=/app/data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3001/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
