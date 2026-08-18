# Amazon Polly setup

Evidence Arena and Practice Arena can play AI responses synthesized by Amazon Polly using the [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_polly_code_examples.html). The browser calls the authenticated Socratic Arena backend; only the backend calls AWS. Missing AWS configuration disables Listen controls without affecting text debates, RAG, authentication, or server startup.

## 1. Create a least-privilege AWS identity

For the current Render deployment, create a dedicated IAM user with programmatic credentials. Do not use the AWS account root user and do not reuse credentials from another application.

Attach only this customer-managed policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SocraticArenaSpeechSynthesis",
      "Effect": "Allow",
      "Action": "polly:SynthesizeSpeech",
      "Resource": "*"
    }
  ]
}
```

AWS's [Polly permissions reference](https://docs.aws.amazon.com/polly/latest/dg/api-permissions-reference.html) specifies `*` for `SynthesizeSpeech`, so the wildcard resource is required; the action itself remains restricted to speech synthesis. If the backend later moves to AWS compute, replace long-lived keys with an IAM role.

## 2. Configure the backend

Add these secrets/values to the Render backend service environment:

```env
TTS_ENABLED=true
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=replace-in-render-only
AWS_SECRET_ACCESS_KEY=replace-in-render-only
AWS_SESSION_TOKEN=
POLLY_VOICE_ID=Joanna
POLLY_ENGINE=standard
POLLY_MAX_CHARACTERS=2800
```

- Choose a region in which the selected Polly voice and engine are supported.
- Temporary credentials require `AWS_SESSION_TOKEN`; long-lived IAM user credentials leave it blank.
- Never place these values in `VITE_*` variables, frontend settings, source code, screenshots, or Git.
- The AWS SDK uses its normal server-side credential provider chain. The application does not manually send credentials.

Redeploy the Render backend after saving the values. Redeploy the frontend when shipping the new Listen UI; it needs no AWS variables.

## 3. Verify

Sign in, copy the current Supabase access token, and call the backend:

```bash
curl -X POST "https://YOUR-RENDER-SERVICE/api/tts/synthesize" \
  -H "Authorization: Bearer YOUR_SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"text":"Amazon Polly voice output is working."}' \
  --output polly-test.mp3
```

The response must be `200` with `Content-Type: audio/mpeg`, and the saved file must contain the spoken text. Unit tests use an injected mock client and never spend AWS credits.

## 4. Operational safety

- The endpoint requires Supabase authentication, caps text length, and has per-user and per-IP rate limits.
- Audio is streamed from memory with `Cache-Control: private, no-store`; it is not written to disk or S3.
- AWS failures are logged using only the error type/request ID/status and returned to clients as a sanitized error.
- If a key is exposed, disable/delete it immediately, create a replacement, update Render, and redeploy.
- Keep billing alerts and CloudTrail/IAM access reviews appropriate to the AWS account.

This is a practical AWS API, SDK, IAM, and secret-management integration for Amazon Polly. It should not be represented as broad AWS infrastructure experience.
