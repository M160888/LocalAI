import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { InstallStep, ModelDef, PullProgressEvent, SystemInfo } from "../types";

interface Props {
  systemInfo: SystemInfo;
  models: ModelDef[];
  agents: string[];
  onBack: () => void;
  onDone: () => void;
}

interface ModelPull {
  model: ModelDef;
  status: "pending" | "pulling" | "done" | "error";
  percent: number;
  statusText: string;
}

export default function Installer({
  models,
  agents,
  onBack,
  onDone,
}: Props) {
  const [installSteps, setInstallSteps] = useState<InstallStep[]>([]);
  const [pulls, setPulls] = useState<ModelPull[]>(
    models.map((m) => ({
      model: m,
      status: "pending",
      percent: 0,
      statusText: "Waiting…",
    }))
  );
  const [phase, setPhase] = useState<"idle" | "installing" | "pulling" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Find first selected model to use as Continue.dev model
  const continueModel = models[0]?.ollama_tag ?? null;

  const statusIcon = (status: InstallStep["status"]) => {
    switch (status) {
      case "Done": return <span style={{ color: "var(--green)" }}>✓</span>;
      case "Failed": return <span style={{ color: "var(--red)" }}>✗</span>;
      case "Running": return <div className="spinner" style={{ width: 14, height: 14 }} />;
      default: return <span style={{ color: "var(--text-dim)" }}>○</span>;
    }
  };

  const startInstall = async () => {
    setPhase("installing");
    setErrorMsg(null);
    setInstallSteps([]);

    // Listen for install step events
    const unlisten = await listen<InstallStep>("install-step", (event) => {
      setInstallSteps((prev) => {
        const existing = prev.findIndex((s) => s.name === event.payload.name);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = event.payload;
          return updated;
        }
        return [...prev, event.payload];
      });
    });
    unlistenRef.current = unlisten;

    try {
      await invoke("run_installation", {
        req: {
          agents,
          models: models.map((m) => m.ollama_tag),
          continue_model: continueModel,
          vsix_path: null, // VSIX bundling handled separately
        },
      });

      unlisten();
      setPhase("pulling");
      await pullModels();
    } catch (e) {
      unlisten();
      setErrorMsg(String(e));
      setPhase("error");
    }
  };

  const pullModels = async () => {
    for (let i = 0; i < models.length; i++) {
      const model = models[i];

      setPulls((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: "pulling", statusText: "Starting…" } : p
        )
      );

      // Listen for pull progress events
      const unlisten = await listen<PullProgressEvent>("pull-progress", (event) => {
        if (event.payload.tag !== model.ollama_tag) return;
        setPulls((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? {
                  ...p,
                  percent: event.payload.percent ?? p.percent,
                  statusText: event.payload.status,
                }
              : p
          )
        );
      });

      try {
        await invoke("pull_model", { tag: model.ollama_tag });
        setPulls((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: "done", percent: 100, statusText: "Complete" } : p
          )
        );
      } catch (e) {
        setPulls((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: "error", statusText: String(e) } : p
          )
        );
      } finally {
        unlisten();
      }
    }

    setPhase("done");
  };

  useEffect(() => {
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  const anyPullError = pulls.some((p) => p.status === "error");

  return (
    <>
      <main className="content">
        <h2>Installing</h2>
        <p className="subtitle">
          Sit back — this will take a few minutes depending on your connection.
        </p>

        {phase === "idle" && (
          <div className="card">
            <p style={{ marginBottom: 12, color: "var(--text-dim)" }}>
              Ready to install:
            </p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              <li>
                <strong>Ollama</strong> + <strong>VSCodium</strong>
              </li>
              {agents.map((a) => (
                <li key={a}>
                  Agent: <strong>{a}</strong>
                </li>
              ))}
              {models.map((m) => (
                <li key={m.id}>
                  Model: <strong>{m.name}</strong> ({m.size_gb.toFixed(1)} GB)
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Install steps */}
        {installSteps.length > 0 && (
          <div className="card">
            <div className="card-title">Installation</div>
            {installSteps.map((step) => (
              <div key={step.name} className="install-step">
                <div className="step-icon">{statusIcon(step.status)}</div>
                <div>
                  <div className="step-name">{step.name}</div>
                  {step.message && (
                    <div
                      className="step-msg"
                      style={{
                        color:
                          step.status === "Failed" ? "var(--red)" : "var(--text-dim)",
                      }}
                    >
                      {step.message}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Model pulls */}
        {(phase === "pulling" || phase === "done") && pulls.length > 0 && (
          <div className="card">
            <div className="card-title">Downloading Models</div>
            {pulls.map((p) => (
              <div
                key={p.model.id}
                style={{ marginBottom: 16 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{p.model.name}</span>
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    {p.status === "done" ? (
                      <span style={{ color: "var(--green)" }}>✓ Done</span>
                    ) : p.status === "error" ? (
                      <span style={{ color: "var(--red)" }}>✗ Failed</span>
                    ) : (
                      p.statusText
                    )}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${p.percent}%`,
                      background:
                        p.status === "error"
                          ? "var(--red)"
                          : p.status === "done"
                          ? "var(--green)"
                          : "var(--accent)",
                    }}
                  />
                </div>
                {p.status === "pulling" && p.percent > 0 && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-dim)",
                      marginTop: 3,
                    }}
                  >
                    {p.percent.toFixed(1)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {phase === "error" && errorMsg && (
          <div className="card" style={{ borderColor: "var(--red)" }}>
            <p style={{ color: "var(--red)", marginBottom: 8 }}>
              Installation failed
            </p>
            <pre
              style={{
                fontSize: 11,
                color: "var(--text-dim)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {errorMsg}
            </pre>
          </div>
        )}

        {phase === "done" && (
          <div
            className="card"
            style={{ borderColor: "var(--green)", textAlign: "center" }}
          >
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
              {anyPullError ? "Finished with some errors" : "All done!"}
            </p>
            <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
              {anyPullError
                ? "Some models failed to download. You can retry from the dashboard."
                : "Your local AI environment is ready."}
            </p>
          </div>
        )}
      </main>

      <footer className="footer">
        <button
          className="btn btn-secondary"
          onClick={onBack}
          disabled={phase === "installing" || phase === "pulling"}
        >
          ← Back
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {phase === "idle" && (
            <button className="btn btn-primary" onClick={startInstall}>
              Start Installation
            </button>
          )}
          {phase === "error" && (
            <button className="btn btn-primary" onClick={startInstall}>
              Retry
            </button>
          )}
          {phase === "done" && (
            <button className="btn btn-primary" onClick={onDone}>
              Go to Dashboard →
            </button>
          )}
          {(phase === "installing" || phase === "pulling") && (
            <button className="btn btn-primary" disabled>
              <div
                className="spinner"
                style={{ width: 14, height: 14, borderTopColor: "white" }}
              />
              Working…
            </button>
          )}
        </div>
      </footer>
    </>
  );
}
