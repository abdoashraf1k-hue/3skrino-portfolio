#!/usr/bin/env python3
"""Configure a Backblaze B2 bucket for the admin's direct browser uploads.

Sets the CORS rule (browser PUT/GET/HEAD from the site, ETag exposed for
multipart) and a lifecycle rule that cancels unfinished multipart uploads
after 1 day, via B2's native API. Standard library only, so no b2 CLI and no
PowerShell JSON-quoting problems.

  python scripts/setup-b2.py            apply the rules, then print the live ones
  python scripts/setup-b2.py --check    only print the live rules

Credentials: --key-id/--app-key/--bucket, else env vars (B2_KEY_ID or
B2_APPLICATION_KEY_ID, B2_APP_KEY or B2_APPLICATION_KEY, B2_BUCKET_NAME or
B2_BUCKET), else .env.local. Changing bucket settings needs a key with the
writeBuckets capability (e.g. the master key); keys restricted to one bucket
in the web UI usually lack it. --api / B2_API_ENDPOINT picks the B2 cluster.
This is B2's native API; for Cloudflare R2 or AWS use S3 PutBucketCors.
"""
import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import NoReturn

ENV_FILE = Path(__file__).resolve().parent.parent / ".env.local"
DEFAULT_API = "https://api003.backblazeb2.com"
ORIGINS = ["https://3skrino-portfolio.vercel.app", "https://3skrino.com", "https://www.3skrino.com", "http://localhost:3000"]
CORS_RULES = [{
    "corsRuleName": "admin-uploads",
    "allowedOrigins": ORIGINS,
    "allowedOperations": ["s3_put", "s3_get", "s3_head"],
    "allowedHeaders": ["*"],
    "exposeHeaders": ["ETag"],
    "maxAgeSeconds": 3600,
}]
# Only cancels unfinished large (multipart) uploads. Never set
# daysFromUploadingToHiding here: that would hide, then delete, every video.
LIFECYCLE_RULES = [{
    "fileNamePrefix": "",
    "daysFromUploadingToHiding": None,
    "daysFromHidingToDeleting": None,
    "daysFromStartingToCancelingUnfinishedLargeFiles": 1,
}]
NO_WRITE_BUCKETS = ("This key can't change bucket settings (it needs writeBuckets). Run it once with the\n"
                    "  master application key: --key-id <master keyID> --app-key <master applicationKey>")


def fail(msg: str) -> NoReturn:
    sys.exit(f"ERROR: {msg}")


def env_file() -> dict:
    """KEY=value pairs from .env.local (quotes and trailing # comments stripped)."""
    pairs = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip().removeprefix("export ")
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                pairs[key.strip()] = val.split(" #")[0].strip().strip("'\"")
    return pairs


def setting(cli, *names, default=""):
    """CLI value, else the first env var set, else .env.local, else the default."""
    file_vals = env_file()
    return cli or next((os.environ[n] for n in names if os.environ.get(n)), None) \
        or next((file_vals[n] for n in names if file_vals.get(n)), None) or default


def call(url: str, body=None, token=None, basic=None) -> dict:
    """GET (no body) or POST a B2 API URL; HTTP errors become readable exits."""
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None)
    if basic:
        req.add_header("Authorization", "Basic " + base64.b64encode(basic.encode()).decode())
    elif token:
        req.add_header("Authorization", token)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.load(res)
    except urllib.error.HTTPError as err:
        try:
            info = json.load(err)
        except ValueError:
            info = {}
        hint = ""
        if err.code == 401:
            hint = ("\n  Check the keyID / applicationKey." if "authorize_account" in url else f"\n  {NO_WRITE_BUCKETS}")
        fail(f"B2 answered HTTP {err.code} {info.get('code', err.reason)}: {info.get('message', '')}{hint}")
    except urllib.error.URLError as err:
        fail(f"couldn't reach {url}: {err.reason}")


def show(bucket: dict) -> None:
    print(f"\nLive rules on '{bucket['bucketName']}' ({bucket['bucketType']}):")
    print("corsRules =", json.dumps(bucket.get("corsRules", []), indent=2))
    print("lifecycleRules =", json.dumps(bucket.get("lifecycleRules", []), indent=2))
    etag = any("etag" in [h.lower() for h in r.get("exposeHeaders", [])] for r in bucket.get("corsRules", []))
    print("\nETag exposed:", "YES (multipart uploads can read part ETags)" if etag else "NO (multipart uploads will fail)")
    if not etag:
        sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--key-id")
    ap.add_argument("--app-key")
    ap.add_argument("--bucket")
    ap.add_argument("--api", help=f"B2 API endpoint (env B2_API_ENDPOINT, default {DEFAULT_API})")
    ap.add_argument("--check", action="store_true", help="only print the bucket's current rules")
    args = ap.parse_args()

    key_id = setting(args.key_id, "B2_KEY_ID", "B2_APPLICATION_KEY_ID")
    app_key = setting(args.app_key, "B2_APP_KEY", "B2_APPLICATION_KEY")
    bucket_name = setting(args.bucket, "B2_BUCKET_NAME", "B2_BUCKET")
    api = setting(args.api, "B2_API_ENDPOINT", default=DEFAULT_API).rstrip("/")
    missing = [n for n, v in [("key id", key_id), ("application key", app_key), ("bucket name", bucket_name)] if not v]
    if missing:
        fail(f"missing {', '.join(missing)}. Pass --key-id/--app-key/--bucket or set B2_KEY_ID/B2_APP_KEY/B2_BUCKET_NAME")

    auth = call(f"{api}/b2api/v2/b2_authorize_account", basic=f"{key_id}:{app_key}")
    api_url, token, account = auth["apiUrl"], auth["authorizationToken"], auth["accountId"]
    caps = auth.get("allowed", {}).get("capabilities", [])
    print(f"Authorized key {key_id[:8]}... on {api_url}")

    found = call(f"{api_url}/b2api/v2/b2_list_buckets", {"accountId": account, "bucketName": bucket_name}, token)
    if not found.get("buckets"):
        fail(f"bucket '{bucket_name}' not found on this account (or this key can't see it)")
    bucket = found["buckets"][0]
    print(f"Bucket {bucket['bucketName']} -> id {bucket['bucketId']}")

    if not args.check:
        if "writeBuckets" not in caps:
            fail(f"{NO_WRITE_BUCKETS}\n  (This key has: {', '.join(caps) or 'none'})")
        bucket = call(f"{api_url}/b2api/v2/b2_update_bucket", {
            "accountId": account, "bucketId": bucket["bucketId"],
            "corsRules": CORS_RULES, "lifecycleRules": LIFECYCLE_RULES,
        }, token)
        print("Updated CORS + lifecycle rules.")
    show(bucket)


if __name__ == "__main__":
    main()
