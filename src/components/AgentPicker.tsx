interface AgentDef {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  requires: string;
  link: string;
}

const AGENTS: AgentDef[] = [
  {
    id: "continue",
    name: "Continue.dev",
    subtitle: "VS Code extension · AI coding assistant",
    description:
      "The best VSCodium integration. Tab autocomplete, inline edits, and a chat panel. Auto-configured for local Ollama — zero setup after install.",
    requires: "VSCodium",
    link: "https://continue.dev",
  },
  {
    id: "aider",
    name: "Aider",
    subtitle: "CLI pair programmer",
    description:
      "Terminal-based AI coding assistant. Works directly on your files. Excellent with local models. Run `aider` in any project directory.",
    requires: "Python / pip",
    link: "https://aider.chat",
  },
  {
    id: "openhands",
    name: "OpenHands",
    subtitle: "Autonomous agent · Docker-based",
    description:
      "Full agentic system that can browse the web, run code, write and execute tests. Heavier (needs Docker) but far more autonomous than a coding assistant.",
    requires: "Docker",
    link: "https://all-hands.dev",
  },
];

interface Props {
  selected: string[];
  onSelect: (agents: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function AgentPicker({ selected, onSelect, onBack, onNext }: Props) {
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onSelect(selected.filter((a) => a !== id));
    } else {
      onSelect([...selected, id]);
    }
  };

  return (
    <>
      <main className="content">
        <h2>Pick Agents</h2>
        <p className="subtitle">
          Choose how you want to interact with local models. You can install all three.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {AGENTS.map((agent) => (
            <div
              key={agent.id}
              className={`agent-card ${selected.includes(agent.id) ? "selected" : ""}`}
              onClick={() => toggle(agent.id)}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <input
                  type="checkbox"
                  className="checkbox"
                  style={{ marginTop: 3 }}
                  checked={selected.includes(agent.id)}
                  onChange={() => toggle(agent.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div style={{ flex: 1 }}>
                  <div className="agent-title">{agent.name}</div>
                  <div className="agent-subtitle">{agent.subtitle}</div>
                  <p className="agent-desc">{agent.description}</p>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 10,
                      alignItems: "center",
                    }}
                  >
                    <span className="tag">Requires: {agent.requires}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          className="card"
          style={{ marginTop: 16, borderColor: "var(--border)" }}
        >
          <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
            <strong style={{ color: "var(--text)" }}>Recommendation:</strong>{" "}
            Start with <strong style={{ color: "var(--accent)" }}>Continue.dev</strong> if
            you use VSCodium for coding. Add{" "}
            <strong style={{ color: "var(--accent)" }}>Aider</strong> for terminal-based
            refactoring and multi-file edits.
          </p>
        </div>
      </main>

      <footer className="footer">
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {selected.length > 0 && (
            <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
              {selected.length} agent{selected.length !== 1 ? "s" : ""} selected
            </span>
          )}
          <button
            className="btn btn-primary"
            onClick={onNext}
            disabled={selected.length === 0}
          >
            Install →
          </button>
        </div>
      </footer>
    </>
  );
}
