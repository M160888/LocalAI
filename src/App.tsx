import { useState } from "react";
import SystemScan from "./components/SystemScan";
import ModelPicker from "./components/ModelPicker";
import AgentPicker from "./components/AgentPicker";
import Installer from "./components/Installer";
import Dashboard from "./components/Dashboard";
import type { SystemInfo, ModelDef } from "./types";

export type Screen = "scan" | "models" | "agents" | "install" | "dashboard";

const SCREENS: Screen[] = ["scan", "models", "agents", "install", "dashboard"];

export default function App() {
  const [screen, setScreen] = useState<Screen>("scan");
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [selectedModels, setSelectedModels] = useState<ModelDef[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  const currentIdx = SCREENS.indexOf(screen);

  const go = (s: Screen) => setScreen(s);

  return (
    <div className="app">
      <header className="header">
        <svg className="logo" viewBox="0 0 28 28" fill="none">
          <rect width="28" height="28" rx="7" fill="#6c63ff" />
          <circle cx="14" cy="14" r="5" fill="white" opacity="0.9" />
          <circle cx="14" cy="14" r="2" fill="#6c63ff" />
        </svg>
        <h1>Local AI Studio</h1>
        <nav className="step-nav">
          {SCREENS.map((s, i) => (
            <div
              key={s}
              className={`step-dot ${i === currentIdx ? "active" : i < currentIdx ? "done" : ""}`}
            />
          ))}
        </nav>
      </header>

      {screen === "scan" && (
        <SystemScan
          onNext={(info) => {
            setSystemInfo(info);
            go("models");
          }}
        />
      )}

      {screen === "models" && systemInfo && (
        <ModelPicker
          systemInfo={systemInfo}
          selected={selectedModels}
          onSelect={setSelectedModels}
          onBack={() => go("scan")}
          onNext={() => go("agents")}
        />
      )}

      {screen === "agents" && (
        <AgentPicker
          selected={selectedAgents}
          onSelect={setSelectedAgents}
          onBack={() => go("models")}
          onNext={() => go("install")}
        />
      )}

      {screen === "install" && systemInfo && (
        <Installer
          systemInfo={systemInfo}
          models={selectedModels}
          agents={selectedAgents}
          onBack={() => go("agents")}
          onDone={() => go("dashboard")}
        />
      )}

      {screen === "dashboard" && (
        <Dashboard
          installedModels={selectedModels}
          onAddModels={() => go("models")}
        />
      )}
    </div>
  );
}
