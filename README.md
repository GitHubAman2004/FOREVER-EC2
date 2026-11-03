# FOREVER-2FA

Forever e-commerce store (customer site, admin panel and Node/Express backend) with two-factor login: after the password is checked, a 6 digit code is emailed to the user and must be entered to finish signing in.

📘 **New here or debugging login/email?** Read [LEARNING-NOTES.md](LEARNING-NOTES.md). It walks through every problem we hit getting 2FA working on the live site, how each was fixed, and where every setting lives.

☁️ **Hosting the backend on AWS EC2?** Follow [DEPLOY-EC2.md](DEPLOY-EC2.md) (Ubuntu + Nginx + PM2 + HTTPS).

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
