# Moving the backend from Render to AWS EC2

This guide moves the Express backend (`backend/`) to an AWS EC2 server. The frontend and admin panel stay on Vercel; only their `VITE_BACKEND_URL` changes.

```
Browser ──HTTPS──▶ Vercel (frontend, admin)
   │
   └────HTTPS──▶ EC2 Ubuntu server
                  ├─ Nginx  (ports 80/443, public)   ← "reverse proxy"
                  │     └─▶ Node/Express on 127.0.0.1:4000 (private, kept alive by PM2)
                  └─ Redis (optional, local cache)
                        │
                        ├─▶ MongoDB Atlas (database)
                        ├─▶ Cloudinary, Stripe, Razorpay, Gemini, Groq
                        └─▶ Brevo / Gmail (2FA emails)
```

## Words used in this guide

| Word | Meaning | Example |
|---|---|---|
| **EC2 instance** | A computer you rent from AWS by the hour | a `t3.micro` with 2 CPUs and 1 GB RAM in Mumbai |
| **AMI** | The operating system image the instance starts from | Ubuntu Server 24.04 LTS |
| **Key pair (.pem)** | A private key file that replaces a password for logging in | `forever-key.pem` on your laptop |
| **SSH** | A secure way to type commands on a remote computer | `ssh -i forever-key.pem ubuntu@13.233.10.20` |
| **Security group** | AWS's firewall: a list of which ports are open and to whom | port 22 only from your IP, 80/443 from everyone |
| **Port** | A numbered "door" on a computer; each service listens on one | SSH = 22, HTTP = 80, HTTPS = 443, our Node app = 4000 |
| **Elastic IP** | A public IP address that stays the same forever (normal ones change when you stop the instance) | `13.233.10.20` |
| **Nginx** | A fast web server. Here it is a **reverse proxy**: it receives public requests and forwards them to the Node app | request to `https://api.../api/product/list` → Nginx → `localhost:4000/api/product/list` |
| **PM2** | A process manager that keeps Node running, restarts it if it crashes, and starts it again after a reboot | `pm2 restart forever-backend` |
| **HTTPS / SSL certificate** | Encryption between the browser and the server. Browsers block an HTTPS site (Vercel) from calling an HTTP backend | free certificate from Let's Encrypt via `certbot` |

---

## Step 1: Launch the instance (the "Launch an instance" page)

1. **Name:** `forever-backend`.
2. **AMI:** choose **Ubuntu Server 24.04 LTS** (free tier eligible). All commands below use Ubuntu's `apt`; Amazon Linux uses `dnf` and different package names.
3. **Instance type:** `t3.micro` (free tier eligible).
4. **Key pair:** *Create new key pair* → name `forever-key`, type RSA, format `.pem` → it downloads. Keep it safe; AWS can't give it to you again.
5. **Network settings → Firewall (security groups):** *Create security group*
   - ✅ **Allow SSH traffic from** → change *Anywhere 0.0.0.0/0* to **My IP**. (0.0.0.0/0 means the whole internet can try to log in.)
   - ✅ **Allow HTTPS traffic from the internet**
   - ✅ **Allow HTTP traffic from the internet** (needed for the certificate check and to redirect to HTTPS)
   - ❌ Do **not** open port 4000. Only Nginx talks to Node, from inside the server.
6. **Storage:** 15 GiB gp3 is comfortable (the free tier allows up to 30 GiB).
7. Click **Launch instance**.

> If your home IP changes later and SSH stops working, edit the security group's SSH rule and pick *My IP* again.

## Step 2: Give it a fixed IP (Elastic IP)

EC2 → **Elastic IPs** → **Allocate Elastic IP address** → Allocate → select it → **Actions → Associate** → choose `forever-backend`.

Write this IP down; the guide calls it `YOUR_IP`.

> AWS charges a small hourly fee for every public IPv4 address (about US$3–4/month), free-tier credits usually cover it. **Release** the Elastic IP if you delete the instance, or it keeps costing money.

## Step 3: Connect with SSH

On your Mac, in Terminal:

```bash
chmod 400 ~/Downloads/forever-key.pem
```

```bash
ssh -i ~/Downloads/forever-key.pem ubuntu@YOUR_IP
```

Type `yes` the first time. Your prompt changes to `ubuntu@ip-172-...:~$`: you are now typing on the server.

## Step 4: Install the software

```bash
sudo apt update && sudo apt upgrade -y
```

Node.js 22, git and Nginx:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
```

```bash
sudo apt install -y nodejs git nginx
```

PM2:

```bash
sudo npm install -g pm2
```

Add 1 GB of **swap** (disk space used as emergency RAM, so `npm install` doesn't run out of memory on a 1 GB machine):

```bash
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Check: `node -v` shows `v22...`, `nginx -v` shows a version.

## Step 5: Get the code and install packages

```bash
cd ~ && git clone https://github.com/GitHubAman2004/FOREVER-2FA.git
```

(If the repo is private, GitHub asks for a username and a **personal access token** instead of a password.)

```bash
cd ~/FOREVER-2FA/backend && npm ci --omit=dev
```

`npm ci` installs the exact versions from `package-lock.json`; `--omit=dev` skips test-only packages like vitest.

## Step 6: Add the secrets (`.env`)

`.env` is never in GitHub, so create it on the server. Copy every value from **Render → forever-full-stack → Environment**.

```bash
cp .env.example .env && nano .env
```

Fill it in, then save with `Ctrl+O`, `Enter`, `Ctrl+X`. Example:

```
PORT=4000
MONGODB_URI=mongodb+srv://user:pass@cluster0.xxxx.mongodb.net
JWT_SECRET=some-long-random-string
...
BREVO_API_KEY=xkeysib-...
EMAIL_FROM=Forever <verified.sender@gmail.com>
```

Lock it so only your user can read it:

```bash
chmod 600 .env
```

> **Email bonus:** unlike Render's free plan, EC2 allows sending on port 587, so Gmail SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) also works here. Brevo keeps working too.

**Optional Redis cache** (product list caching, see `backend/config/redis.js`):

```bash
sudo apt install -y redis-server
```

then add `REDIS_URL=redis://127.0.0.1:6379` to `.env`.

## Step 7: Let EC2 reach MongoDB Atlas

Atlas only accepts connections from IPs on its list. Atlas → **Security → Network Access → Add IP Address** → enter `YOUR_IP` → Confirm. (If `0.0.0.0/0` is already there it works, but listing only your Elastic IP is safer.)

## Step 8: Test it once by hand

```bash
node server.js
```

You should see `Server started on PORT : 4000` and `DB Connected`. Press `Ctrl+C` to stop. Also check email:

```bash
npm run check-email -- your.address@gmail.com
```

## Step 9: Keep it running with PM2

```bash
pm2 start ecosystem.config.cjs
```

```bash
pm2 save
```

```bash
pm2 startup systemd
```

The last command prints a line starting with `sudo env PATH=...`. **Copy and run that line**; it makes PM2 start the backend again after a reboot.

Useful PM2 commands:

| Command | What it does |
|---|---|
| `pm2 status` | is it running? how much memory? |
| `pm2 logs forever-backend` | live logs (like Render → Logs) |
| `pm2 restart forever-backend` | restart, e.g. after editing `.env` |

## Step 10: Put Nginx in front

```bash
sudo cp ~/FOREVER-2FA/deploy/nginx-forever-api.conf /etc/nginx/sites-available/forever-api
```

```bash
sudo ln -s /etc/nginx/sites-available/forever-api /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Open `http://YOUR_IP/` in a browser: it should say **API Working**.

The config also raises the upload limit to 20 MB (`client_max_body_size`). Without it, adding a product with images in the admin panel fails with **413 Request Entity Too Large**, because Nginx's default limit is 1 MB.

## Step 11: HTTPS (required, Vercel is HTTPS)

Your frontend is `https://...vercel.app`. Browsers block an HTTPS page from calling an `http://` API (**mixed content**), so the backend needs HTTPS too. Certificates need a domain name, not a bare IP.

**Free domain with DuckDNS:**
1. Sign in at [duckdns.org](https://www.duckdns.org), create a subdomain, e.g. `forever-api`, and set its IP to `YOUR_IP`.
2. Put the domain in the Nginx config:
   ```bash
   sudo sed -i 's/server_name _;/server_name forever-api.duckdns.org;/' /etc/nginx/sites-available/forever-api && sudo nginx -t && sudo systemctl reload nginx
   ```
3. Get the certificate (certbot edits the Nginx file and sets up auto-renewal):
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   ```
   ```bash
   sudo certbot --nginx -d forever-api.duckdns.org
   ```
   Enter your email, agree, and choose to redirect HTTP to HTTPS.

Open `https://forever-api.duckdns.org/`: **API Working** with a padlock. (If you own a real domain, add an **A record** pointing to `YOUR_IP` and use that instead.)

## Step 12: Point the frontend and admin at EC2

Vercel → each project (frontend and admin) → **Settings → Environment Variables** → set

```
VITE_BACKEND_URL=https://forever-api.duckdns.org
```

then **Deployments → ⋯ → Redeploy**. Vite copies `VITE_` variables into the JavaScript at **build** time, so changing the value without redeploying does nothing.

Now test on the live site: sign up, log in (2FA code arrives), add to cart, place an order, use the chatbot, and add a product from the admin panel.

## Step 13: Turn off Render

Once everything works for a day or two, suspend or delete the Render service so there aren't two backends.

## Updating the backend later

```bash
cd ~/FOREVER-2FA && git pull && cd backend && npm ci --omit=dev && pm2 restart forever-backend
```

## When something breaks

| Symptom | Where to look |
|---|---|
| Site says "Network Error" | `pm2 status`, then `pm2 logs forever-backend` |
| `502 Bad Gateway` | Nginx is up but Node isn't: `pm2 logs forever-backend` |
| `413 Request Entity Too Large` | `client_max_body_size` in the Nginx file |
| `MongooseServerSelectionError` | Atlas Network Access doesn't include `YOUR_IP` |
| SSH times out | your IP changed: update the SSH rule in the security group |
| Nginx errors | `sudo tail -n 50 /var/log/nginx/error.log` |

## Costs and safety

- Set a **budget alert**: Billing → Budgets → Create budget → e.g. US$5.
- Never commit `.env` or the `.pem` file.
- Keep port 22 limited to *My IP* and port 4000 closed.
- Run `sudo apt update && sudo apt upgrade -y` now and then for security fixes.
