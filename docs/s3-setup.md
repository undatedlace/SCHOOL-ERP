# Setting up S3 file storage

Uploaded files (photographs now; documents, homework and PDFs later) are kept
on disk in development and in an S3-compatible bucket in production. The app
never makes the bucket public: every file is served through the API, which
checks who may see it.

## 1. Create the bucket (AWS)

1. S3, Create bucket. Pick the Mumbai region (`ap-south-1`), a name such as `yourschool-erp-files`.
2. Leave **Block all public access** turned **on**.
3. Turn on default encryption (SSE-S3 is the default on new buckets).
4. Optional: turn on versioning, so an accidental delete can be undone.

## 2. Create a user that can only use that bucket

IAM, Users, Create user (no console access), then attach this policy (replace the bucket name):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::yourschool-erp-files/*"
    }
  ]
}
```

Create an access key for the user. The app needs nothing else: no listing, no
bucket settings, no public access.

On a server that runs inside AWS (EC2, ECS), give the server an IAM role with
the same policy instead, and leave the two key settings empty.

## 3. Put the settings in `api/.env`

```
FILES_DRIVER="s3"
S3_BUCKET="yourschool-erp-files"
S3_REGION="ap-south-1"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
# Optional folder inside the bucket:
S3_KEY_PREFIX="school-erp"
```

`.env` is never committed. In production, set these as environment variables
on the server rather than in a file.

## 4. Check it

```
cd api
npm run s3:check
```

It writes a small test file, reads it back and deletes it, and explains what to
fix if something is wrong (wrong key, region, bucket name or permissions).

## Other S3-compatible services

Cloudflare R2, MinIO, DigitalOcean Spaces and similar services work by also
setting `S3_ENDPOINT` (and `S3_FORCE_PATH_STYLE="true"` for MinIO). For R2 the
region is `auto`.

## Moving files you already have

Files uploaded while `FILES_DRIVER="local"` stay on that machine's disk. Switching
the driver does not copy them. For a fresh production start there is nothing to
move; if there ever is, copy the contents of `FILES_DIR` into the bucket keeping
the same relative paths (for example with `aws s3 sync`).
