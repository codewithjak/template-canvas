import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";

const REGION = "us-east-1";
const s3  = new S3Client({ region: REGION });
const ses = new SESClient({ region: REGION });

const config = {
  fromEmail: "noreply@map-doc.com",
  emailBucket: "map-doc-incoming-mail",
  emailKeyPrefix: "",
  forwardMapping: {
    "support@map-doc.com":     ["junaiduet888@gmail.com"],
    "hello@map-doc.com":       ["aliandkhan242@gmail.com"],
    "junaid.khan@map-doc.com": ["marshmallo.mapdoc@gmail.com"],
  },
};

const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });

// Rewrite From -> verified domain, preserve original sender in Reply-To,
// and strip headers that break re-sending (Return-Path, Sender, Message-ID, DKIM).
function processEmail(data) {
  const match = data.match(/^((?:.+\r?\n)*)(\r?\n[\s\S]*)/m);
  let header = match && match[1] ? match[1] : data;
  const body = match && match[2] ? match[2] : "";

  if (!/^reply-to:[\t ]?/im.test(header)) {
    const from = header.match(/^from:[\t ]?(.*(?:\r?\n\s+.*)*\r?\n)/im);
    if (from && from[1]) header = header + "Reply-To: " + from[1];
  }

  header = header.replace(
    /^from:[\t ]?(.*(?:\r?\n\s+.*)*)/gim,
    (m, from) => "From: " + from.replace(/<(.*)>/, "").trim() + " <" + config.fromEmail + ">"
  );
  header = header.replace(/^return-path:[\t ]?(.*)\r?\n/gim, "");
  header = header.replace(/^sender:[\t ]?(.*)\r?\n/gim, "");
  header = header.replace(/^message-id:[\t ]?(.*)\r?\n/gim, "");
  header = header.replace(/^dkim-signature:[\t ]?.*\r?\n(\s+.*\r?\n)*/gim, "");

  return header + body;
}

export const handler = async (event) => {
  const ssRecord = event.Records[0].ses;
  const messageId = ssRecord.mail.messageId;
  const recipients = ssRecord.receipt.recipients;

  const dests = new Set();
  for (const r of recipients) {
    const mapped = config.forwardMapping[r.toLowerCase()];
    if (mapped) mapped.forEach((d) => dests.add(d));
  }
  if (dests.size === 0) {
    console.log("No forwardMapping match for:", recipients);
    return { disposition: "STOP_RULE" };
  }

  const obj = await s3.send(
    new GetObjectCommand({ Bucket: config.emailBucket, Key: config.emailKeyPrefix + messageId })
  );
  const raw = await streamToString(obj.Body);
  const processed = processEmail(raw);

  await ses.send(
    new SendRawEmailCommand({
      Source: config.fromEmail,
      Destinations: [...dests],
      RawMessage: { Data: Buffer.from(processed) },
    })
  );
  console.log("Forwarded", messageId, "->", [...dests].join(", "));
  return { disposition: "CONTINUE" };
};
