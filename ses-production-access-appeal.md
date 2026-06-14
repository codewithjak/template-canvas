# SES Production Access — Appeal (Case 178100809100454)

Region: us-east-1 · Account: 525125475269 · Domain: map-doc.com (DKIM SUCCESS, SPF + DMARC published)

---

Map-Doc (Template Canvas) is a document/template generation SaaS at https://www.map-doc.com.
We send only transactional email, triggered by a user's own action — never marketing or bulk mail.

Two categories:
1. Account/authentication notifications from noreply@map-doc.com (sign-up verification,
   password reset, login alerts).
2. One-to-one customer-support replies from support@, hello@ and junaid.khan@map-doc.com,
   sent only in response to inbound messages from the user.

Recipients: exclusively our registered users (who supplied and confirmed their address at
sign-up) and people who emailed our support addresses first. We never send to purchased,
scraped, or third-party lists.

Authentication: sending domain map-doc.com is verified with Easy DKIM (SUCCESS) and publishes
SPF and DMARC.

Bounce/complaint handling: SES account-level suppression is enabled for BOUNCE and COMPLAINT.
We subscribe to SES bounce/complaint notifications via SNS, automatically suppress hard bounces
and complaints in our database, and stop sending to them.

Opt-out: every non-essential message includes a clear unsubscribe/opt-out link, honored
immediately.

Volume: low (tens to low hundreds per day initially).

Request: production access to deliver these transactional messages to real registered users
beyond the few currently verified test addresses.
