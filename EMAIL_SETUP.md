# Email Setup — map-doc.com (AWS SES)

Branded email for `map-doc.com`, split into two independent halves:

| Half | Purpose | Service |
|------|---------|---------|
| **Sending** | App/transactional mail FROM the domain (e.g. `noreply@map-doc.com`), plus replying as your addresses | Amazon SES |
| **Receiving** | Mail TO `support@`, `hello@`, `junaid.khan@` lands somewhere you read it | Amazon SES inbound → S3 → Lambda **forward** to your existing inbox |

> **Why forwarding and not WorkMail?** AWS stopped letting new customers create WorkMail
> organizations after **2026-04-30** (full shutdown 2027-03-31). The create call now fails with
> `LimitExceededException`. So receiving is done with SES inbound + a forwarding Lambda.
>
> **What forwarding is / isn't:** it delivers mail to your existing inbox; it is **not** a mailbox
> you log into. To *reply as* `support@map-doc.com` you add it as a "Send mail as" identity in your
> mail client using the SES SMTP credentials (Step 7).

---

## Account facts (this setup)

| Thing | Value |
|-------|-------|
| AWS account | `525125475269` |
| Region | `us-east-1` (SES inbound is region-restricted; us-east-1 is supported) |
| Route 53 hosted zone | `Z07910522KSPAWOHRXYKH` (`map-doc.com`) |
| CLI user | `junaidkhan01` (has SES + Route 53 access) |
| Addresses wanted | `support@map-doc.com`, `hello@map-doc.com`, `junaid.khan@map-doc.com` |
| Forward mapping | `support@` → `junaiduet888@gmail.com`<br>`hello@` → `aliandkhan242@gmail.com`<br>`junaid.khan@` → `marshmallo.mapdoc@gmail.com` |

---

## Status checklist

- [x] **Step 1** — SES domain identity created (`map-doc.com`) — **Verified, DKIM SUCCESS**
- [x] **Step 2** — DKIM CNAME records added to Route 53
- [x] **Step 3** — SPF + DMARC TXT records added
- [ ] **Step 4** — MAIL FROM subdomain (optional, improves SPF alignment)
- [~] **Step 5** — Destinations verified: `junaiduet888` ✅, `marshmallo.mapdoc` ✅, **`aliandkhan` ❌ pending click** (so `hello@` won't forward until clicked, while in sandbox)
- [x] **Step 6** — Inbound receiving LIVE: S3 bucket + Lambda + receipt rule + MX — **end-to-end test passed** (`support@` → `junaiduet888@gmail.com`)
- [ ] **Step 7** — SMTP credentials (app sending + "send as" + Supabase) — console
- [ ] **Step 8** — Request SES production access (leave the sandbox) — console

### Resources created (account 525125475269 / us-east-1)
| Resource | Name / ARN |
|----------|-----------|
| SES domain identity | `map-doc.com` |
| S3 mail bucket | `map-doc-incoming-mail` |
| Lambda execution role | `arn:aws:iam::525125475269:role/ses-forwarder-role` |
| Lambda function | `arn:aws:lambda:us-east-1:525125475269:function:ses-forwarder` |
| SES receipt rule set | `map-doc-inbound` (active), rule `forward-all` |
| MX | `map-doc.com → 10 inbound-smtp.us-east-1.amazonaws.com` |

> **Lambda source lives in the repo:** `infra/ses-forwarder/index.mjs`.
> **To change a forward mapping later:** edit `config.forwardMapping` there and redeploy:
> ```bash
> cd infra/ses-forwarder && zip -q function.zip index.mjs
> aws lambda update-function-code --function-name ses-forwarder \
>   --zip-file fileb://function.zip --region us-east-1
> ```

---

## Step 1 — SES domain identity ✅ done

```bash
aws sesv2 create-email-identity --email-identity map-doc.com --region us-east-1
```

Created with Easy DKIM. Three DKIM tokens were returned:

```
sa73744w3wxjp7f325yljg7qjyjzu3if
cc2zumm6cnsaly6s2tfbrijlfgtryoo7
6gezmib2qtam35dwhz574x7g2awn5uhn
```

Check verification status any time:

```bash
aws sesv2 get-email-identity --email-identity map-doc.com --region us-east-1 \
  --query "{Verified:VerifiedForSendingStatus,DKIM:DkimAttributes.Status}"
```

---

## Step 2 — DKIM records in Route 53 ✅ done

One CNAME per token (`<token>._domainkey.map-doc.com` → `<token>.dkim.amazonses.com`):

```bash
cat > /tmp/dkim-batch.json <<'EOF'
{
  "Comment": "SES Easy DKIM for map-doc.com",
  "Changes": [
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"sa73744w3wxjp7f325yljg7qjyjzu3if._domainkey.map-doc.com","Type":"CNAME","TTL":1800,"ResourceRecords":[{"Value":"sa73744w3wxjp7f325yljg7qjyjzu3if.dkim.amazonses.com"}]}},
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"cc2zumm6cnsaly6s2tfbrijlfgtryoo7._domainkey.map-doc.com","Type":"CNAME","TTL":1800,"ResourceRecords":[{"Value":"cc2zumm6cnsaly6s2tfbrijlfgtryoo7.dkim.amazonses.com"}]}},
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"6gezmib2qtam35dwhz574x7g2awn5uhn._domainkey.map-doc.com","Type":"CNAME","TTL":1800,"ResourceRecords":[{"Value":"6gezmib2qtam35dwhz574x7g2awn5uhn.dkim.amazonses.com"}]}}
  ]
}
EOF
aws route53 change-resource-record-sets --hosted-zone-id Z07910522KSPAWOHRXYKH \
  --change-batch file:///tmp/dkim-batch.json
```

DKIM flips to `SUCCESS` within minutes-to-an-hour once DNS propagates. The whole domain identity
shows `Verified` only after DKIM succeeds.

---

## Step 3 — SPF + DMARC (deliverability) ⬜ todo

**SPF** authorizes SES to send for the domain. **DMARC** tells receivers what to do with mail that
fails SPF/DKIM (start permissive with `p=none` and monitor).

```bash
cat > /tmp/auth-batch.json <<'EOF'
{
  "Comment": "SPF + DMARC for map-doc.com",
  "Changes": [
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"map-doc.com","Type":"TXT","TTL":1800,"ResourceRecords":[{"Value":"\"v=spf1 include:amazonses.com ~all\""}]}},
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"_dmarc.map-doc.com","Type":"TXT","TTL":1800,"ResourceRecords":[{"Value":"\"v=DMARC1; p=none; rua=mailto:dmarc@map-doc.com; fo=1\""}]}}
  ]
}
EOF
aws route53 change-resource-record-sets --hosted-zone-id Z07910522KSPAWOHRXYKH \
  --change-batch file:///tmp/auth-batch.json
```

> ⚠️ A domain may have only **one** SPF TXT record. If you later add another sender (e.g. Google),
> merge includes into the single record: `v=spf1 include:amazonses.com include:_spf.google.com ~all`.

---

## Step 4 — MAIL FROM subdomain (optional) ⬜ todo

Aligns the envelope sender with your domain (better deliverability). Uses a **subdomain** MX, so it
does **not** conflict with the inbound MX on the root (Step 6).

```bash
aws sesv2 put-email-identity-mail-from-attributes \
  --email-identity map-doc.com \
  --mail-from-domain mail.map-doc.com \
  --behavior-on-mx-failure USE_DEFAULT_VALUE --region us-east-1
```

Then add its DNS:

```bash
cat > /tmp/mailfrom-batch.json <<'EOF'
{
  "Comment": "MAIL FROM for mail.map-doc.com",
  "Changes": [
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"mail.map-doc.com","Type":"MX","TTL":1800,"ResourceRecords":[{"Value":"10 feedback-smtp.us-east-1.amazonses.com"}]}},
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"mail.map-doc.com","Type":"TXT","TTL":1800,"ResourceRecords":[{"Value":"\"v=spf1 include:amazonses.com ~all\""}]}}
  ]
}
EOF
aws route53 change-resource-record-sets --hosted-zone-id Z07910522KSPAWOHRXYKH \
  --change-batch file:///tmp/mailfrom-batch.json
```

---

## Step 5 — Verify the forward destination ⬜ todo

While SES is in the **sandbox** (Step 8 not yet approved), the forwarding Lambda can only deliver to
**verified** addresses. Verify your real inbox once:

```bash
aws sesv2 create-email-identity --email-identity YOUR_INBOX@example.com --region us-east-1
# → click the confirmation link AWS emails you
```

After production access is granted this is no longer required, but it's harmless to keep.

---

## Step 6 — Inbound receiving (SES → S3 → Lambda forward) ⬜ todo

> 🚧 **Blocked until permissions are granted** — see "Unblocking Step 6" just below.

### Unblocking Step 6 — permissions an admin must grant

The `junaidkhan01` user can do S3 + Route 53 + SES, but **not** IAM or Lambda. The forwarder needs
both. Two ways for an admin (root / admin on account `525125475269`) to unblock:

**Option A — broad/fast.** Attach managed policies to the user:
```bash
aws iam attach-user-policy --user-name junaidkhan01 \
  --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess
aws iam attach-user-policy --user-name junaidkhan01 \
  --policy-arn arn:aws:iam::aws:policy/IAMFullAccess
```

**Option B — least-privilege (recommended).** Admin pre-creates the Lambda execution role once, then
the user only needs Lambda perms + permission to pass *that one* role:
```bash
# 1. Trust policy: Lambda can assume the role
cat > /tmp/lambda-trust.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
EOF
aws iam create-role --role-name ses-forwarder-role \
  --assume-role-policy-document file:///tmp/lambda-trust.json

# 2. What the function may do: read the mail bucket, send via SES, write logs
cat > /tmp/lambda-perms.json <<'EOF'
{"Version":"2012-10-17","Statement":[
  {"Effect":"Allow","Action":["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],"Resource":"arn:aws:logs:*:525125475269:*"},
  {"Effect":"Allow","Action":"s3:GetObject","Resource":"arn:aws:s3:::map-doc-incoming-mail/*"},
  {"Effect":"Allow","Action":"ses:SendRawEmail","Resource":"*"}
]}
EOF
aws iam put-role-policy --role-name ses-forwarder-role \
  --policy-name ses-forwarder-perms --policy-document file:///tmp/lambda-perms.json

# 3. Let junaidkhan01 manage Lambda + pass only this role
aws iam attach-user-policy --user-name junaidkhan01 \
  --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess
cat > /tmp/passrole.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"iam:PassRole","Resource":"arn:aws:iam::525125475269:role/ses-forwarder-role"}]}
EOF
aws iam put-user-policy --user-name junaidkhan01 \
  --policy-name pass-ses-forwarder-role --policy-document file:///tmp/passrole.json
```

After Option B, the execution role ARN is
`arn:aws:iam::525125475269:role/ses-forwarder-role` — used in `--role` when creating the function.

### 6a. S3 bucket to hold incoming mail

```bash
aws s3api create-bucket --bucket map-doc-incoming-mail --region us-east-1
```

Bucket policy letting SES write objects (restricted to this account):

```bash
cat > /tmp/mail-bucket-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowSESPuts",
    "Effect": "Allow",
    "Principal": { "Service": "ses.amazonaws.com" },
    "Action": "s3:PutObject",
    "Resource": "arn:aws:s3:::map-doc-incoming-mail/*",
    "Condition": { "StringEquals": { "aws:SourceAccount": "525125475269" } }
  }]
}
EOF
aws s3api put-bucket-policy --bucket map-doc-incoming-mail --policy file:///tmp/mail-bucket-policy.json
```

### 6b. Forwarding Lambda

Use the well-known **aws-lambda-ses-forwarder** function (Node). It reads the raw email from S3,
rewrites `From` to a verified domain address, sets `Reply-To` to the original sender, and re-sends
via SES. Config maps each incoming address to a destination:

```js
// config inside the function
const config = {
  fromEmail: "noreply@map-doc.com",
  emailBucket: "map-doc-incoming-mail",
  emailKeyPrefix: "",
  forwardMapping: {
    "support@map-doc.com":     ["junaiduet888@gmail.com"],
    "hello@map-doc.com":       ["aliandkhan242@gmail.com"],
    "junaid.khan@map-doc.com": ["marshmallo.mapdoc@gmail.com"]
  }
};
```

The Lambda's IAM role needs: CloudWatch Logs, `s3:GetObject` on the bucket, and `ses:SendRawEmail`.

### 6c. Receipt rule set + rule

```bash
aws ses create-receipt-rule-set --rule-set-name map-doc-inbound --region us-east-1

aws ses create-receipt-rule --rule-set-name map-doc-inbound --region us-east-1 \
  --rule '{
    "Name": "forward-all",
    "Enabled": true,
    "TlsPolicy": "Optional",
    "Recipients": ["support@map-doc.com","hello@map-doc.com","junaid.khan@map-doc.com"],
    "Actions": [
      {"S3Action": {"BucketName": "map-doc-incoming-mail"}},
      {"LambdaAction": {"FunctionArn": "arn:aws:lambda:us-east-1:525125475269:function:ses-forwarder"}}
    ]
  }'

aws ses set-active-receipt-rule-set --rule-set-name map-doc-inbound --region us-east-1
```

> SES must be allowed to invoke the Lambda:
> ```bash
> aws lambda add-permission --function-name ses-forwarder \
>   --statement-id ses-invoke --action lambda:InvokeFunction \
>   --principal ses.amazonaws.com --source-account 525125475269 --region us-east-1
> ```

### 6d. MX record (the inbox MX — only one allowed on the root)

```bash
cat > /tmp/mx-batch.json <<'EOF'
{
  "Comment": "Inbound MX for map-doc.com",
  "Changes": [
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"map-doc.com","Type":"MX","TTL":1800,"ResourceRecords":[{"Value":"10 inbound-smtp.us-east-1.amazonaws.com"}]}}
  ]
}
EOF
aws route53 change-resource-record-sets --hosted-zone-id Z07910522KSPAWOHRXYKH \
  --change-batch file:///tmp/mx-batch.json
```

> ⚠️ This root MX is what makes SES the mail receiver. If you ever move inboxes to Google/Microsoft,
> this single record is what you repoint. The Step 4 MAIL FROM MX lives on `mail.` and is separate.

---

## Step 7 — SMTP credentials (sending + "send as") ⬜ todo

Create SES SMTP credentials (this provisions a dedicated IAM user under the hood):

- Console: **SES → SMTP settings → Create SMTP credentials**
- Endpoint: `email-smtp.us-east-1.amazonaws.com`, port `587` (STARTTLS)

Uses:
- **App/transactional mail** from `backend/` (e.g. `noreply@map-doc.com`).
- **"Send mail as"** in Gmail/your client, so replies leave as `support@map-doc.com` etc.
- **Supabase auth emails** (only relevant once email/password or magic-link auth is enabled — today
  the app uses Google OAuth, which sends no mail): Supabase → Authentication → Emails → SMTP Settings →
  host `email-smtp.us-east-1.amazonaws.com`, port `587`, the SMTP user/pass, sender `noreply@map-doc.com`.

---

## Step 8 — Leave the SES sandbox ⬜ todo

New SES accounts are sandboxed: outbound (including the forwarder's re-send) only reaches **verified**
addresses, capped at low volume. Request production access:

- Console: **SES → Account dashboard → Request production access**, or
- `aws sesv2 put-account-details ...`

Approval is usually a few hours. Until then, keep the destination address verified (Step 5).

---

## Quick verification

```bash
# DKIM / identity verified?
aws sesv2 get-email-identity --email-identity map-doc.com --region us-east-1 \
  --query "{Verified:VerifiedForSendingStatus,DKIM:DkimAttributes.Status}"

# DNS visible from the public internet?
dig +short TXT map-doc.com            # SPF
dig +short TXT _dmarc.map-doc.com     # DMARC
dig +short MX  map-doc.com            # inbound MX → inbound-smtp.us-east-1.amazonaws.com

# Sandbox status
aws sesv2 get-account --region us-east-1 \
  --query "{ProductionAccess:ProductionAccessEnabled,SendingEnabled:SendingEnabled}"

# End-to-end: send a test to one of the addresses from an outside account,
# confirm it lands in the forward destination.
```

---

## Teardown (if abandoning this approach)

```bash
aws ses set-active-receipt-rule-set --region us-east-1        # (omit name to deactivate)
aws ses delete-receipt-rule-set --rule-set-name map-doc-inbound --region us-east-1
aws lambda delete-function --function-name ses-forwarder --region us-east-1
aws s3 rb s3://map-doc-incoming-mail --force
aws sesv2 delete-email-identity --email-identity map-doc.com --region us-east-1
# then remove the DKIM / SPF / DMARC / MX records from Route 53
```
