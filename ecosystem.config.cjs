/**
 * PM2：Next.js standalone（仅监听 127.0.0.1，由本机 Nginx 反代）
 *
 * 启动：pm2 start ecosystem.config.cjs
 * 重载：pm2 reload ecosystem.config.cjs
 * 日志：pm2 logs subscan-ui-standalone
 *
 * 首次部署前需：npm run build
 * 改 .env.production / 代码后需重新 build，再 pm2 reload
 */
module.exports = {
  apps: [
    {
      name: 'subscan-ui-standalone',
      cwd: __dirname,
      script: '.next/standalone/server.js',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        /** 仅本机回环；Nginx proxy_pass http://127.0.0.1:3000 */
        HOSTNAME: '127.0.0.1',
      },
    },
  ],
}
