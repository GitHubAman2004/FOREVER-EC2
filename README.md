# FOREVER-EC2

AWS EC2 version of [FOREVER-2FA](https://github.com/GitHubAman2004/FOREVER-2FA) (which stays on Render). Deployment steps: [DEPLOY-EC2.md](DEPLOY-EC2.md).

Forever e-commerce store (customer site, admin panel and Node/Express backend) with two-factor login: after the password is checked, a 6 digit code is emailed to the user and must be entered to finish signing in.

📘 **New here or debugging login/email?** Read [LEARNING-NOTES.md](LEARNING-NOTES.md). It walks through every problem we hit getting 2FA working on the live site, how each was fixed, and where every setting lives.

☁️ **Hosting the backend on AWS EC2?** Follow [DEPLOY-EC2.md](DEPLOY-EC2.md) (Ubuntu + Nginx + PM2 + HTTPS).

## 📓 AWS deployment journal

What happened while moving this project to AWS, in order, and **why** each thing was done. Read this to remember the decisions later. The full commands are in [DEPLOY-EC2.md](DEPLOY-EC2.md).

### Why this repo exists

- `FOREVER-2FA` is the original project. Its backend runs on **Render**, its frontend and admin on **Vercel**. It stays **untouched** so the live site keeps working.
- `FOREVER-EC2` (this repo) is a full copy, with all the commit history, plus the AWS files. All AWS experiments happen here, so nothing can break the Render version.

| | Render version | AWS version (this repo) |
|---|---|---|
| Repo | FOREVER-2FA | FOREVER-EC2 |
| Backend | Render | AWS EC2 |
| Frontend / admin | existing Vercel projects | new Vercel projects (to be created) |

### Why move the backend to EC2

| Problem on Render's free plan | How EC2 solves it |
|---|---|
| Server **sleeps**, so the first request takes ~50 s | EC2 is always on |
| Email ports (SMTP) are **blocked**, so we had to use Brevo | EC2 allows port 587, so Gmail SMTP works too |
| IP address keeps **changing**, so we can't whitelist it | **Elastic IP** is fixed, so Atlas and Brevo can allow just that one address |
| Little control | Full Linux server: Redis cache, logs, Nginx, anything |

Trade-off: we now look after the server ourselves (updates, restarts, security).

### What was added to this repo

| File | What it is | Why |
|---|---|---|
| `DEPLOY-EC2.md` | step-by-step deployment guide | so every step can be repeated |
| `backend/ecosystem.config.cjs` | PM2 settings | keeps Node running, restarts it after crashes or reboots. `.cjs` because `package.json` uses ES modules |
| `deploy/nginx-forever-api.conf` | Nginx settings | Nginx takes public traffic on ports 80/443 and passes it to Node on port 4000. Raises the upload limit to 20 MB, because product images failed with the 1 MB default |

### Progress log

| # | Step | Status | Why / notes |
|---|---|---|---|
| 1 | Launched EC2 instance `i-049d820a77b433ca6`, region **ap-south-1 (Mumbai)**, `t3.micro`, Ubuntu | ✅ | `t3.micro` is free-tier eligible. Mumbai is the closest region, for low latency |
| 2 | Security group `launch-wizard-1`: SSH from *My IP* only; HTTP + HTTPS from anywhere; port 4000 **closed** | ✅ | SSH open to the world invites login attacks. Visitors need 80/443. Node stays private behind Nginx |
| 3 | Allocated **Elastic IP `13.207.220.194`** and associated it with the instance | ✅ | the normal public IP changes on every stop/start, and a fixed one is needed for Atlas, DuckDNS and the frontend |
| 4 | SSH rule for **EC2 Instance Connect** (`com.amazonaws.ap-south-1.ec2-instance-connect`) | ⏳ | college and hostel wifi have different IPs, so *My IP* breaks when moving. The browser terminal works from any network, even if port 22 is blocked |
| 5 | Log in + `sudo apt update && sudo apt upgrade -y` | ⏳ | install security fixes first |
| 6 | Install Node 22, git, Nginx, PM2, 1 GB swap | ⬜ | swap = disk used as spare RAM, since t3.micro has only 1 GB |
| 7 | `git clone` this repo on the server, `npm ci --omit=dev` in `backend` | ⬜ | `--omit=dev` skips test-only packages |
| 8 | Create `backend/.env` on the server (`chmod 600`) | ⬜ | secrets are never in GitHub |
| 9 | Add `13.207.220.194` to MongoDB Atlas → Network Access | ⬜ | Atlas only accepts listed IPs |
| 10 | Start with PM2 (`pm2 start ecosystem.config.cjs`, `pm2 save`, `pm2 startup`) | ⬜ | survives crashes and reboots |
| 11 | Nginx reverse proxy | ⬜ | |
| 12 | Free domain (DuckDNS) + HTTPS (certbot) | ⬜ | the Vercel site is HTTPS, and browsers block calls from it to an `http://` API (mixed content) |
| 13 | New Vercel projects (root `frontend` / `admin`) with `VITE_BACKEND_URL` = the EC2 domain | ⬜ | don't touch the old Vercel projects, which serve the Render version |

### Lessons learned

- The **Associate this Elastic IP address** button only shows in the green banner right after allocating. If the banner is closed, tick the IP's checkbox → **Actions → Associate Elastic IP address**.
- *My IP* in a security group is your IP **at that moment**. On college/hostel wifi it changes, so use the browser terminal or edit the rule again.
- Release the Elastic IP if the instance is ever deleted, otherwise it keeps costing money (about US$3–4/month).

## Project layout

- `frontend` - customer website (React + Vite)
- `admin` - admin panel (React + Vite)
- `backend` - API server (Express + MongoDB)

## Running locally

1. Backend
   ```bash
   cd backend
   npm install
   cp .env.example .env   # then fill in the values
   npm run server
   ```
2. Frontend and admin: in each folder create a `.env` with `VITE_BACKEND_URL=http://localhost:4000` (the frontend also needs `VITE_RAZORPAY_KEY_ID`), then run `npm install` and `npm run dev`.

## Email setup (required for login)

Every login sends a verification code by email. Without email settings, login shows *"Email service is not configured"*.

### Option 1: Brevo (use this on Render's free plan)

Render's free plan blocks normal email sending (SMTP ports 25, 465 and 587), so Gmail settings time out there. Brevo sends over normal HTTPS instead and has a free plan.

1. Sign up at [brevo.com](https://www.brevo.com).
2. Go to **Senders, Domains & Dedicated IPs -> Senders**, add the address the codes should come from (your Gmail is fine) and click the link Brevo emails you to verify it.
3. Go to **SMTP & API -> API Keys**, create a key and copy it (it starts with `xkeysib-`).
4. Set these on the backend (Render: your service -> **Environment**; locally: `backend/.env`):
   ```
   BREVO_API_KEY=xkeysib-...
   EMAIL_FROM=Forever <the.address.you.verified@gmail.com>
   ```

### Option 2: Gmail SMTP (local or paid hosting)

1. Turn on 2-Step Verification for the Gmail account that will send the codes.
2. Open Google Account -> Security -> **App passwords** and create one. Copy the 16 character password.
3. Put these in `backend/.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your.address@gmail.com
   SMTP_PASS=the 16 character app password
   ```

If `BREVO_API_KEY` is set it is used, otherwise SMTP.

### Check the settings

The address at the end is optional and receives a test mail:
```bash
cd backend
npm run check-email -- your.address@gmail.com
```

### On Render

Add the variables under your backend service -> **Environment** and save. Render restarts the service with the new values (if it doesn't, use **Manual Deploy -> Deploy latest commit**).

## Tests

```bash
cd backend
npm test
```

The tests start a throwaway in-memory MongoDB (downloaded on the first run) and never touch your real database or send real email.
