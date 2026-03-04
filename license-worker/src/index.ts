export interface Env {
  LICENSES: KVNamespace;
  LS_API_KEY: string;
  LS_WEBHOOK_SECRET: string;
  JWT_PRIVATE_KEY: string; // base64-encoded PEM
  LS_VARIANT_30: string;
  LS_VARIANT_60: string;
  LS_VARIANT_90: string;
}

// ─── JWT ─────────────────────────────────────────────────────────────────────

interface JWTPayload {
  sub: string;       // device_id
  type: "trial" | "paid";
  exp: number;       // unix seconds
  iat: number;
  license?: string;  // license key (paid only)
  days: number;      // total days for this token
}

function b64url(data: ArrayBuffer | string): string {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : new Uint8Array(data);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // pem is base64-encoded PKCS8 DER
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function signJWT(payload: JWTPayload, privateKeyB64: string): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const head = b64url(JSON.stringify(header));
  const body = b64url(JSON.stringify(payload));
  const message = `${head}.${body}`;

  const key = await importPrivateKey(privateKeyB64);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(message)
  );

  return `${message}.${b64url(sig)}`;
}

function issueToken(
  deviceId: string,
  type: "trial" | "paid",
  days: number,
  licenseKey: string | undefined,
  privateKeyB64: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    sub: deviceId,
    type,
    iat: now,
    exp: now + days * 86400,
    days,
    ...(licenseKey ? { license: licenseKey } : {}),
  };
  return signJWT(payload, privateKeyB64);
}

// ─── Lemon Squeezy ───────────────────────────────────────────────────────────

interface LSActivateResponse {
  activated: boolean;
  error?: string;
  license_key: {
    id: number;
    status: string;
    key: string;
    activation_limit: number;
    activation_usage: number;
    created_at: string;
    expires_at: string | null;
  };
  instance?: {
    id: string;
    name: string;
    created_at: string;
  };
  meta: {
    store_id: number;
    order_id: number;
    order_item_id: number;
    variant_id: number;
    variant_name: string;
    product_id: number;
    product_name: string;
    customer_id: number;
    customer_email: string;
    customer_name: string;
  };
}

async function activateLSLicense(
  licenseKey: string,
  deviceId: string,
  apiKey: string
): Promise<LSActivateResponse> {
  const resp = await fetch("https://api.lemonsqueezy.com/v1/licenses/activate", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      license_key: licenseKey,
      instance_name: deviceId,
    }),
  });
  return resp.json() as Promise<LSActivateResponse>;
}

async function deactivateLSLicense(
  licenseKey: string,
  instanceId: string
): Promise<void> {
  await fetch("https://api.lemonsqueezy.com/v1/licenses/deactivate", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      license_key: licenseKey,
      instance_id: instanceId,
    }),
  });
}

function variantToDays(
  variantId: number,
  env: Env
): number {
  const id = String(variantId);
  if (id === env.LS_VARIANT_30) return 30;
  if (id === env.LS_VARIANT_60) return 60;
  if (id === env.LS_VARIANT_90) return 90;
  return 30; // default
}

// ─── Webhook signature verification ──────────────────────────────────────────

async function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = hexToBytes(signature);
  return crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(body)
  );
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

// ─── Request handlers ─────────────────────────────────────────────────────────

// POST /trial
// Body: { device_id: string }
// Issues a 7-day trial JWT. One per device, ever.
async function handleTrial(req: Request, env: Env): Promise<Response> {
  const { device_id } = (await req.json()) as { device_id: string };

  if (!device_id || device_id.length < 8) {
    return err("Invalid device_id");
  }

  const trialKey = `trial:${device_id}`;
  const existing = await env.LICENSES.get(trialKey);
  if (existing) {
    return err("Trial already used for this device", 403);
  }

  const token = await issueToken(device_id, "trial", 7, undefined, env.JWT_PRIVATE_KEY);

  // Store trial record — never expires (so trial can't be reused)
  await env.LICENSES.put(trialKey, JSON.stringify({
    issued_at: Date.now(),
    expires_at: Date.now() + 7 * 86400 * 1000,
  }));

  return json({ token, days: 7, type: "trial" });
}

// POST /activate
// Body: { license_key: string, device_id: string }
// Validates with LS, issues paid JWT for subscription period.
async function handleActivate(req: Request, env: Env): Promise<Response> {
  const { license_key, device_id } = (await req.json()) as {
    license_key: string;
    device_id: string;
  };

  if (!license_key || !device_id) {
    return err("license_key and device_id required");
  }

  // Check if this device already has an active paid license
  const deviceKey = `device:${device_id}`;
  const existing = await env.LICENSES.get(deviceKey);
  if (existing) {
    const data = JSON.parse(existing) as { license_key: string; expires_at: number };
    // If same key, just re-issue the token (re-activation / app reinstall)
    if (data.license_key === license_key && data.expires_at > Date.now()) {
      const daysLeft = Math.ceil((data.expires_at - Date.now()) / 86400000);
      const token = await issueToken(device_id, "paid", daysLeft, license_key, env.JWT_PRIVATE_KEY);
      return json({ token, days: daysLeft, type: "paid" });
    }
  }

  // Activate with Lemon Squeezy
  const lsResp = await activateLSLicense(license_key, device_id, env.LS_API_KEY);

  if (!lsResp.activated) {
    return err(lsResp.error ?? "License activation failed", 403);
  }

  const days = variantToDays(lsResp.meta.variant_id, env);
  const expiresAt = Date.now() + days * 86400 * 1000;

  // Store device binding
  await env.LICENSES.put(deviceKey, JSON.stringify({
    license_key,
    instance_id: lsResp.instance?.id,
    variant_id: lsResp.meta.variant_id,
    days,
    expires_at: expiresAt,
    customer_email: lsResp.meta.customer_email,
  }), { expirationTtl: days * 86400 + 86400 }); // auto-expire from KV after paid period + 1 day

  const token = await issueToken(device_id, "paid", days, license_key, env.JWT_PRIVATE_KEY);

  return json({ token, days, type: "paid" });
}

// POST /deactivate
// Body: { license_key: string, device_id: string }
// For user-initiated "transfer to new machine" — deactivates current device
async function handleDeactivate(req: Request, env: Env): Promise<Response> {
  const { license_key, device_id } = (await req.json()) as {
    license_key: string;
    device_id: string;
  };

  const deviceKey = `device:${device_id}`;
  const existing = await env.LICENSES.get(deviceKey);
  if (!existing) {
    return err("No active license found for this device", 404);
  }

  const data = JSON.parse(existing) as { instance_id?: string };

  if (data.instance_id) {
    await deactivateLSLicense(license_key, data.instance_id);
  }

  await env.LICENSES.delete(deviceKey);

  return json({ ok: true });
}

// POST /webhook/lemonsqueezy
// Handles subscription_cancelled — revokes device license
async function handleWebhook(req: Request, env: Env): Promise<Response> {
  const body = await req.text();
  const signature = req.headers.get("X-Signature") ?? "";

  const valid = await verifyWebhookSignature(body, signature, env.LS_WEBHOOK_SECRET);
  if (!valid) {
    return err("Invalid signature", 401);
  }

  const event = JSON.parse(body) as {
    meta: { event_name: string };
    data: {
      attributes: {
        first_order_item?: { variant_id: number };
        user_email?: string;
      };
    };
  };

  // On cancellation, we don't immediately revoke — the token they have is
  // valid until its expiry. LS stops charging them; the token expires naturally.
  // If you want immediate revocation, maintain a revocation list in KV here.

  if (event.meta.event_name === "subscription_cancelled") {
    // Log it — token expires on its own schedule
    console.log("Subscription cancelled:", event.data.attributes.user_email);
  }

  return json({ ok: true });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const url = new URL(req.url);

    if (req.method !== "POST") return err("Method not allowed", 405);

    try {
      switch (url.pathname) {
        case "/trial":      return handleTrial(req, env);
        case "/activate":   return handleActivate(req, env);
        case "/deactivate": return handleDeactivate(req, env);
        case "/webhook/lemonsqueezy": return handleWebhook(req, env);
        default: return err("Not found", 404);
      }
    } catch (e) {
      console.error(e);
      return err("Internal error", 500);
    }
  },
};
