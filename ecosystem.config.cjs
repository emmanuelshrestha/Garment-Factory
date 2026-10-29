/**
 * PM2 process definition for the Garment Factory server.
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save && pm2 startup     # survive a reboot
 *
 * CommonJS on purpose: PM2 loads this file with require(), and the repo root
 * is "type": "module", so a .js file here would be ESM that PM2 cannot read.
 *
 * instances MUST stay 1: SQLite allows a single writer, so clustering would
 * corrupt writes rather than scale them.
 */
module.exports = {
  apps: [
    {
      name: 'garment-factory',
      script: 'backend/src/main.ts',
      interpreter: 'node',
      node_args: '--experimental-strip-types',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 2000,
      kill_timeout: 15000, // > the 10s drain window in main.ts
      max_memory_restart: '512M',
      time: true,
      env: {
        NODE_ENV: 'development',
        HOST: '127.0.0.1',
        PORT: '4000',
      },
      env_production: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '4000',
        DATABASE_PATH: './data/garment.db',
        BACKUP_DIR: './data/backups',
        BACKUP_KEEP_DAYS: '30',
        // SESSION_SECRET must come from an env file / pm2 set, never this file:
        //   pm2 set garment-factory:SESSION_SECRET <48-byte-hex>
      },
    },
  ],
};
