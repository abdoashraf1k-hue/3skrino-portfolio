# Media storage (Sprint 12)

How the portfolio stores and serves images and videos, how to set up the free
Backblaze B2 bucket that holds the videos, how to move old videos over, and what
to do when something breaks.

Facts about providers and their free tiers were checked on 2026-10-06. Free
tiers change. If a number here matters to you, check it in the provider's own
console.

---

## 1. The short version

- **Small files** (hero poses, logos, site images, thumbnails) stay on **Vercel Blob**, the same as before.
- **Videos** go to a **private Backblaze B2 bucket**: 10 GB free, and no credit card needed to sign up.
- Videos go **straight from your browser to B2** when you upload them, and **straight from B2 to the visitor** when they watch. The site only hands out short-lived signed links.
- If B2 isn't set up, or can't be reached, **everything falls back to Vercel Blob** as it did before.
- **Old videos keep working.** Old Blob links and new B2 links can sit side by side. Moving the old videos to B2 is optional (see section 7).

---

## 2. Why we changed it

| Constraint | What it means |
|---|---|
| Vercel Blob Hobby: 1 GB storage, 10 GB transfer per month | The 1 GB is already full. A single video can be 100 MB–2 GB. |
| No credit card available | We can't use paid Blob, Cloudflare R2 or AWS S3. |
| Vercel functions accept request bodies of 4.5 MB at most | A video can't be uploaded through the site's own API. |
| Vercel Hobby functions run for 300 s at most | The site also can't relay video bytes, in either direction. |

So the video bytes must **never pass through the site**. The site only creates
signed URLs. The browser (when you upload) and the visitor's player (when they
watch) talk to the bucket directly.

### Why not Cloudflare in front of the videos?

Cloudflare's Service-Specific Terms (updated 2026-09-28) say that serving video
through the free CDN needs a paid product (Stream or R2). Free plans also only
cache files up to 512 MB. The "Bandwidth Alliance" still makes B2 → Cloudflare
egress free, but that doesn't help when Cloudflare can't serve the video at all.

### Why is the bucket private?

A B2 account without a card **can't create a public bucket**. B2 needs a
payment history or a small card charge before your first public bucket. That's
fine: a private bucket plus signed links works just as well for visitors (see
section 3).

---

## 3. How it works

```
                 UPLOAD (admin)                                   PLAYBACK (visitor)

  Your browser (admin panel)                              Visitor's browser / <video>
     │                                                         │
     │ 1. POST /api/admin/b2-upload                            │ 1. GET https://3skrino.com/media/videos/<key>.mp4
     │    (admin key; filename, type, size)                    ▼
     ▼                                                ┌──────────────────────────────┐
  ┌──────────────────────────────┐                    │ Vercel: /media/<key> route   │
  │ Vercel: b2-upload route      │                    │ 302 redirect → presigned GET │
  │ checks admin key, mints the  │                    │ (URL lives 15 min; redirect  │
  │ key + presigned PUT/part     │                    │  cached 10 min, private)     │
  │ URLs (≤ 15 min each)         │                    └──────────────┬───────────────┘
  └──────────────┬───────────────┘                                   │ 2. follows redirect
                 │ 2. signed URLs (no bytes)                         ▼
                 ▼                                   ┌──────────────────────────────┐
  Your browser ──── 3. PUT video bytes directly ───▶ │  Backblaze B2 (PRIVATE)      │
     (16 MiB parts, 5 at a time)                     │  bucket: videos/, thumbnails/│ ── 3. video bytes ──▶ visitor
                 │ 4. "complete" → public URL        └──────────────────────────────┘
                 ▼
  data/projects.ts stores  https://3skrino.com/media/videos/<key>.mp4

  Small images (poses, logos, site images, thumbnails) ──▶ Vercel Blob (unchanged)
```

### Uploading a video (what the admin does for you)

1. The admin asks `POST /api/admin/b2-upload` for an upload. This needs the admin key.
2. The server creates the file name, `videos/<timestamp>-<random>.<ext>`, and signs the upload URLs with the B2 keys. The keys never leave the server.
3. **Files under 5 MiB** go up as one signed `PUT`.
4. **Files of 5 MiB or more** use S3 multipart upload:
   - 16 MiB parts. Bigger files get bigger parts, so a file never needs more than 10,000 parts.
   - 5 parts upload at the same time.
   - Each part gets 3 attempts, waiting a little longer each time.
   - Part URLs are signed 8 at a time, as they're needed. Every signed URL expires within 15 minutes.
   - The file is read in slices, so even a 2 GB upload uses very little memory.
   - **Cancel** aborts the multipart upload, so the half-finished parts get thrown away.
5. When the upload finishes, the project stores a URL like
   `https://3skrino.com/media/videos/1759740000000-ab12cd.mp4`.

### Playing a video

1. The player asks for `https://3skrino.com/media/<key>`.
2. The site answers with a **302 redirect** to a signed B2 link that lives 15 minutes. The browser may cache the redirect for 10 minutes, and only privately.
3. The video streams **straight from B2**. Seeking uses normal HTTP Range requests.
4. If the link runs out while someone is watching, the player asks `/media/<key>` again and carries on.

### Which storage new videos use

The first rule that applies wins:

1. **admin → Settings → Storage**: Auto / Backblaze B2 / Vercel Blob. This is saved in `data/site-config.ts` as `storage.videoProvider`.
2. The `NEXT_PUBLIC_STORAGE_PROVIDER` env var (`b2` or `vercel-blob`), if it's set.
3. **Auto**: B2 if the `B2_*` variables are set, otherwise Vercel Blob.

### When something fails

- **B2 variables missing**: everything uses Vercel Blob, exactly as before Sprint 12.
- **B2 unreachable before an upload starts**: that upload falls back to Vercel Blob.
- **Old Blob video URLs**: keep working for good. Nothing needs to be migrated.

---

## 4. Set up Backblaze B2 (one time, about 20 minutes)

### Step 1: Create the account and bucket

1. Sign up at <https://www.backblaze.com/sign-up/cloud-storage>. No card is needed.
2. Open **B2 Cloud Storage → Buckets → Create a Bucket**.
3. Name it, for example `3skrino-videos`. Bucket names are unique across all of B2, so you may need a variation.
4. **Files in Bucket: Private.**
5. Leave encryption and object lock as they are, then create the bucket.
6. On the bucket card, note the **Endpoint**, for example `s3.eu-central-003.backblazeb2.com`.
   - The **region** is the middle part, for example `eu-central-003`.

### Step 2: Create an application key for the site

1. Go to **Application Keys → Add a New Application Key**.
2. Name it `3skrino-site`.
3. **Allow access to bucket:** pick only your video bucket.
4. **Type of access:** Read and Write. That gives `listFiles`, `readFiles`, `writeFiles` and `deleteFiles`. If the console insists, also allow `listBuckets`.
5. You **don't** need `shareFiles`. Signed S3 URLs work without it.
6. Copy the **keyID** and the **applicationKey** right away. The application key is **shown only once**.

### Step 3: Set CORS (required)

Your browser uploads straight to B2, so the bucket must allow your site's
origins. It must also **expose the `ETag` header**: the uploader needs each
part's ETag to finish a multipart upload.

The simple CORS options in B2's web UI **can't expose ETag**, so set the rules
through the API. Two ways:

**Option A (recommended): the setup script.** Python 3 only, no other installs,
and it works the same in PowerShell, Git Bash or cmd:

```bash
python scripts/setup-b2.py --key-id <keyID> --app-key <applicationKey> --bucket 3skrino-videos-2026
```

- It reads `B2_KEY_ID` / `B2_APP_KEY` / `B2_BUCKET_NAME` (and `B2_API_ENDPOINT`,
  default `https://api003.backblazeb2.com`) from the shell or `.env.local` when
  you leave the flags out. Typing the key as a flag keeps it out of every file.
- It sets the CORS rule and the lifecycle rule (Step 4) in one call, then prints
  the rules that are now live and checks that `ETag` is exposed.
- `python scripts/setup-b2.py --check` only prints the live rules.
- Changing bucket settings needs the `writeBuckets` capability. If your key
  lacks it, the script says so; run it once with your master key instead.
- It uses B2's native API. Other providers (Cloudflare R2, AWS) set CORS with
  the S3 `PutBucketCors` call instead.

**Option B: the `b2` CLI (v5).** `pip install b2`, then
`b2 account authorize <keyID> <applicationKey>`, then:

```bash
b2 bucket update \
  --cors-rules '[{"corsRuleName":"admin-uploads","allowedOrigins":["https://3skrino-portfolio.vercel.app","https://3skrino.com","https://www.3skrino.com","http://localhost:3000"],"allowedOperations":["s3_put","s3_get","s3_head"],"allowedHeaders":["*"],"exposeHeaders":["ETag"],"maxAgeSeconds":3600}]' \
  --lifecycle-rule '{"fileNamePrefix":"","daysFromHidingToDeleting":null,"daysFromUploadingToHiding":null,"daysFromStartingToCancelingUnfinishedLargeFiles":1}' \
  3skrino-videos-2026 allPrivate
```

- Run it in **Git Bash**. v5 has no `--cors-rules-file`; the JSON goes inline.
- **Windows PowerShell 5.1 strips the double quotes** inside the JSON when it
  calls a native program, so B2 receives broken JSON. PowerShell 7.3+ passes
  them through. If you're stuck in PowerShell, use Option A.
- Check with `b2 bucket get 3skrino-videos-2026`: look for `corsRules` with
  `admin-uploads`, and the lifecycle rule.

**Important:** once you set CORS rules with the CLI, **don't** change CORS in
the B2 web UI afterwards. The UI's simple options overwrite your custom rules.

**Origins:**
- `http://localhost:3000` is there for local testing. Once you're done testing,
  drop it from the list (or use a separate dev bucket).
- Uploads from a Vercel preview URL (`https://<project>-<hash>.vercel.app`) fail
  CORS unless you add that exact origin. Upload from the production admin or
  from localhost instead.

### Step 4: Lifecycle rule (set together with CORS in Step 3)

```json
{
  "fileNamePrefix": "",
  "daysFromHidingToDeleting": null,
  "daysFromUploadingToHiding": null,
  "daysFromStartingToCancelingUnfinishedLargeFiles": 1
}
```

If an upload is interrupted (browser closed, laptop asleep), its finished parts
stay in the bucket as an "unfinished large file". They **count against your
10 GB**, even though no video uses them. This rule cleans them up after one day.

Only use `daysFromStartingToCancelingUnfinishedLargeFiles` here. **Don't** set
`daysFromUploadingToHiding`: that hides every finished video after that many
days, and `daysFromHidingToDeleting` then deletes it.

### Step 5: Turn on Caps & Alerts

In the B2 console, open **Caps & Alerts** and set email alerts for storage and
download bandwidth. See section 8 for why this matters.

---

## 5. Environment variables

Add these in **Vercel → your project → Settings → Environment Variables**. Tick
both **Production** and **Preview**. For local development, put the same values
in `.env.local`.

| Variable | Example | Notes |
|---|---|---|
| `B2_ENDPOINT` | `https://s3.eu-central-003.backblazeb2.com` | The bucket's endpoint, with `https://` in front. |
| `B2_REGION` | `eu-central-003` | The middle part of the endpoint. |
| `B2_KEY_ID` | `004a1b2c...0000000003` | keyID from Step 2. **Secret.** |
| `B2_APP_KEY` | `K004...` | applicationKey from Step 2. **Secret.** |
| `B2_BUCKET_NAME` | `3skrino-videos-2026` | The bucket name. |
| `B2_API_ENDPOINT` | `https://api003.backblazeb2.com` | Only for `scripts/setup-b2.py` (the one-time CORS setup). Not needed on Vercel. |
| `NEXT_PUBLIC_CDN_URL` | *(leave empty)* | Leave this empty while the bucket is private. Only set it if a public bucket sits behind a CDN later, for example an R2 custom domain. |
| `NEXT_PUBLIC_STORAGE_PROVIDER` | `b2` or `vercel-blob` | Optional. Settings → Storage overrides it unless it's on Auto. Leave it empty for "auto". |
| `BLOB_READ_WRITE_TOKEN` | *(already set)* | Still needed for images, thumbnails and old videos. |
| `NEXT_PUBLIC_SITE_URL` | `https://3skrino.com` | Video URLs are saved as absolute links built from this, so it must be the **production** `https://` origin in every environment, including localhost and previews. The default is `https://3skrino.com`, so **while that domain doesn't serve this site, set it to `https://3skrino-portfolio.vercel.app`**, or every new video gets a dead link. An `http://localhost` value makes project saves fail. If the domain ever changes, stored URLs need rewriting. |

After saving the variables:

1. **Redeploy.** Env vars only apply to new deployments: Deployments → ⋯ → Redeploy.
2. Open **admin → Settings → Storage**. It should say B2 is **configured** and show the bucket's usage.
3. Upload a small test video, publish, and play it on the live site.

Never commit real keys. `.env.example` only lists the variable names. When you
copy lines from it, type the values without the trailing `# e.g.` comments.

**Don't remove the `B2_*` variables once videos live on B2.** Without them,
every `/media/...` link answers 404 and those videos stop playing. To stop
sending *new* videos to B2, pick **Vercel Blob** in Settings → Storage instead.

---

## 6. Day-to-day use

- **Uploading:** nothing changes. Drop a video in the admin as before. The progress bar shows the parts as they upload, and **Cancel** stops the upload cleanly.
- **Max size:** 2 GB per video in the admin. (S3 itself allows more, but the browser upload is limited on purpose.)
- **Accepted formats:** videos in MP4, WebM or MOV. Thumbnails in JPEG, PNG or WebP, up to 15 MB.
- **Cleaning up B2 files.** The admin deletes a B2 video only when nothing can point at it:
  - you **replace** or **remove** a video you uploaded in the same editing session, or
  - you **close the editor without saving** after uploading one.

  Deleting a project, or replacing a video that was already saved, does **not**
  delete the B2 file yet (old backups may still reference it). Remove those by
  hand in the B2 console (Buckets → Browse Files → `videos/`) once you're sure.
- **Settings → Storage** shows where new videos go right now, plus usage for both B2 and Blob.

---

## 7. Moving old videos from Vercel Blob to B2 (optional)

You don't have to do this. Old videos keep playing from Blob. Moving them frees
the full 1 GB Blob store for images.

### Option A: From the admin (easiest)

1. Open **admin → Settings → Storage → Migrate old videos**.
2. Leave the tab open. The browser streams each video from Blob and uploads it to B2 with multipart upload, then updates the project to use the new URL.
3. When it finishes, open a few projects on the live site and check that they play.
4. Wait until the redeploy with the new links is **live** (Vercel → Deployments shows it Ready), then open a few projects on the live site and check that they play. Until that deploy is live, the public site still plays the Blob originals.
5. Only then click **Delete originals** to remove the Blob copies. Nothing is deleted before you click it. Older admin backups still point at the Blob URLs, so restoring one of those afterwards would bring back dead links.

### Option B: From the command line

This needs a local `.env.local` with the `B2_*` variables and `BLOB_READ_WRITE_TOKEN`.

```bash
# 1. Dry run (the default): lists what would move, changes nothing
node scripts/migrate-blob-to-b2.mjs

# 2. Do it
node scripts/migrate-blob-to-b2.mjs --confirm

# Useful flags
node scripts/migrate-blob-to-b2.mjs --confirm --only=<projectId>   # one project
node scripts/migrate-blob-to-b2.mjs --confirm --limit=3            # the first 3 videos
node scripts/migrate-blob-to-b2.mjs --confirm --include-orphans    # also Blob videos no project uses

# 3. Commit + push data/projects.ts, wait for the deploy to be live, check playback.
#    THEN delete the Blob originals in a second run (asks you to type DELETE).
#    The script refuses while data/projects.ts is uncommitted or unpushed.
node scripts/migrate-blob-to-b2.mjs --confirm --delete-source

# Undo: point projects back at the Blob URLs. Refused once any original was
# deleted (the restored links would be dead) unless you add --force.
node scripts/migrate-blob-to-b2.mjs --rollback
```

- The script saves its progress in `.migration/`. If it stops, run the same command again and it picks up where it left off.
- It backs up `data/projects.ts` before changing it.
- When you're done, **commit `data/projects.ts`** and push, so the live site uses the new URLs.
- `--rollback` restores only the newest backup in `.migration/`, and overwrites any project edits made since then.

---

## 8. Limits (honest numbers)

| Limit | Value | What it means for you |
|---|---|---|
| B2 free storage | 10 GB | About 5–10 long videos, or many more short web exports. |
| B2 free download (egress) | 1 GB per day on an account without a payment method | A 200 MB video watched 5 times uses a whole day. Videos stop loading until the daily cap resets (00:00 UTC). |
| B2 transactions | Class A (uploads, deletes) free. Class B (downloads, HEAD) 2,500/day free. Class C (listing) 2,500/day free | Every seek or chunk a player fetches is one Class B call, so a busy day can hit this before the 1 GB does. Opening Settings → Storage costs a few Class C calls. |
| Max upload in the admin | 2 GB per video | A limit we chose; S3 allows more. |
| Multipart | 10,000 parts at most | Handled automatically. |
| Signed URLs | 15 minutes | The player refreshes them on its own. URLs are reused for 5-minute windows so the browser cache can serve repeat views. |
| Vercel function calls | One per video view (the redirect) | Hobby allows 1M a month, which is plenty. |
| Vercel Blob (images) | 1 GB storage, 10 GB transfer per month | Fine for images once the videos are gone. |

Without a card on file these caps are hard limits; you can't raise them in
Caps & Alerts. If one is hit, videos stop loading until it resets. Images and
the rest of the site keep working.

**Watch out for autoplaying videos.** The hero reel, hover previews and the
reels player autoplay and loop their videos. If those point at B2, every home
page visit downloads them, and a few dozen visits can use the whole 1 GB day.
Keep those videos small (a 5–10 MB 720p loop) or keep them on Vercel Blob, and
use B2 for the full project videos that only play when someone clicks.

**`/media` has no rate limit.** Anyone can replay a public video in a loop and
use up the daily download cap. If that ever happens, add a Vercel Firewall rate
limit rule on `/media/*`.

### Ways to stretch the free 10 GB

1. **Export for the web, not for archiving.** 1080p H.264 at about 10 Mbps is roughly 75 MB per minute and looks great in a browser. Don't upload ProRes or masters.
2. **Keep masters offline** on your own drive or cloud backup, not in the portfolio bucket.
3. **Use YouTube or Vimeo for long-form work** and embed or link it. Keep B2 for reels and short pieces.
4. **Add a second no-card bucket** behind the same S3 code, for example iDrive e2. Its free tier may not be permanent (unverified), so check before you rely on it.

---

## 9. Switching providers later

The code talks to "any S3-compatible bucket", so moving is a settings change,
not a code change.

**Example: Cloudflare R2** (if a card becomes available: 10 GB free, unlimited
free egress, and a public custom domain):

1. Create an R2 bucket, an R2 API token and a public custom domain, for example `media.3skrino.com`.
2. Set `B2_ENDPOINT` to the R2 S3 endpoint (`https://<account-id>.r2.cloudflarestorage.com`), `B2_REGION=auto`, and set `B2_KEY_ID`, `B2_APP_KEY` and `B2_BUCKET_NAME` to the R2 values.
3. Set `NEXT_PUBLIC_CDN_URL=https://media.3skrino.com`. New videos then get direct CDN URLs instead of `/media/...` redirects. Also add `{ protocol: "https", hostname: "media.3skrino.com" }` to `images.remotePatterns` in `next.config.ts` so thumbnails on that host render. (Admin labels and error messages will still say "B2"; `B2_*` and `b2-upload` are historical names for "the S3-compatible bucket".)
4. Add the same CORS rule to the R2 bucket (allowed methods PUT/GET/HEAD, expose `ETag`).
5. Redeploy. Copy existing files across with `rclone` or a migration script.

To go **back to Vercel Blob only**, pick **Vercel Blob** in Settings → Storage.
Keep the `B2_*` variables for as long as any project still uses a `/media/...`
link, or those videos stop playing.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `SignatureDoesNotMatch` when uploading | (a) The S3 client's checksum defaults: AWS SDK v3.729+ signs a CRC32 of an empty body into signed URLs. (b) Wrong key ID or app key. (c) Your computer's clock is wrong. | (a) The server client must use `requestChecksumCalculation: "WHEN_REQUIRED"` and `responseChecksumValidation: "WHEN_REQUIRED"`. This is already in the code, so don't remove it. (b) Re-copy `B2_KEY_ID`/`B2_APP_KEY` and redeploy. (c) Sync the system clock. |
| "The bucket's CORS rules must expose the ETag header" | The CORS rule is missing `exposeHeaders: ["ETag"]`, or the web UI overwrote it. | Re-run the `b2 bucket update --cors-rules …` command from section 4. |
| Upload fails at once, and the browser console shows a CORS / preflight error | Your site's origin isn't in `allowedOrigins`, or an operation or header is missing. | Add the exact origin (scheme, host and port, with no trailing slash). Check the operation names in B2's CORS docs. Wait a minute and try again. |
| 403 "Request has expired" | A signed URL was used after 15 minutes. | The uploader and player handle this themselves. If it keeps happening, your computer's clock is probably wrong. |
| 503 "B2 isn't configured" | One or more `B2_*` variables are missing on this deployment. | Add them in Vercel (Production **and** Preview), then redeploy. |
| "Storage quota exceeded" (Vercel Blob) | The 1 GB Blob store is full. | Make sure new videos go to B2 (Settings → Storage), then migrate the old videos (section 7). |
| Video doesn't play on the live site | The bucket is private, so playback must go through `/media/...`. The `B2_*` variables may be missing on Vercel, or the key may lack `readFiles`. | Open the video URL in a new tab. It should redirect to a `backblazeb2.com` link. If you get an error page instead, check the `B2_*` variables and the key's permissions, then redeploy. |
| Videos stopped loading partway through the month | B2's download (egress) cap has been reached. | Check **Caps & Alerts** in B2. Wait for the cap to reset, or move long videos to YouTube/Vimeo. |
| B2 usage is higher than the videos you have | Unfinished multipart uploads ("unfinished large files") from cancelled or crashed uploads. | Add the lifecycle rule from section 4. You can also cancel them by hand in the B2 console. |

---

## 11. Where the code lives (for developers)

| File | Role |
|---|---|
| `lib/admin/storage/contract.ts` | The shared contract: provider names, limits, request and response shapes, key pattern, URL helpers. |
| `app/api/admin/b2-upload/route.ts` | Mints signed PUT / multipart URLs, completes, aborts and deletes uploads (admin key required). |
| `app/api/admin/storage/route.ts` | Status and usage for Settings → Storage. |
| `app/media/[...key]/route.ts` | Public delivery: 302 to a signed GET that lives 15 minutes. |
| `scripts/migrate-blob-to-b2.mjs` | The command-line migration (section 7). |
| `data/site-config.ts` → `storage.videoProvider` | The admin's provider choice. |

Rules to keep:

- Video bytes never go through a Vercel function. The site only signs URLs.
- Object keys are created **on the server only**, as `videos|thumbnails/<epoch ms>-<random>.<ext>`. Every key the browser sends back is checked against `KEY_PATTERN`.
- Every signed URL lives at most 15 minutes (`LIMITS.presignTtlSeconds`).
- B2 credentials are server-only. Never give them a `NEXT_PUBLIC_` name.
