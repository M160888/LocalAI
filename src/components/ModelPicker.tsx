import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModelDef, ModelRecommendations, SystemInfo } from "../types";

interface Props {
  systemInfo: SystemInfo;
  selected: ModelDef[];
  onSelect: (models: ModelDef[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function ModelPicker({
  systemInfo,
  selected,
  onSelect,
  onBack,
  onNext,
}: Props) {
  const [recs, setRecs] = useState<ModelRecommendations | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    invoke<ModelRecommendations>("get_model_recommendations", {
      info: systemInfo,
    }).then(setRecs);
  }, [systemInfo]);

  const toggle = (model: ModelDef) => {
    if (selected.find((m) => m.id === model.id)) {
      onSelect(selected.filter((m) => m.id !== model.id));
    } else {
      onSelect([...selected, model]);
    }
  };

  const isSelected = (id: string) => selected.some((m) => m.id === id);

  const formatSize = (gb: number) => `${gb.toFixed(1)} GB`;

  const tierLabel = (t: number) => {
    const labels: Record<number, string> = {
      1: "Tiny",
      2: "Small",
      3: "Medium",
      4: "Large",
      5: "XL",
    };
    return labels[t] ?? "";
  };

  const displayModels = showAll
    ? recs?.available ?? []
    : recs?.recommended ?? [];

  return (
    <>
      <main className="content">
        <h2>Pick Models</h2>
        <p className="subtitle">
          Models recommended for your hardware. Select one or more to install.
        </p>

        {recs && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span className="chip">
                <span
                  className="status-dot"
                  style={{
                    background: recs.has_gpu ? "var(--green)" : "var(--yellow)",
                  }}
                />
                {recs.has_gpu ? "GPU acceleration available" : "CPU-only mode"}
              </span>
              <span className="chip">
                {recs.available_ram_gb} GB RAM for models
              </span>
              {recs.gpu_vram_gb && (
                <span className="chip green">{recs.gpu_vram_gb} GB VRAM</span>
              )}
            </div>
          </div>
        )}

        {!recs && (
          <div
            className="card"
            style={{ display: "flex", alignItems: "center", gap: 12 }}
          >
            <div className="spinner" />
            <span>Calculating recommendations…</span>
          </div>
        )}

        {recs && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
                {showAll
                  ? `All ${recs.available.length} compatible models`
                  : `${recs.recommended.length} recommended`}
              </span>
              <button
                className="btn btn-secondary"
                style={{ padding: "5px 12px", fontSize: 12 }}
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? "Show recommended" : "Show all compatible"}
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {displayModels.map((model) => {
                const rec = recs.recommended.find((r) => r.id === model.id);
                return (
                  <div
                    key={model.id}
                    className={`model-card ${isSelected(model.id) ? "selected" : ""} ${rec ? "recommended" : ""}`}
                    onClick={() => toggle(model)}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        marginBottom: 8,
                      }}
                    >
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={isSelected(model.id)}
                        onChange={() => toggle(model)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div>
                        <div className="model-name">{model.name}</div>
                        <div className="model-tag">{model.ollama_tag}</div>
                      </div>
                    </div>
                    <div className="model-meta">
                      <span className="tag">{formatSize(model.size_gb)}</span>
                      <span className="tag">{model.ram_required_gb}GB RAM</span>
                      <span className="tag">{model.quant}</span>
                      <span className="tag">{tierLabel(model.tier)}</span>
                    </div>
                    <p className="model-use-case">{model.use_case}</p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      <footer className="footer">
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {selected.length > 0 && (
            <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
              {selected.length} model{selected.length !== 1 ? "s" : ""} selected
              {" · "}
              {selected.reduce((acc, m) => acc + m.size_gb, 0).toFixed(1)} GB
            </span>
          )}
          <button
            className="btn btn-primary"
            onClick={onNext}
            disabled={selected.length === 0}
          >
            Choose Agents →
          </button>
        </div>
      </footer>
    </>
  );
}
