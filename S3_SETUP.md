# S3 Setup — bulk artifact storage

MapDoc stores finished **bulk export artifacts** (the generated zips) in S3 and
hands them out via **presigned download URLs**. This is the durable backend for
Step 2 of `WEBHOOK_CONNECTOR_ARCHITECTURE.md`.

Key decisions this setup assumes (see that doc for the why):

- **S3 is required** — there is no local fallback. Bulk export needs S3 configured
  in every environment where it runs (incl. local dev / CI if you exercise it).
- **No AWS SDK** — the backend signs S3 requests itself (AWS Signature V4) using
  Node's `crypto`. So **static credentials in env** are required; IAM *instance
  roles* are **not** supported by the hand-rolled signer (it does not fetch
  temporary credentials from IMDS). If you must use an instance role, either add
  IMDS credential fetching or switch that path to the AWS SDK.
- **Option A delivery** — the presigned URL is placed directly in the
  `bulk.completed` webhook payload. (Option B — webhook carries only the `jobId`
  and the consumer calls back an authenticated endpoint that mints the URL — is a
  documented future enhancement; it reuses the same signer.)

---

## 1. Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `AWS_REGION` | ✅ | — | Bucket region, e.g. `us-east-1` |
| `S3_ARTIFACT_BUCKET` | ✅ | — | Bucket name that holds the zips |
| `AWS_ACCESS_KEY_ID` | ✅ | — | Static access key (IAM user) |
| `AWS_SECRET_ACCESS_KEY` | ✅ | — | Static secret key |
| `AWS_SESSION_TOKEN` | ➖ | — | Only if using temporary credentials |
| `S3_ARTIFACT_PREFIX` | ➖ | `artifacts` | Key prefix for objects |
| `ARTIFACT_URL_TTL_SECONDS` | ➖ | `3600` | Lifetime of presigned download URLs |

Object key layout: `s3://<bucket>/<prefix>/<jobId>.zip`.

Add these to the backend's environment (`.env`, your process manager, or the
deploy secret store). They are **server-side only** — never expose the secret key
or send it to the browser.

---

## 2. Create the bucket (private)

```bash
aws s3api create-bucket \
  --bucket YOUR_BUCKET \
  --region us-east-1
# (for regions other than us-east-1, add:
#  --create-bucket-configuration LocationConstraint=YOUR_REGION )
```

Keep **Block Public Access fully ON** (the default). Nothing is ever public;
access is only via presigned URLs.

```bash
aws s3api put-public-access-block \
  --bucket YOUR_BUCKET \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

---

## 3. Encryption at rest

New buckets are encrypted with **SSE-S3 (AES-256) by default**, so no action is
required for baseline encryption. To use a KMS key instead:

```bash
aws s3api put-bucket-encryption --bucket YOUR_BUCKET \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": { "SSEAlgorithm": "aws:kms", "KMSMasterKeyID": "YOUR_KMS_KEY_ARN" }
    }]
  }'
```

(If you use SSE-KMS, the IAM user in §5 also needs `kms:GenerateDataKey` +
`kms:Decrypt` on that key.)

---

## 4. Enforce TLS (recommended)

Deny any non-HTTPS request via a bucket policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyInsecureTransport",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": [
      "arn:aws:s3:::YOUR_BUCKET",
      "arn:aws:s3:::YOUR_BUCKET/*"
    ],
    "Condition": { "Bool": { "aws:SecureTransport": "false" } }
  }]
}
```

```bash
aws s3api put-bucket-policy --bucket YOUR_BUCKET --policy file://tls-only.json
```

---

## 5. IAM user + least-privilege policy

The backend needs exactly two object actions on the prefix. (`HeadObject` — used
by the upload retry's existence check — is authorised by `s3:GetObject`.) We do
**not** grant `DeleteObject`: object cleanup is done by the lifecycle rule (§6),
which the S3 service performs without caller permissions.

Policy (`mapdoc-artifacts-policy.json`):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "ArtifactObjectRW",
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject"],
    "Resource": "arn:aws:s3:::YOUR_BUCKET/artifacts/*"
  }]
}
```

Create the user, attach the policy, and mint static keys:

```bash
aws iam create-user --user-name mapdoc-artifacts
aws iam put-user-policy --user-name mapdoc-artifacts \
  --policy-name mapdoc-artifacts --policy-document file://mapdoc-artifacts-policy.json
aws iam create-access-key --user-name mapdoc-artifacts
# → copy AccessKeyId / SecretAccessKey into AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
```

> Match the `Resource` prefix (`artifacts/*`) to `S3_ARTIFACT_PREFIX`.

---

## 6. Lifecycle rule — auto-expire artifacts

Artifacts are ephemeral (downloaded within minutes). Since the app no longer keeps
them on disk, **S3 must expire them** so the bucket doesn't grow forever. Expire
objects under the prefix after, say, 1 day:

```json
{
  "Rules": [{
    "ID": "expire-artifacts",
    "Filter": { "Prefix": "artifacts/" },
    "Status": "Enabled",
    "Expiration": { "Days": 1 }
  }]
}
```

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket YOUR_BUCKET --lifecycle-configuration file://lifecycle.json
```

Pick a window comfortably longer than `ARTIFACT_URL_TTL_SECONDS` and longer than
any connector's retry/delay, so a `downloadUrl` never outlives its object.

---

## 7. CORS — not required

No bucket CORS configuration is needed:

- **Browser downloads** go through our `/bulk-jobs/:jobId/download` endpoint, which
  **302-redirects** to a presigned URL. The browser triggers this via an anchor
  download (a navigation, not a `fetch`/XHR), which follows redirects without CORS.
  The downloaded filename comes from the presigned URL's
  `response-content-disposition`.
- **Webhook consumers** (Zapier/Make/n8n/your server) fetch the presigned URL
  **server-to-server**, where CORS does not apply.

Only add CORS if you later have browser JavaScript fetch the S3 URL directly.

---

## 8. How it fits together (request flow)

```
bulk job finishes → zip written to local staging
   │
   ├─ PUT (presigned, UNSIGNED-PAYLOAD) → S3        [retry: on failure, HEAD-check
   │                                                  "is it there?"; if not, retry]
   ├─ local staging file deleted (S3 now holds it)
   │
   ├─ presign GET URL (ARTIFACT_URL_TTL_SECONDS, response-content-disposition)
   │
   └─ dispatchWebhook(team, 'bulk.completed', { jobId, downloadUrl, expiresAt, … })

browser download:  GET /bulk-jobs/:id/download → 302 → fresh presigned GET URL
```

Security model: the bucket is private and TLS-only; the only way in is a presigned
URL that is HMAC-signed (SigV4), tamper-proof, least-privilege (GET on one object),
and short-lived (`ARTIFACT_URL_TTL_SECONDS`). Its single inherent weakness — it's a
bearer link — is bounded by the short TTL and removed entirely by the future
option B.

---

## 9. Quick verification

After setting the env vars and deploying:

1. Run a bulk export. Confirm an object appears at
   `s3://YOUR_BUCKET/artifacts/<jobId>.zip`.
2. Confirm the browser download works (it should redirect to S3 and download the
   zip with the right filename).
3. If a webhook endpoint is registered for `bulk.completed`, confirm it receives
   the event and the `downloadUrl` fetches the zip before `expiresAt`.

### Common failures
| Symptom | Likely cause |
|---|---|
| Boot error: "S3 artifact store requires AWS_REGION and S3_ARTIFACT_BUCKET" | env vars unset |
| `403 SignatureDoesNotMatch` on upload/download | wrong `AWS_SECRET_ACCESS_KEY`, clock skew, or region mismatch |
| `403 AccessDenied` | IAM policy prefix doesn't match `S3_ARTIFACT_PREFIX` |
| Download URL works then 403s later | URL expired (`ARTIFACT_URL_TTL_SECONDS`) or object lifecycle-expired |
| `301 PermanentRedirect` | `AWS_REGION` doesn't match the bucket's region |
