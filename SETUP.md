# Local AI Studio — Setup Guide

## What you've built

A desktop app (Tauri + React + Rust) that bootstraps a fully local AI coding environment on any machine. It scans hardware, recommends models that will actually fit and run, installs Ollama + VSCodium + a chosen agent, downloads the selected models, and installs a VSCodium extension for in-editor chat.

**Everything runs offline after initial setup. No API keys, no monthly costs for the end user.**

---

## Repository

**GitHub:** https://github.com/M160888/LocalAI

---

## Project Structure

```
local-ai-studio/
├── src-tauri/              Rust backend
│   └── src/
│       ├── main.rs         Tauri commands
│       ├── system_info.rs  Hardware detection (CPU, RAM, GPU/VRAM)
│       ├── model_mgr.rs    Model catalogue + recommendation engine
│       ├── ollama_api.rs   Ollama REST client (streaming pull)
│       ├── installer.rs    Ollama, VSCodium, agent install logic
│       └── license.rs      JWT verification, OS keychain, tamper detection
├── src/                    React + TypeScript frontend
│   └── components/
│       ├── Activation.tsx  Trial / licence key screen
│       ├── SystemScan.tsx  Hardware readout
│       ├── ModelPicker.tsx Model selection (recommended + all compatible)
│       ├── AgentPicker.tsx Continue.dev / Aider / OpenHands
│       ├── Installer.tsx   Live install + download progress
│       └── Dashboard.tsx   Post-install status + model management
├── extension/              VSCodium extension (VSIX)
│   ├── src/
│   │   ├── extension.ts    Activation, commands, status bar
│   │   └── panel.ts        Webview panel host
│   └── webview/
│       ├── panel.html      Chat UI
│       └── panel.js        Streaming chat, model switcher, editor context
├── license-worker/         Cloudflare Worker — licence activation backend
│   ├── src/index.ts        /trial, /activate, /deactivate, /webhook endpoints
│   ├── generate-keys.js    One-shot RSA keypair generator
│   └── wrangler.toml       Worker config (fill in KV ID + variant IDs)
├── .github/workflows/
│   └── release.yml         Multi-platform build (Linux + macOS + Windows)
├── build-extension.sh      Build the VSIX
├── build-tauri.sh          Full app build
└── dev-setup.sh            Dev environment bootstrap
```

---

## Local Development

### Prerequisites

```bash
# Run the setup script — installs Rust, system deps, npm packages
./dev-setup.sh
```

Manual prerequisites if you prefer:
- **Rust** — https://rustup.rs
- **Node.js** 18+ — https://nodejs.org
- **Linux system deps** (Ubuntu/Debian):
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev \
    libsoup2.4-dev libssl-dev libgtk-3-dev librsvg2-dev
  ```

### Run in dev mode

```bash
npm install
npm run tauri dev
```

### Build for release (current platform only)

```bash
npm run tauri build
# Output: src-tauri/target/release/bundle/
```

### Build the VSCodium extension

```bash
./build-extension.sh
# Output: local-ai-studio-panel.vsix
```

---

## Multi-Platform Release (GitHub Actions)

The release workflow builds Linux, macOS (Intel + Apple Silicon), and Windows installers automatically.

### Trigger a release

```bash
git tag v0.1.0
git push origin v0.1.0
```

Actions run in parallel (~15 minutes). A draft release appears at:
**https://github.com/M160888/LocalAI/releases**

Review it, publish it, and those are your download links.

### What gets built

| Platform | Files |
|---|---|
| Linux | `.deb`, `.rpm`, `.AppImage` |
| macOS Intel | `.dmg` |
| macOS Apple Silicon | `.dmg` |
| Windows | `.msi`, `.exe` (NSIS) |

---

## Licensing System

### Architecture

```
User buys on Lemon Squeezy
  → LS generates licence key + emails it to user
  → User opens app, enters key (internet required once)
  → App sends key + device ID to Cloudflare Worker
  → Worker validates with LS API
  → Worker issues signed JWT for subscription period (30/60/90 days)
  → App stores JWT in OS keychain
  → App works fully offline for entire subscription period
  → JWT expires naturally — no forced phone-home
```

### Clock tamper protection

- JWT contains server-issued expiry timestamp (not client clock)
- App stores highest-ever-seen timestamp in OS keychain
- On every launch: if system time < stored max − 5 min → locked
- Rolling the clock back doesn't extend the JWT's validity

### Trial flow

- 7-day free trial, internet required once to activate
- One trial per device (tracked in Cloudflare KV)
- After trial: pay on Lemon Squeezy, get key by email, enter it once

### Subscription options

- 30 days — €4.99
- 60 days — (your pricing)
- 90 days — (your pricing)

---

## One-Time Licensing Setup

### Step 1 — Generate RSA keypair

```bash
cd license-worker
node generate-keys.js
```

This creates:
- `private.key.b64` — your signing key. **Never commit this.**
- `public.key.pem` — goes in the app

### Step 2 — Paste the public key into the app

Open `src-tauri/src/license.rs` and replace the `PUBLIC_KEY` constant:

```rust
const PUBLIC_KEY: &str = "-----BEGIN PUBLIC KEY-----
<paste contents of public.key.pem here>
-----END PUBLIC KEY-----";
```

### Step 3 — Deploy the Cloudflare Worker

```bash
cd license-worker
npm install
wrangler login
wrangler kv:namespace create LICENSES
# Copy the ID it prints and paste into wrangler.toml → id = "PASTE_HERE"
wrangler deploy
```

### Step 4 — Set Worker secrets

```bash
wrangler secret put JWT_PRIVATE_KEY
# paste contents of private.key.b64

wrangler secret put LS_API_KEY
# from Lemon Squeezy: Settings → API

wrangler secret put LS_WEBHOOK_SECRET
# from Lemon Squeezy: Settings → Webhooks → your webhook → signing secret
```

### Step 5 — Fill in Lemon Squeezy variant IDs

In `license-worker/wrangler.toml`, replace the variant ID placeholders:

```toml
LS_VARIANT_30 = "123456"   # your 30-day variant ID
LS_VARIANT_60 = "123457"   # your 60-day variant ID
LS_VARIANT_90 = "123458"   # your 90-day variant ID
```

Find these in LS dashboard → Products → your product → Variants.

### Step 6 — Update the Worker URL in the app

Open `src/components/Activation.tsx` and replace:

```typescript
const WORKER_URL = "https://local-ai-studio-license.YOURNAME.workers.dev";
```

### Step 7 — Configure Lemon Squeezy

1. **Enable License Keys** on your product (LS dashboard → Products → Edit → License Keys → enable)
2. Set activation limit to **1 per key** (one machine per purchase)
3. **Add webhook** pointing to `https://your-worker.workers.dev/webhook/lemonsqueezy`
   - Event: `subscription_cancelled`
   - Copy the signing secret → `wrangler secret put LS_WEBHOOK_SECRET`

### Step 8 — Rebuild and tag a new release

```bash
git add -A
git commit -m "Add public key and worker URL"
git tag v0.1.1
git push origin main --tags
```

---

## Cloudflare Worker API

| Endpoint | Body | Description |
|---|---|---|
| `POST /trial` | `{ device_id }` | Issues 7-day trial JWT. One per device. |
| `POST /activate` | `{ license_key, device_id }` | Validates LS key, issues paid JWT. |
| `POST /deactivate` | `{ license_key, device_id }` | Releases device binding (transfer to new machine). |
| `POST /webhook/lemonsqueezy` | LS event payload | Handles cancellations. |

---

## Selling the App

**Platform:** Lemon Squeezy (handles EU VAT, licence key delivery, webhooks)

**Pricing model:** Subscription or one-time purchase per period
- No free tier — 7-day trial built into the app itself
- No refund policy (digital goods, immediate access)
- Common sense: if someone emails with a genuine issue, refund and keep them active

**Go-to-market:**
1. Organic first — TikTok/Reels demo, Reddit (r/LocalLLaMA, r/ChatGPT), ProductHunt
2. Paid ads only after 50–100 paying users and real social proof
3. Landing page on ampmatter.ie — hero, demo video, €4.99 button, that's it

---

## Notes

- **private.key.b64** — never commit, never share. Losing it means you can't issue new tokens. Store it somewhere safe (1Password, etc.)
- **AppImage builds** require a display (FUSE). CI handles this fine; local headless builds skip it.
- The app currently uses placeholder purple square icons. Replace before public launch.
- macOS builds will show a security warning without an Apple Developer ID certificate.
- Windows builds will show a SmartScreen warning without an EV code signing certificate.
