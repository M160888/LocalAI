import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export class LocalAIPanel {
  public static currentPanel: LocalAIPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private static _activeModel: string = "";

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (LocalAIPanel.currentPanel) {
      LocalAIPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "localAIChat",
      "Local AI Chat",
      column ?? vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "webview"),
        ],
      }
    );

    LocalAIPanel.currentPanel = new LocalAIPanel(panel, extensionUri);
  }

  public static setModel(model: string) {
    LocalAIPanel._activeModel = model;
    if (LocalAIPanel.currentPanel) {
      LocalAIPanel.currentPanel._panel.webview.postMessage({
        type: "setModel",
        model,
      });
    }
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set initial content
    this._panel.webview.html = this._getHtml();

    // Send current model when panel is ready
    this._panel.webview.onDidReceiveMessage(
      (msg: { type: string; text?: string; model?: string }) => {
        this._handleMessage(msg);
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(
      () => {
        LocalAIPanel.currentPanel = undefined;
        this._dispose();
      },
      null,
      this._disposables
    );

    // Send active model from settings
    const config = vscode.workspace.getConfiguration("localAI");
    LocalAIPanel._activeModel = config.get("activeModel") ?? "";
  }

  private _handleMessage(msg: { type: string; text?: string; model?: string }) {
    switch (msg.type) {
      case "ready":
        // Send current model list + active model
        this._sendModels();
        break;

      case "setModel":
        if (msg.model) {
          LocalAIPanel._activeModel = msg.model;
          vscode.workspace
            .getConfiguration("localAI")
            .update("activeModel", msg.model, true);
        }
        break;

      case "getContext":
        // Send selected text from active editor
        this._sendEditorContext();
        break;
    }
  }

  private async _sendModels() {
    try {
      const resp = await fetch("http://localhost:11434/api/tags");
      if (resp.ok) {
        const data = (await resp.json()) as { models: { name: string; size: number }[] };
        this._panel.webview.postMessage({
          type: "models",
          models: data.models ?? [],
          activeModel: LocalAIPanel._activeModel,
        });
      }
    } catch {
      this._panel.webview.postMessage({
        type: "ollamaOffline",
      });
    }
  }

  private _sendEditorContext() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const selection = editor.selection;
      const text = editor.document.getText(selection);
      const lang = editor.document.languageId;
      const file = path.basename(editor.document.fileName);
      this._panel.webview.postMessage({
        type: "context",
        text,
        lang,
        file,
      });
    }
  }

  private _getHtml(): string {
    const webviewPath = vscode.Uri.joinPath(
      this._extensionUri,
      "webview",
      "panel.html"
    );
    try {
      let html = fs.readFileSync(webviewPath.fsPath, "utf8");
      // Replace panel.js with proper webview URI
      const jsUri = this._panel.webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, "webview", "panel.js")
      );
      html = html.replace("panel.js", jsUri.toString());
      return html;
    } catch {
      return this._fallbackHtml();
    }
  }

  private _fallbackHtml(): string {
    return `<!DOCTYPE html>
<html>
<head><style>body { background: #0f1117; color: #e8eaf0; font-family: sans-serif; padding: 20px; }</style></head>
<body><p>Local AI Studio panel failed to load. Check extension installation.</p></body>
</html>`;
  }

  private _dispose() {
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      d?.dispose();
    }
  }
}
