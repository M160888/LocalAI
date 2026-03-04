use anyhow::{anyhow, Result};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

// ─── Public key ───────────────────────────────────────────────────────────────
// Replace this with the contents of public.key.pem after running generate-keys.js
const PUBLIC_KEY: &str = "-----BEGIN PUBLIC KEY-----
REPLACE_WITH_YOUR_PUBLIC_KEY
-----END PUBLIC KEY-----";

const SERVICE: &str = "local-ai-studio";
const KEY_TOKEN: &str = "license_token";
const KEY_MAX_TS: &str = "max_timestamp";
const KEY_DEVICE_ID: &str = "device_id";

// Clock rollback grace period: 5 minutes
const CLOCK_GRACE_SECS: u64 = 300;

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,            // device_id
    pub r#type: String,         // "trial" | "paid"
    pub exp: u64,               // unix seconds
    pub iat: u64,
    pub days: u32,
    pub license: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum LicenseKind {
    Trial,
    Paid,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LicenseInfo {
    pub kind: LicenseKind,
    pub days_remaining: u32,
    pub expires_at: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "status")]
pub enum LicenseStatus {
    Valid(LicenseInfo),
    Expired { kind: String },
    Tampered,
    None,
}

// ─── Device ID ────────────────────────────────────────────────────────────────

pub fn get_or_create_device_id() -> String {
    let entry = match Entry::new(SERVICE, KEY_DEVICE_ID) {
        Ok(e) => e,
        Err(_) => return uuid::Uuid::new_v4().to_string(),
    };

    match entry.get_password() {
        Ok(id) if !id.is_empty() => id,
        _ => {
            let id = uuid::Uuid::new_v4().to_string();
            let _ = entry.set_password(&id);
            id
        }
    }
}

// ─── Secure storage ───────────────────────────────────────────────────────────

pub fn store_token(token: &str) -> Result<()> {
    Entry::new(SERVICE, KEY_TOKEN)
        .map_err(|e| anyhow!(e))?
        .set_password(token)
        .map_err(|e| anyhow!(e))
}

fn load_token() -> Option<String> {
    Entry::new(SERVICE, KEY_TOKEN)
        .ok()?
        .get_password()
        .ok()
        .filter(|s| !s.is_empty())
}

fn load_max_ts() -> u64 {
    Entry::new(SERVICE, KEY_MAX_TS)
        .ok()
        .and_then(|e| e.get_password().ok())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

fn store_max_ts(ts: u64) {
    if let Ok(e) = Entry::new(SERVICE, KEY_MAX_TS) {
        let _ = e.set_password(&ts.to_string());
    }
}

pub fn clear_license() -> Result<()> {
    if let Ok(e) = Entry::new(SERVICE, KEY_TOKEN) {
        let _ = e.delete_password();
    }
    if let Ok(e) = Entry::new(SERVICE, KEY_MAX_TS) {
        let _ = e.delete_password();
    }
    Ok(())
}

// ─── License check ────────────────────────────────────────────────────────────

pub fn check() -> LicenseStatus {
    let token = match load_token() {
        Some(t) => t,
        None => return LicenseStatus::None,
    };

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Clock tamper detection
    let max_ts = load_max_ts();
    if now + CLOCK_GRACE_SECS < max_ts {
        return LicenseStatus::Tampered;
    }
    // Update the high-water mark
    if now > max_ts {
        store_max_ts(now);
    }

    // Verify JWT signature + expiry
    let key = match DecodingKey::from_rsa_pem(PUBLIC_KEY.as_bytes()) {
        Ok(k) => k,
        Err(_) => return LicenseStatus::Tampered,
    };

    let mut validation = Validation::new(Algorithm::RS256);
    validation.validate_exp = true;

    match decode::<Claims>(&token, &key, &validation) {
        Ok(data) => {
            let claims = data.claims;
            let days_remaining = if claims.exp > now {
                ((claims.exp - now) / 86400) as u32
            } else {
                0
            };
            let kind = if claims.r#type == "paid" {
                LicenseKind::Paid
            } else {
                LicenseKind::Trial
            };
            LicenseStatus::Valid(LicenseInfo {
                kind,
                days_remaining,
                expires_at: claims.exp,
            })
        }
        Err(e) => {
            use jsonwebtoken::errors::ErrorKind;
            match e.kind() {
                ErrorKind::ExpiredSignature => LicenseStatus::Expired {
                    kind: "unknown".to_string(),
                },
                _ => LicenseStatus::Tampered,
            }
        }
    }
}
