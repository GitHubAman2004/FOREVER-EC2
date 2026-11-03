// PM2 settings for running the backend on a server (e.g. AWS EC2)
// start with:  pm2 start ecosystem.config.cjs
// .cjs because package.json has "type": "module" and PM2 reads this file with require()
module.exports = {
    apps: [
        {
            name: 'forever-backend',
            script: 'server.js',
            cwd: __dirname,              // so dotenv finds backend/.env
            instances: 1,
            autorestart: true,           // restart if the app crashes
            max_memory_restart: '400M',  // restart if it leaks memory (t3.micro has only 1 GB)
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
}
