import * as vscode from "vscode";
import { LocalAIPanel } from "./panel";

export function activate(context: vscode.ExtensionContext) {
  // Open panel command
  context.subscriptions.push(
    vscode.commands.registerCommand("localAI.openPanel", () => {
      LocalAIPanel.createOrShow(context.extensionUri);
    })
  );

  // Switch model command (quick pick)
  context.subscriptions.push(
    vscode.commands.registerCommand("localAI.switchModel", async () => {
      const models = await fetchModelList();
      if (models.length === 0) {
        vscode.window.showErrorMessage(
          "Ollama is not running or no models installed. Start Ollama first."
        );
        return;
      }

      const pick = await vscode.window.showQuickPick(
        models.map((m) => ({ label: m.name, description: formatBytes(m.size) })),
        { placeHolder: "Select a local model" }
      );

      if (pick) {
        const config = vscode.workspace.getConfiguration("localAI");
        await config.update("activeModel", pick.label, true);
        LocalAIPanel.setModel(pick.label);
        vscode.window.showInformationMessage(`Local AI: switched to ${pick.label}`);
      }
    })
  );

  // Status bar button
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBar.text = "$(robot) Local AI";
  statusBar.command = "localAI.openPanel";
  statusBar.tooltip = "Open Local AI Chat (Ctrl+Shift+A)";
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Update status bar with active model name
  updateStatusBar(statusBar);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("localAI.activeModel")) {
        updateStatusBar(statusBar);
      }
    })
  );
}

function updateStatusBar(bar: vscode.StatusBarItem) {
  const config = vscode.workspace.getConfiguration("localAI");
  const model: string = config.get("activeModel") ?? "";
  bar.text = model ? `$(robot) ${model.split(":")[0]}` : "$(robot) Local AI";
}

interface OllamaModel {
  name: string;
  size: number;
}

async function fetchModelList(): Promise<OllamaModel[]> {
  try {
    const resp = await fetch("http://localhost:11434/api/tags");
    if (!resp.ok) return [];
    const data = (await resp.json()) as { models: OllamaModel[] };
    return data.models ?? [];
  } catch {
    return [];
  }
}

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 / 1024 / 1024;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export function deactivate() {}
