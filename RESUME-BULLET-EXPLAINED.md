# The deployment resume bullet, explained

> Deployed the app on an **AWS EC2 Ubuntu** server, using **Nginx** to **serve the frontend** and **route API requests** to the **Node backend** (**managed with PM2**), with **HTTPS** and **firewall rules limiting SSH access**.

Each phrase below has: what it means, how it is done in this project, and a likely interview question.

## The whole picture

```
                    Internet
                       │  https://forever.example.com
                       ▼
┌───────────── AWS EC2 (Ubuntu) ─ 13.207.220.194 ─────────────┐
│ Security group (firewall): 443 ✅ 80 ✅ 22 only my IP ✅ 4000 ❌ │
│                                                             │
│   Nginx (port 80/443, HTTPS certificate)                    │
│     ├── /            → frontend files (React build, dist/)  │
│     ├── /admin       → admin panel files                    │
│     └── /api/...     → Node backend on 127.0.0.1:4000       │
│                            ▲                                │
│                         PM2 keeps it alive                  │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
          MongoDB Atlas, Cloudinary, Stripe, Razorpay, Brevo...
```

---

## 1. "Deployed the app"

**Meaning:** took the code that ran on my laptop (`localhost`) and put it on a computer on the internet, so anyone can use it.

**Example:** before, only my laptop could open `http://localhost:5173`. After, anyone can open `https://forever.example.com`.

**Interview question:** *What's the difference between running locally and deploying?*
Locally, only you can reach it, secrets sit in your `.env`, and it stops when you close the laptop. Deployed, it's on a public IP, runs 24/7, and has to be secured.

## 2. "on an AWS EC2"

**AWS** = Amazon Web Services, Amazon's cloud (rentable computers, databases, storage).
**EC2** = Elastic Compute Cloud = a virtual computer you rent by the hour. "Elastic" because you can make it bigger or smaller.

**In this project:** instance `i-049d820a77b433ca6`, type `t3.micro` (2 vCPU, 1 GB RAM, free-tier eligible), region `ap-south-1` (Mumbai, closest to users in India so pages load faster). An **Elastic IP** `13.207.220.194` gives it a fixed address.

**Interview question:** *Why EC2 instead of Render/Heroku?*
Full control (install Nginx, Redis, anything), no sleeping on free plans, a fixed IP that can be whitelisted (MongoDB Atlas), and SMTP isn't blocked. Trade-off: I manage updates, security and restarts myself.

## 3. "Ubuntu server"

**Ubuntu** = a free, popular version of **Linux** (an operating system, like Windows or macOS but used by most servers).
**Server** = a computer whose job is to answer requests from other computers. It has no screen; you control it by typing commands over SSH.

**Example commands used:** `sudo apt update && sudo apt upgrade -y` (install security updates), `sudo reboot`.

**Interview question:** *What is `sudo`?* "Super-user do": run a command as administrator.

## 4. "using Nginx"

**Nginx** (pronounced "engine-x") = a very fast web server. It is the **front door** of the server: every visitor talks to Nginx first, on port 80 (HTTP) or 443 (HTTPS).

Nginx is good at: sending files quickly, handling thousands of connections, HTTPS encryption, and forwarding requests to other programs.

## 5. "to serve the frontend"

**Frontend** = the React website the user sees (`frontend/` and `admin/`).
React code is **built** into plain files once:

```bash
cd frontend && npm run build     # creates frontend/dist/ (index.html, .js, .css, images)
```

**Serve** = when a browser asks for a page, Nginx sends those files back. No Node needed for this part; files are just read from disk.

```nginx
location / {
    root /var/www/forever/frontend;   # the dist/ files copied here
    try_files $uri /index.html;       # React Router: unknown paths load index.html
}
```

`try_files ... /index.html` is needed because React handles pages like `/cart` in the browser. Without it, refreshing `/cart` gives a 404.

## 6. "and route API requests"

**API request** = a request from the frontend to the backend for data, e.g. `GET /api/product/list` or `POST /api/user/login`.
**Route** = Nginx looks at the URL; if it starts with `/api/`, it **forwards** the request to the Node backend. This is called a **reverse proxy**.

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:4000;   # forward to Node
    client_max_body_size 20M;           # allow product image uploads (default is 1 MB)
}
```

**Example:** the browser asks `https://forever.example.com/api/product/list` → Nginx → `http://127.0.0.1:4000/api/product/list` → Node replies → Nginx passes the reply back.

**Interview question:** *Why put Nginx in front of Node instead of exposing port 4000?*
1. One domain for frontend and API, so no CORS issues.
2. Nginx handles HTTPS, so Node doesn't have to.
3. Port 4000 stays private, so attackers can't reach Node directly.
4. Nginx serves static files faster than Node.

## 7. "to the Node backend"

**Backend** = the Express server in `backend/` (`server.js`). It checks passwords, sends 2FA emails, talks to MongoDB, handles payments, and runs the chatbot.
**Node** = Node.js, the program that runs JavaScript outside the browser.

It listens on `127.0.0.1:4000`. `127.0.0.1` means "this same machine only", so only Nginx (also on this machine) can reach it.

## 8. "(managed with PM2)"

**PM2** = a **process manager** for Node. A *process* is a running program.

If you just run `node server.js`, it stops when you close the terminal, and if it crashes it stays dead. PM2 fixes that:

| Command | What it does |
|---|---|
| `pm2 start ecosystem.config.cjs` | start the backend in the background |
| `pm2 save` + `pm2 startup` | start it again automatically after a reboot |
| (automatic) | restart it if it crashes or uses more than 400 MB RAM |
| `pm2 logs forever-backend` | see the backend's console output and errors |
| `pm2 restart forever-backend` | restart after deploying new code |

**Interview question:** *What happens if your server crashes at 3 am?* PM2 restarts it within a second; if the whole machine reboots, PM2 starts it at boot.

## 9. "with HTTPS"

**HTTP** = how browsers and servers talk. Plain HTTP is readable by anyone on the same wifi.
**HTTPS** = HTTP + encryption (TLS/SSL). Passwords, OTPs and JWT tokens can't be read in transit. The browser shows a padlock 🔒.

It needs a **certificate**: a file proving "this server really is forever.example.com". Got for free from **Let's Encrypt** using **certbot**:

```bash
sudo certbot --nginx -d forever.example.com
```

certbot also renews it automatically (Let's Encrypt certificates last 90 days) and redirects `http://` to `https://`.

**Interview question:** *Why is HTTPS essential here?* Login sends passwords and 6-digit OTPs; payment flows need it; and browsers block an HTTPS page from calling an HTTP API (mixed content).

## 10. "and firewall rules"

**Firewall** = a list of rules saying which network traffic may enter. On AWS it's called a **security group**.

**Port** = a numbered door on a computer: 22 = SSH, 80 = HTTP, 443 = HTTPS, 4000 = our Node app.

This project's inbound rules:

| Port | Allowed from | Why |
|---|---|---|
| 80 (HTTP) | everyone `0.0.0.0/0` | visitors, and certbot's check; redirects to HTTPS |
| 443 (HTTPS) | everyone `0.0.0.0/0` | visitors |
| 22 (SSH) | my IP only `45.112.151.43/32` | me, from my laptop |
| 22 (SSH) | AWS EC2 Instance Connect prefix list `pl-0fa83cebf909345ca` | me, from the browser terminal on any wifi |
| 4000 | **nobody** | Node is reachable only through Nginx |

## 11. "limiting SSH access"

**SSH** (Secure Shell) = a secure way to log in to the server and type commands, e.g. `ssh -i forever-key.pem ubuntu@13.207.220.194`.

If port 22 is open to the whole internet, bots try to break in all day. So SSH is **limited** to:
- only my IP address (`/32` = exactly one address), and
- only AWS's browser-terminal service,
- and login uses a **key file** (`.pem`), not a password, which can't be guessed.

**Interview question:** *Your IP changes on hostel wifi; how do you still get in?* Use EC2 Instance Connect from the AWS console (allowed through a managed prefix list), or update the *My IP* rule.

---

## 30-second spoken version

"I deployed the e-commerce app on an AWS EC2 t3.micro running Ubuntu in the Mumbai region, with an Elastic IP. Nginx is the only public entry point: it serves the built React frontend as static files and reverse-proxies every `/api` request to the Express backend on localhost port 4000. PM2 keeps the Node process alive, restarts it on crashes, and starts it on boot. HTTPS comes from a free Let's Encrypt certificate via certbot, with auto-renewal and an HTTP-to-HTTPS redirect. The security group only opens ports 80 and 443 publicly; SSH is limited to my IP and AWS's Instance Connect range, uses key-based login, and the Node port isn't exposed at all."
