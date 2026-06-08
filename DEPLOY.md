# Deployment Guide — map-doc.com (AWS)

This project is **three pieces**. Only the first two are deployed to AWS:

| Piece | What it is | Where it lives |
|-------|-----------|----------------|
| Frontend | Vite + React SPA → static `dist/` | AWS — S3 + CloudFront |
| Backend | Express service (`backend/`, port 3001) — PDF/ZPL render, upload, zip jobs | AWS — App Runner (container) |
| Supabase | Auth + DB | Supabase Cloud (not AWS) — config only |

Domains used:
- `api.map-doc.com` → backend
- `app.map-doc.com` → frontend (use apex `map-doc.com` if you prefer; noted below)

> **Deploy the backend first** — the frontend build bakes `VITE_API_URL` into the bundle, so the API must exist first.

---

## Prerequisites (one-time)

```bash
aws --version                    # AWS CLI v2
aws configure                    # access key, secret, default region us-east-1
aws sts get-caller-identity      # confirm auth
docker --version                 # Docker installed & running

# Confirm the hosted zone exists
aws route53 list-hosted-zones --query "HostedZones[?Name=='map-doc.com.']"
```

Set shared shell vars (reuse in later commands):
```bash
export AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export REGION=us-east-1
```

---

## PART A — Backend → App Runner

The backend is **stateful** (in-memory job registry, temp files in `os.tmpdir()`), so it needs a
persistent server, NOT Lambda. App Runner = managed runtime + autoscaling + HTTPS + free domain cert.

**Chosen path: App Runner from GitHub source** (no Docker, no ECR). App Runner pulls the repo,
builds the Node app, and runs it. Deploy branch: **TC-0026**.

### A1. Files already in repo
- `backend/apprunner.yaml` — build/run config (runtime nodejs18, build `npm ci --omit=dev`,
  start `node index.js`, port 3001, env `FRONTEND_ORIGIN`).
- CORS in `backend/index.js` is restricted to `process.env.FRONTEND_ORIGIN`.
- `backend/Dockerfile` + `.dockerignore` exist but are **unused** in the source-based path
  (kept in case you switch to the ECR/container path later).

### A2. Push the backend to GitHub
Source-based App Runner builds from GitHub, so the backend changes must be pushed first:
```bash
git add backend/ DEPLOY.md
git commit -m "Add App Runner config for AWS backend deploy"
git push origin TC-0026
```
> `.env.production` is intentionally **not** committed (gitignored) — it's the *frontend* build
> env and is used locally in Part B. App Runner only needs the `backend/` files.

### A3. Create the App Runner service (Console)
1. App Runner → **Create service** → Source: **Source code repository**.
2. **Add new** GitHub connection → authorize AWS → pick repo `codewithjak/template-canvas`,
   branch **TC-0026**.
3. Deployment trigger: **Automatic** (redeploy on every push) or Manual.
4. Build settings → **Use a configuration file** (it reads `backend/apprunner.yaml`).
   - **Source directory:** `backend`
5. Service settings → confirm/set env var `FRONTEND_ORIGIN = https://app.map-doc.com`.
6. CPU / Memory: **1 vCPU / 2 GB** to start.
7. **Auto scaling: set max size = 1** (see warning below).
8. Create → wait for **Running** → you get `https://xxxx.us-east-1.awsapprunner.com`. Smoke-test it.

> ⚠️ **Keep max instances = 1.** The backend stores jobs in an in-memory `Map` and writes temp
> files to local disk. Multiple instances would not share that state and bulk-export jobs would
> appear to vanish. To scale out later, move jobs to a shared store (S3 + a DB/Redis registry).

### A4. Custom domain `api.map-doc.com`
1. App Runner → service → **Custom domains** → **Link domain** → `api.map-doc.com`.
2. App Runner shows DNS records (validation CNAMEs + target). Add them in the Route 53
   `map-doc.com` hosted zone.
3. App Runner **auto-provisions the TLS cert** — no manual ACM step here.
4. Wait for status **Active** (10–30 min). Test: `curl https://api.map-doc.com/<an-endpoint>`.

---

## PART B — Frontend → S3 + CloudFront

### B1. Build with the production API URL
`.env.production` is already in the repo (gitignored). Confirm `VITE_API_URL=https://api.map-doc.com`, then:
```bash
npm ci
npm run build        # → dist/
```

### B2. Create the S3 bucket (keep it private)
```bash
aws s3 mb s3://app.map-doc.com --region $REGION
aws s3 sync dist/ s3://app.map-doc.com --delete
```
Leave **Block all public access = ON**. CloudFront reaches it via Origin Access Control (OAC).

### B3. TLS certificate (ACM) — MUST be in us-east-1
```bash
aws acm request-certificate \
  --domain-name app.map-doc.com \
  --validation-method DNS \
  --region us-east-1
```
Add the returned CNAME validation record in Route 53; cert validates in a few minutes.
(For apex, request `map-doc.com` and `www.map-doc.com` instead.)

### B4. CloudFront distribution (Console)
1. **Create distribution** → Origin = the S3 bucket → **Origin access: Origin access control (OAC)**;
   let it create the policy, then **update the bucket policy** when prompted.
2. Viewer protocol policy: **Redirect HTTP → HTTPS**.
3. Alternate domain name (CNAME): `app.map-doc.com`. Custom SSL certificate: the ACM cert from B3.
4. Default root object: `index.html`.
5. **SPA routing fix (critical for react-router):** Error pages → add custom responses for
   **403** and **404** → response page `/index.html`, **HTTP response code 200**.
   Without this, deep links like `/canvas` break on refresh.

### B5. Point the domain at CloudFront (Route 53)
In the `map-doc.com` hosted zone, create:
- **A** record, name `app`, **Alias = Yes**, target = the CloudFront distribution.
- **AAAA** record, name `app`, Alias → same target (IPv6).

(For apex: A + AAAA alias at the zone root pointing to CloudFront.)

### B6. Redeploys later
```bash
npm run build
aws s3 sync dist/ s3://app.map-doc.com --delete
aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths "/*"
```

---

## PART C — Supabase (auth breaks without this)

Supabase Dashboard → **Authentication → URL Configuration**:
- **Site URL:** `https://app.map-doc.com`
- **Redirect URLs:** add `https://app.map-doc.com/**` (and `https://www.map-doc.com/**` if used).
- If using Google/OAuth providers, also add the domain to that provider's authorized redirect URIs.

> Note: `VITE_SUPABASE_URL` must be the **base** project URL (`https://<ref>.supabase.co`),
> not the `/rest/v1/` REST endpoint.

---

## Order of operations recap
1. ECR push → App Runner → `api.map-doc.com` Active.
2. `.env.production` (API URL) → `npm run build`.
3. S3 + ACM(us-east-1) + CloudFront (403/404 → index.html) → `app.map-doc.com` live.
4. Supabase redirect URLs.

## Rough monthly cost (low traffic)
- App Runner (1 vCPU/2GB, always on): ~$25–40
- S3 + CloudFront (static SPA): ~$1–5
- Route 53 hosted zone: $0.50 + queries
- ACM / App Runner certs: free
