import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SystemInfo } from "../types";

interface Props {
  onNext: (info: SystemInfo) => void;
}

export default function SystemScan({ onNext }: Props) {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<SystemInfo>("get_system_info")
      .then((data) => {
        setInfo(data);
        setScanning(false);
      })
      .catch((e) => {
        setError(String(e));
        setScanning(false);
      });
  }, []);

  const rescan = () => {
    setScanning(true);
    setError(null);
    invoke<SystemInfo>("get_system_info")
      .then((data) => {
        setInfo(data);
        setScanning(false);
      })
      .catch((e) => {
        setError(String(e));
        setScanning(false);
      });
  };

  const formatRam = (mb: number) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb} MB`;
  };

  const gpuLabel = (kind: string) => {
    const labels: Record<string, string> = {
      Nvidia: "NVIDIA (CUDA)",
      Amd: "AMD (ROCm)",
      AppleMps: "Apple Silicon (MPS)",
      Intel: "Intel Integrated",
      None: "None detected",
    };
    return labels[kind] ?? kind;
  };

  const ramPercent = info
    ? Math.round(
        ((info.total_ram_mb - info.available_ram_mb) / info.total_ram_mb) * 100
      )
    : 0;

  return (
    <>
      <main className="content">
        <h2>System Scan</h2>
        <p className="subtitle">
          Checking your hardware to recommend models that will actually run well.
        </p>

        {scanning && (
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="spinner" />
            <span>Scanning hardware…</span>
          </div>
        )}

        {error && (
          <div className="card" style={{ borderColor: "var(--red)" }}>
            <p style={{ color: "var(--red)" }}>Scan failed: {error}</p>
            <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={rescan}>
              Retry
            </button>
          </div>
        )}

        {info && !scanning && (
          <>
            <div className="card">
              <div className="card-title">System</div>
              <div className="spec-row">
                <span className="spec-label">Operating system</span>
                <span className="spec-value">
                  {info.os} {info.os_version}
                </span>
              </div>
              <div className="spec-row">
                <span className="spec-label">Architecture</span>
                <span className="spec-value">{info.arch}</span>
              </div>
            </div>

            <div className="card">
              <div className="card-title">CPU</div>
              <div className="spec-row">
                <span className="spec-label">Model</span>
                <span className="spec-value">{info.cpu_model}</span>
              </div>
              <div className="spec-row">
                <span className="spec-label">Cores</span>
                <span className="spec-value">{info.cpu_cores}</span>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Memory</div>
              <div className="spec-row">
                <span className="spec-label">Total RAM</span>
                <span className="spec-value">{formatRam(info.total_ram_mb)}</span>
              </div>
              <div className="spec-row">
                <span className="spec-label">Available</span>
                <span className="spec-value">{formatRam(info.available_ram_mb)}</span>
              </div>
              <div className="ram-bar-wrap">
                <div className="ram-label">
                  <span>Used</span>
                  <span>{ramPercent}%</span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${ramPercent}%`,
                      background:
                        ramPercent > 80
                          ? "var(--red)"
                          : ramPercent > 60
                          ? "var(--yellow)"
                          : "var(--accent)",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-title">GPU</div>
              <div className="spec-row">
                <span className="spec-label">Type</span>
                <span className="spec-value">{gpuLabel(info.gpu.kind)}</span>
              </div>
              {info.gpu.name && info.gpu.kind !== "None" && (
                <div className="spec-row">
                  <span className="spec-label">Name</span>
                  <span className="spec-value">{info.gpu.name}</span>
                </div>
              )}
              {info.gpu.vram_mb !== null && (
                <div className="spec-row">
                  <span className="spec-label">VRAM</span>
                  <span className="spec-value">{formatRam(info.gpu.vram_mb)}</span>
                </div>
              )}
              {info.gpu.kind === "AppleMps" && (
                <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>
                  Unified memory — GPU shares system RAM. All RAM available for model inference.
                </p>
              )}
              {info.gpu.kind === "None" && (
                <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>
                  No GPU detected. Models will run on CPU — this is fine for smaller models.
                </p>
              )}
            </div>

            <div className="card">
              <div className="card-title">Storage</div>
              <div className="spec-row">
                <span className="spec-label">Free disk space</span>
                <span className="spec-value">{info.free_disk_gb} GB</span>
              </div>
              {info.free_disk_gb < 10 && (
                <p style={{ fontSize: 12, color: "var(--yellow)", marginTop: 8 }}>
                  ⚠ Low disk space. Models range from 0.4 GB to 39 GB.
                </p>
              )}
            </div>
          </>
        )}
      </main>

      <footer className="footer">
        <button className="btn btn-secondary" onClick={rescan} disabled={scanning}>
          Rescan
        </button>
        <button
          className="btn btn-primary"
          onClick={() => info && onNext(info)}
          disabled={!info || scanning}
        >
          Pick Models →
        </button>
      </footer>
    </>
  );
}
