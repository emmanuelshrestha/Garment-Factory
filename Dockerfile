FROM node:22-slim

# Create app directory
WORKDIR /usr/src/app

# Install dependencies (only for building the web part if not pre-built, 
# but here we assume web/dist is built or will be copied)
# For the backend, we have zero dependencies, so no npm install needed.
# Copy necessary files
COPY src ./src
COPY scripts ./scripts
COPY web/dist ./web/dist
COPY package.json ./

# The database should be in a persistent volume
VOLUME ["/data"]

ENV GARMENT_HOST=0.0.0.0
ENV GARMENT_PORT=4000
ENV GARMENT_DB_PATH=/data/garment.db
ENV GARMENT_WEB_DIST_DIR=/usr/src/app/web/dist

EXPOSE 4000

# Run migrations then start the server
CMD ["sh", "-c", "node src/db/migrate.ts && node src/main.ts"]
