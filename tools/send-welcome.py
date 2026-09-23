#!/usr/bin/env python3
"""
Send the Kilroy welcome email through Resend.

The API key is read from the RESEND_API_KEY environment variable — never pass it
on the command line (it would land in shell history) and never commit it.

    # bash:
    export RESEND_API_KEY=re_xxx
    # PowerShell:
    $env:RESEND_API_KEY = "re_xxx"

    python tools/send-welcome.py you@example.com
    python tools/send-welcome.py you@example.com --from "Kilroy <kilroy@relaylabs.site>"

Sends docs/email/welcome.html as-is, so edit that file to change the email.
"""
import argparse, json, os, sys, urllib.error, urllib.request
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("to", help="recipient email address")
ap.add_argument("--from", dest="sender", default="Kilroy <kilroy@relaylabs.site>",
                help="From header; the domain must be verified in Resend")
ap.add_argument("--subject", default="You're set up with Kilroy \U0001f44b")
args = ap.parse_args()

key = os.environ.get("RESEND_API_KEY")
if not key:
    sys.exit("Set RESEND_API_KEY in your environment first (do not put it on the command line).")

html = (Path(__file__).resolve().parent.parent / "docs" / "email" / "welcome.html").read_text(encoding="utf-8")

payload = json.dumps({
    "from": args.sender,
    "to": [args.to],
    "subject": args.subject,
    "html": html,
}).encode("utf-8")

req = urllib.request.Request(
    "https://api.resend.com/emails",
    data=payload,
    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req) as r:
        print("sent ✓", r.read().decode())
except urllib.error.HTTPError as e:
    sys.exit(f"Resend error {e.code}: {e.read().decode()}")
except urllib.error.URLError as e:
    sys.exit(f"Could not reach Resend: {e.reason}")
