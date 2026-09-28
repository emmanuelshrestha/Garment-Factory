FROM node:22-slim

# Create app directory
WORKDIR /usr/src/app

# For the backend, we have zero external npm dependencies.
# Copy backend files and pre-built frontend distribution
COPY backend ./backend
COPY frontend/dist ./frontend/dist
COPY package.json ./

# The database should be in a persistent volume
VOLUME ["/data"]

ENV GARMENT_HOST=0.0.0.0
ENV GARMENT_PORT=4000
ENV GARMENT_DB_PATH=/data/garment.db
ENV GARMENT_WEB_DIST_DIR=/usr/src/app/frontend/dist

EXPOSE 4000

# Run migrations then start the server
CMD ["sh", "-c", "node backend/src/db/migrate.ts && node backend/src/main.ts"]
