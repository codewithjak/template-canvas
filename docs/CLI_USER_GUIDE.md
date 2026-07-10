# Mapdoc CLI — User Guide

Point the Mapdoc CLI at your code, and it turns your repo into reviewable cloud
infrastructure — and (optionally) ships it live. This guide gets you connected with no
detours.

> **Who this is for:** users of the hosted Mapdoc app. Running your own backend? See
> [Appendix: local backend](#appendix-running-against-a-local-backend) at the end.

---

## What you need (2 minutes)

1. **Node.js** installed (v18+). Check with `node --version`. That's the only install — the
   CLI itself has no extra dependencies.
2. **A Mapdoc account on the Business plan** (API access is a Business-plan feature).
3. **Your Mapdoc app URL** — the same address you use in the browser (e.g.
   `https://www.map-doc.com`). You'll pass it to the CLI once.

---

## Step 1 — Get your API key (once)

1. Sign in to the Mapdoc app.
2. Open **Settings → API key**.
3. Click **Generate key**. A key starting with `tc_live_…` appears.
4. **Copy it now.** It's shown only once and can't be retrieved again — if you lose it,
   generate a new one.

> Don't see the option / get "API access requires the Business plan"? Upgrade to Business,
> then come back to Settings.

---

## Step 2 — Connect the CLI

Set two things once in your terminal — your key and your Mapdoc URL:

```bash
export MAPDOC_API_KEY=tc_live_your_key_here
export MAPDOC_API=https://www.map-doc.com     # your Mapdoc app URL
```

That's the whole connection. (`MAPDOC_API` is the same as passing `--api` on every command —
set it once and forget it.)

---

## Step 3 — Analyze a repo

From inside the project you want to deploy (or point at any folder):

```bash
node /path/to/mapdoc/backend/agent/cli.js analyze
#           ^ or: analyze /path/to/your/project
```

What happens:
- The CLI scans your repo **locally** and sends Mapdoc a small, sanitized summary
  (framework, ports, which services your app needs) — **not** your source, and **never**
  secret values.
- Mapdoc proposes matching infrastructure and saves it as a **cloud template**.
- The CLI prints the template name and id.

Then open the **builder** in the app, pick the template from the **Template bar**, and review
the proposed infrastructure. Nothing is created yet — you're just reviewing a proposal.

---

## Step 4 — Deploy (optional)

Deploying puts your app on real infrastructure in **your own AWS account**. Two one-time
setup steps, then a single command.

### 4a. Connect your AWS account (once)

In the app's **Connect** screen:
1. Download the CloudFormation template.
2. Deploy it in your AWS account (it creates the roles Mapdoc uses — Mapdoc never gets your
   keys).
3. Paste the **Connect-Role ARN** back into Mapdoc and click **Verify**.

### 4b. Apply the infrastructure (once per app)

Review the template on the canvas and **Apply** it. This creates the infrastructure and gives
you a **deployment** in the deployments panel — copy its **deployment id**.

### 4c. Ship your app

```bash
node /path/to/mapdoc/backend/agent/cli.js deploy --deployment <deployment-id>
```

- **Default (`--mode source`)** — your source (minus secrets and ignored files) is built in
  your own account. No Docker, no cloud credentials needed on your machine.
- **`--watch`** — redeploy automatically whenever you change a file:
  `deploy --deployment <id> --watch`
- **`--mode image`** builds the container locally and pushes it (needs `docker` + the `aws`
  CLI installed and logged in). **`--mode push --image <ref>`** pushes an image you already
  built.

Watch progress in the builder.

---

## Quick reference

```bash
# connect once
export MAPDOC_API_KEY=tc_live_...
export MAPDOC_API=https://www.map-doc.com

# analyze the current folder
node backend/agent/cli.js analyze

# analyze a specific folder
node backend/agent/cli.js analyze ./my-app

# deploy (after connecting AWS + applying the template)
node backend/agent/cli.js deploy --deployment <id>

# deploy and keep redeploying on change
node backend/agent/cli.js deploy --deployment <id> --watch
```

---

## Troubleshooting

| You see… | What it means | Fix |
|---|---|---|
| `Set MAPDOC_API_KEY (your Mapdoc API key).` | The key isn't set in this terminal. | `export MAPDOC_API_KEY=tc_live_...` |
| `ECONNREFUSED` / "connection refused" | The CLI can't reach Mapdoc — usually the URL. | Set `MAPDOC_API` (or `--api`) to your Mapdoc app URL. Don't rely on the default. |
| `API access requires the Business plan.` | Your team isn't on Business. | Upgrade to Business, then generate the key in Settings. |
| `Deploy needs --deployment <id>` | You ran `deploy` without a deployment. | Apply the template first, then copy the id from the deployments panel. |
| `No Dockerfile found…` | `--mode image` needs a Dockerfile. | Add a `Dockerfile`, use `--mode source`, or push a prebuilt image with `--mode push --image <ref>`. |

---

## Appendix: running against a local backend

For developers running the Mapdoc backend themselves:

1. Start the backend: `cd backend && npm start` — it listens on **port 3001**.
2. Point the CLI at it explicitly — the CLI's built-in default is a *different* port, so
   always pass the URL:
   ```bash
   export MAPDOC_API=http://localhost:3001
   MAPDOC_API_KEY=tc_live_... node backend/agent/cli.js analyze .
   ```
