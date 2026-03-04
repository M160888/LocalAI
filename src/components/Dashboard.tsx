import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModelDef, OllamaModel } from "../types";

interface Props {
  installedModels: ModelDef[];
  onAddModels: () => void;
}

export default function Dashboard({ installedModels, onAddModels }: Props) {
  const [ollamaRunning, setOllamaRunning] = useState<boolean | null>(null);
  const [liveModels, setLiveModels] = useState<OllamaModel[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [deletingTag, setDeletingTag] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    const running = await invoke<boolean>("ollama_running");
    setOllamaRunning(running);
    if (running) {
      setLoadingModels(true);
      try {
        const models = await invoke<OllamaModel[]>("list_installed_models");
        setLiveModels(models);
      } catch {
        setLiveModels([]);
      } finally {
        setLoadingModels(false);
      }
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10_000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const launchVSCodium = () => {
    invoke("launch_vscodium").catch(console.error);
  };

  const deleteModel = async (tag: string) => {
    setDeletingTag(tag);
    try {
      await invoke("delete_model", { tag });
      await checkStatus();
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setDeletingTag(null);
    }
  };

  const formatSize = (bytes: number) => {
    const gb = bytes / 1024 / 1024 / 1024;
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString();
    } catch {
      return iso;
    }
  };

  const displayModels = liveModels ?? installedModels.map((m) => ({
    name: m.ollama_tag,
    size: m.size_gb * 1024 * 1024 * 1024,
    modified_at: "",
  }));

  return (
    <>
      <main className="content">
        <h2>Dashboard</h2>
        <p className="subtitle">Local AI Studio is up and running.</p>

        {/* Status */}
        <div className="card">
          <div className="card-title">Services</div>
          <div className="spec-row">
            <span className="spec-label">Ollama daemon</span>
            <span
              className={`chip ${
                ollamaRunning === null
                  ? ""
                  : ollamaRunning
                  ? "green"
                  : "red"
              }`}
            >
              <span
                className={`status-dot ${
                  ollamaRunning === null
                    ? "yellow pulse"
                    : ollamaRunning
                    ? "green"
                    : "red"
                }`}
              />
              {ollamaRunning === null
                ? "Checking…"
                : ollamaRunning
                ? "Running"
                : "Not running"}
            </span>
          </div>
          {!ollamaRunning && ollamaRunning !== null && (
            <button
              className="btn btn-secondary"
              style={{ marginTop: 10, fontSize: 12 }}
              onClick={checkStatus}
            >
              Retry
            </button>
          )}
        </div>

        {/* Models */}
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div className="card-title" style={{ marginBottom: 0 }}>
              Installed Models
            </div>
            <button
              className="btn btn-secondary"
              style={{ padding: "5px 12px", fontSize: 12 }}
              onClick={onAddModels}
            >
              + Add Models
            </button>
          </div>

          {loadingModels && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="spinner" />
              <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
                Loading from Ollama…
              </span>
            </div>
          )}

          {!loadingModels && displayModels.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
              No models installed yet. Click "Add Models" to pull one.
            </p>
          )}

          {!loadingModels &&
            displayModels.map((m) => (
              <div
                key={m.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontWeight: 500,
                      fontSize: 14,
                    }}
                  >
                    {m.name}
                  </div>
                  <div
                    style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}
                  >
                    {formatSize(m.size)}
                    {m.modified_at && ` · Added ${formatDate(m.modified_at)}`}
                  </div>
                </div>
                <button
                  className="btn btn-danger"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  onClick={() => deleteModel(m.name)}
                  disabled={deletingTag === m.name}
                >
                  {deletingTag === m.name ? (
                    <div className="spinner" style={{ width: 12, height: 12 }} />
                  ) : (
                    "Remove"
                  )}
                </button>
              </div>
            ))}
        </div>

        {/* Quick start */}
        <div className="card">
          <div className="card-title">Quick Start</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              className="btn btn-primary"
              style={{ alignSelf: "flex-start" }}
              onClick={launchVSCodium}
            >
              Launch VSCodium
            </button>

            <div className="divider" style={{ margin: "4px 0" }} />

            <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
              <strong style={{ color: "var(--text)" }}>Aider (CLI):</strong> Open a
              terminal in your project folder and run{" "}
              <code
                style={{
                  fontFamily: "monospace",
                  background: "var(--surface2)",
                  padding: "1px 6px",
                  borderRadius: 3,
                }}
              >
                aider
              </code>
            </p>

            <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
              <strong style={{ color: "var(--text)" }}>Ollama CLI:</strong>{" "}
              <code
                style={{
                  fontFamily: "monospace",
                  background: "var(--surface2)",
                  padding: "1px 6px",
                  borderRadius: 3,
                }}
              >
                ollama run {displayModels[0]?.name ?? "phi3:mini"}
              </code>
            </p>

            <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
              <strong style={{ color: "var(--text)" }}>Ollama API:</strong>{" "}
              <code
                style={{
                  fontFamily: "monospace",
                  background: "var(--surface2)",
                  padding: "1px 6px",
                  borderRadius: 3,
                }}
              >
                http://localhost:11434
              </code>
            </p>
          </div>
        </div>
      </main>

      <footer className="footer">
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
          All models run locally. Zero API costs. Zero telemetry.
        </span>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 12 }}
          onClick={checkStatus}
        >
          Refresh Status
        </button>
      </footer>
    </>
  );
}
