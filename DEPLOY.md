# Deployment Guide

This document outlines the steps to deploy the Garment Factory ERP system to a production environment.

## Prerequisites
- Docker and Docker Compose installed on the host machine.
- Node.js 22 LTS (if running locally without Docker).

## Option 1: Docker Deployment (Recommended)

1.  **Configure Environment:**
    Copy `.env.example` to `.env.production` and update the values, especially `GARMENT_OWNER_PASSWORD`.

2.  **Build the Image:**
    ```bash
    docker build -t garment-factory .
    ```

3.  **Run the Container:**
    ```bash
    docker run -d \
      -p 4000:4000 \
      -v ./data:/app/data \
      --env-file .env.production \
      --name garment-factory \
      garment-factory
    ```

## Option 2: Bare Metal Deployment

1.  **Build Frontend:**
    ```bash
    cd web
    npm install
    npm run build
    cd ..
    ```

2.  **Install Backend Dependencies:**
    ```bash
    npm install
    ```

3.  **Run Migrations:**
    ```bash
    npm run migrate
    ```

4.  **Start Server:**
    ```bash
    export GARMENT_DATABASE_PATH=/path/to/data/factory.db
    export GARMENT_WEB_DIST_DIR=/path/to/web/dist
    export GARMENT_PORT=4000
    npm start
    ```

## Backups
To perform a hot backup of the SQLite database without stopping the application, run:
```bash
npm run backup
```
This will create a consistent snapshot of the database in the data directory.

## Maintenance
- **Database Migrations:** Migrations are applied automatically upon server startup (`npm start`). Ensure the `data` directory is writable by the application user.
- **Logs:** Application logs are directed to stdout/stderr. If using Docker, view them with `docker logs garment-factory`.
