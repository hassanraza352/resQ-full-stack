
# Use a supported Node.js LTS image.
FROM node:22-bookworm-slim

# All backend commands will run from this directory.
WORKDIR /app

# Install dependencies first for better Docker layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy backend source code.
COPY . .

# The container listens on the port configured for RESQ.
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "server.js"]
