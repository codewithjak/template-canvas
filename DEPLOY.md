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

## PART A — Backend → Amazon Lightsail

The backend is **stateful** (in-memory job registry, temp files in `os.tmpdir()`), so a single
small VM is a natural fit. Lightsail = fixed-price VM. We run Node under systemd and put **Caddy**
in front for automatic Let's Encrypt HTTPS.

**Chosen config:** Ubuntu, **$7/mo (1 GB)** plan, code via **git clone** from GitHub (branch TC-0026).

> The `backend/Dockerfile`, `backend/.dockerignore`, and `backend/apprunner.yaml` are **unused**
> in the Lightsail path — leave them (handy if you migrate to ECS later) or delete them.

### A1. Push the branch to GitHub first
The VM clones from GitHub, so TC-0026 must be on the remote:
```bash
git push origin TC-0026
```
If the repo is private, set up read access on the VM in A4 (deploy key).

### A2. Create the Lightsail instance
1. Lightsail console (https://lightsail.aws.amazon.com) → **Create instance**.
2. Region: pick one near your users (e.g. us-east-1).
3. Platform **Linux/Unix** → Blueprint **OS Only → Ubuntu 24.04 LTS**.
4. Plan: **$7/mo (1 GB RAM, 1 vCPU)**.
5. Name it `mapdoc-backend` → **Create instance**.

### A3. Attach a static IP + open ports
1. Lightsail → **Networking** → **Create static IP** → attach to `mapdoc-backend`. Note the IP.
2. Instance → **Networking** tab → **IPv4 Firewall** → add rules:
   - **HTTP (80)** — allow
   - **HTTPS (443)** — allow
   - SSH (22) is already open. **Do NOT open 3001** (Caddy reaches it locally).

### A4. Install Node, clone the repo, install deps
SSH in (Lightsail → instance → **Connect using SSH**, or your own terminal), then:
```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Clone (HTTPS shown; for a PRIVATE repo use a deploy key — see note)
cd ~
git clone https://github.com/codewithjak/template-canvas.git
cd template-canvas
git checkout TC-0026
cd backend
npm ci --omit=dev
```
> **Private repo?** Generate a read-only deploy key on the VM and add the public key to the repo
> (GitHub → repo → Settings → Deploy keys):
> ```bash
> ssh-keygen -t ed25519 -C "lightsail-deploy" -f ~/.ssh/id_ed25519 -N ""
> cat ~/.ssh/id_ed25519.pub      # paste into GitHub Deploy keys (read-only)
> ```
> then clone with `git clone git@github.com:codewithjak/template-canvas.git`.

### A5. Run the backend under systemd
Create the service unit:
```bash
sudo tee /etc/systemd/system/mapdoc-backend.service > /dev/null <<'EOF'
[Unit]
Description=map-doc backend (Express render/export)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/template-canvas/backend
ExecStart=/usr/bin/node index.js
Restart=always
Environment=PORT=3001
Environment=FRONTEND_ORIGIN=https://app.map-doc.com

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now mapdoc-backend
sudo systemctl status mapdoc-backend       # should be active (running)
curl http://localhost:3001/                # local smoke test
```

### A6. DNS — point api.map-doc.com at the static IP (Route 53)
Route 53 → `map-doc.com` zone → **Create record**:
- Name: `api`, Type: **A**, value: the Lightsail **static IP**, TTL 300.

Wait until it resolves before the next step:
```bash
dig +short api.map-doc.com     # should return the static IP
```

### A7. Caddy → automatic HTTPS reverse proxy
```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
  sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
  sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

# Caddyfile: proxy the domain to the local Node app; Caddy auto-issues the TLS cert
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
api.map-doc.com {
    reverse_proxy localhost:3001
}
EOF

sudo systemctl restart caddy
sudo systemctl status caddy
```
Caddy now fetches a Let's Encrypt cert automatically (needs port 80 open + DNS pointing here — done in A3/A6). Test from your laptop:
```bash
curl https://api.map-doc.com/        # HTTPS, valid cert
```

### A8. Redeploys later
```bash
ssh into the box
cd ~/template-canvas && git pull origin TC-0026
cd backend && npm ci --omit=dev
sudo systemctl restart mapdoc-backend
```

---

## PART B — Frontend → S3 + CloudFront (done via AWS CLI)

Built locally and deployed via CLI. **Live resource IDs (account 525125475269):**

| Resource | Value |
|---|---|
| S3 bucket | `app.map-doc.com` (private, us-east-1) |
| ACM cert (us-east-1) | `arn:aws:acm:us-east-1:525125475269:certificate/93b748c6-f941-4245-803c-0d31a5ac7817` |
| CloudFront OAC | `E23MTNF8X8J8WF` |
| CloudFront distribution | `EXYNIGEV4PUYQ` → `de4i7685j67eo.cloudfront.net` |
| Route 53 zone | `Z07910522KSPAWOHRXYKH` |

> **IAM note:** the deploy IAM user `junaidkhan01` needed these managed policies attached:
> AWSCertificateManagerFullAccess, AmazonS3FullAccess, CloudFrontFullAccess, AmazonRoute53FullAccess.

### B1. Build with the production API URL
`.env.production` (gitignored) sets `VITE_API_URL=https://api.map-doc.com`. Then:
```bash
npm ci
npm run build        # → dist/  (verify the URL is baked in: grep -o https://api.map-doc.com dist/assets/*.js)
```

### B2. ACM certificate (us-east-1) + DNS validation
CloudFront certs **must** be in us-east-1. Requested with DNS validation; the validation CNAME
was upserted into Route 53, and it validated to **ISSUED** in a couple of minutes:
```bash
ARN=$(aws acm request-certificate --domain-name app.map-doc.com \
  --validation-method DNS --region us-east-1 --query CertificateArn --output text)
# read DomainValidationOptions[0].ResourceRecord {Name,Value}, then UPSERT it as a CNAME in Route 53
```

### B3. Private S3 bucket + upload
```bash
aws s3api create-bucket --bucket app.map-doc.com --region us-east-1   # block-public-access ON by default
aws s3 sync dist/ s3://app.map-doc.com --delete
```

### B4. CloudFront — OAC + distribution
```bash
# Origin Access Control (lets CloudFront read the private bucket)
aws cloudfront create-origin-access-control --origin-access-control-config \
  "Name=app-map-doc-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3"
```
Distribution config (see `/tmp/cf-config.json` shape in this repo's history) sets:
- Origin = `app.map-doc.com.s3.us-east-1.amazonaws.com` with the OAC, `S3OriginConfig.OriginAccessIdentity=""`
- `ViewerProtocolPolicy=redirect-to-https`, managed CachePolicy `CachingOptimized`
- `DefaultRootObject=index.html`
- **SPA fix:** CustomErrorResponses 403→`/index.html` (200) and 404→`/index.html` (200)
- `Aliases=[app.map-doc.com]`, ACM cert, `sni-only`, `TLSv1.2_2021`
- `PriceClass_100` (cheapest: NA + EU edges; bump to `PriceClass_200`/`All` if you need Asia/global edges)

### B5. S3 bucket policy — scope to this distribution only
```json
{ "Version":"2008-10-17","Statement":[{
  "Sid":"AllowCloudFrontServicePrincipal","Effect":"Allow",
  "Principal":{"Service":"cloudfront.amazonaws.com"},
  "Action":"s3:GetObject","Resource":"arn:aws:s3:::app.map-doc.com/*",
  "Condition":{"StringEquals":{"AWS:SourceArn":"arn:aws:cloudfront::525125475269:distribution/EXYNIGEV4PUYQ"}}
}]}
```

### B6. Route 53 alias → CloudFront
UPSERT **A** and **AAAA** alias records for `app.map-doc.com` →
`de4i7685j67eo.cloudfront.net`, AliasTarget HostedZoneId **Z2FDTNDATAQYW2** (the fixed
CloudFront zone ID, same for every distribution).

### B7. Redeploys later
```bash
npm run build
aws s3 sync dist/ s3://app.map-doc.com --delete
aws cloudfront create-invalidation --distribution-id EXYNIGEV4PUYQ --paths "/*"
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
1. Push TC-0026 → Lightsail VM → systemd + Caddy → `api.map-doc.com` on HTTPS.
2. `.env.production` (API URL) → `npm run build`.
3. S3 + ACM(us-east-1) + CloudFront (403/404 → index.html) → `app.map-doc.com` live.
4. Supabase redirect URLs.

## Rough monthly cost (low traffic)
- Lightsail VM (1 GB): **$7 fixed**
- S3 + CloudFront (static SPA): ~$1–5
- Route 53 hosted zone: $0.50 + queries
- TLS certs (Caddy/Let's Encrypt + ACM): free
- **Total ≈ $9–13/month**
