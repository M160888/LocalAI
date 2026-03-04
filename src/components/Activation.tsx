import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// Replace with your deployed Cloudflare Worker URL
const WORKER_URL = "https://local-ai-studio-license.YOURNAME.workers.dev";

interface Props {
  onActivated: () => void;
}

type View = "choose" | "trial" | "key" | "activating" | "error";

export default function Activation({ onActivated }: Props) {
  const [view, setView] = useState<View>("choose");
  const [licenseKey, setLicenseKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startTrial = async () => {
    setView("activating");
    setError(null);
    try {
      const deviceId = await invoke<string>("get_device_id");
      const resp = await fetch(`${WORKER_URL}/trial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId }),
      });
      const data = await resp.json() as { token?: string; error?: string };
      if (!resp.ok || !data.token) {
        throw new Error(data.error ?? "Trial activation failed");
      }
      await invoke("store_license_token", { token: data.token });
      onActivated();
    } catch (e) {
      setError(String(e));
      setView("error");
    }
  };

  const activateLicenseKey = async () => {
    const key = licenseKey.trim();
    if (!key) return;
    setView("activating");
    setError(null);
    try {
      const deviceId = await invoke<string>("get_device_id");
      const resp = await fetch(`${WORKER_URL}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: key, device_id: deviceId }),
      });
      const data = await resp.json() as { token?: string; error?: string };
      if (!resp.ok || !data.token) {
        throw new Error(data.error ?? "Activation failed. Check your key and try again.");
      }
      await invoke("store_license_token", { token: data.token });
      onActivated();
    } catch (e) {
      setError(String(e));
      setView("error");
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      padding: 32,
      background: "var(--bg)",
    }}>
      {/* Logo */}
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ marginBottom: 24 }}>
        <rect width="56" height="56" rx="14" fill="#6c63ff" />
        <circle cx="28" cy="28" r="10" fill="white" opacity="0.9" />
        <circle cx="28" cy="28" r="4" fill="#6c63ff" />
      </svg>

      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Local AI Studio</h1>
      <p style={{ color: "var(--text-dim)", fontSize: 14, marginBottom: 40, textAlign: "center" }}>
        Run AI models on your machine. No cloud. No API keys.
      </p>

      {/* Choose */}
      {view === "choose" && (
        <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            className="card"
            style={{ cursor: "pointer", borderColor: "var(--accent)", textAlign: "center", padding: 24 }}
            onClick={startTrial}
          >
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
              Try free for 7 days
            </div>
            <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
              Full access. No credit card needed.<br />Requires internet once to activate.
            </div>
          </div>

          <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>or</div>

          <div
            className="card"
            style={{ cursor: "pointer", textAlign: "center", padding: 24 }}
            onClick={() => setView("key")}
          >
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
              Enter licence key
            </div>
            <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
              Already purchased? Activate now and<br />go fully offline for your subscription period.
            </div>
          </div>

          <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>
            Subscriptions from €4.99/month at ampmatter.ie
          </p>
        </div>
      )}

      {/* License key entry */}
      {view === "key" && (
        <div style={{ width: "100%", maxWidth: 400 }}>
          <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 16, textAlign: "center" }}>
            Your licence key was emailed when you purchased.<br />
            Paste it below — you only need internet for this step.
          </p>
          <input
            type="text"
            placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && activateLicenseKey()}
            style={{
              width: "100%",
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              padding: "10px 14px",
              color: "var(--text)",
              fontSize: 14,
              fontFamily: "monospace",
              outline: "none",
              marginBottom: 12,
            }}
            autoFocus
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={() => setView("choose")}
            >
              ← Back
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 2 }}
              onClick={activateLicenseKey}
              disabled={!licenseKey.trim()}
            >
              Activate
            </button>
          </div>
        </div>
      )}

      {/* Activating spinner */}
      {view === "activating" && (
        <div style={{ textAlign: "center" }}>
          <div className="spinner" style={{ width: 32, height: 32, margin: "0 auto 16px" }} />
          <p style={{ color: "var(--text-dim)" }}>Activating…</p>
        </div>
      )}

      {/* Error */}
      {view === "error" && (
        <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
          <div className="card" style={{ borderColor: "var(--red)", marginBottom: 16 }}>
            <p style={{ color: "var(--red)", marginBottom: 8 }}>Activation failed</p>
            <p style={{ fontSize: 13, color: "var(--text-dim)" }}>{error}</p>
          </div>
          <button className="btn btn-secondary" onClick={() => setView("choose")}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
