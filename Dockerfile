FROM ghcr.io/puppeteer/puppeteer:19.7.2

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm-dev \
    libasound2 \
    fonts-liberation \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libxss1 \
    libxtst6 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci
COPY . .
CMD [ "node", "server.js" ]