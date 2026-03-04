// VSCode webview API
const vscode = acquireVsCodeApi();

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const modelSelect = document.getElementById("model-select");
const ctxBtn = document.getElementById("ctx-btn");
const ctxPreview = document.getElementById("ctx-preview");
const ctxText = document.getElementById("ctx-text");
const ctxClear = document.getElementById("ctx-clear");
const offlineBanner = document.getElementById("offline-banner");

let activeModel = "";
let editorContext = null; // { text, lang, file }
let isGenerating = false;
let currentStream = null;

// ─── Message from extension ───────────────────────────────────────────────

window.addEventListener("message", (event) => {
  const msg = event.data;
  switch (msg.type) {
    case "models":
      populateModels(msg.models, msg.activeModel);
      offlineBanner.classList.remove("visible");
      break;
    case "setModel":
      activeModel = msg.model;
      modelSelect.value = msg.model;
      break;
    case "ollamaOffline":
      offlineBanner.classList.add("visible");
      modelSelect.innerHTML = '<option value="">Ollama offline</option>';
      break;
    case "context":
      if (msg.text && msg.text.trim()) {
        editorContext = { text: msg.text, lang: msg.lang, file: msg.file };
        ctxText.textContent = `${msg.file}: "${msg.text.substring(0, 80)}${msg.text.length > 80 ? "…" : ""}"`;
        ctxPreview.classList.add("visible");
      } else {
        addSystemMsg("No text selected in editor.");
      }
      break;
  }
});

// Signal ready to extension
vscode.postMessage({ type: "ready" });

// ─── Model select ─────────────────────────────────────────────────────────

function populateModels(models, active) {
  if (!models || models.length === 0) {
    modelSelect.innerHTML = '<option value="">No models installed</option>';
    return;
  }
  modelSelect.innerHTML = models
    .map((m) => `<option value="${m.name}">${m.name}</option>`)
    .join("");

  if (active && models.find((m) => m.name === active)) {
    modelSelect.value = active;
    activeModel = active;
  } else {
    activeModel = models[0].name;
    modelSelect.value = activeModel;
  }
}

modelSelect.addEventListener("change", () => {
  activeModel = modelSelect.value;
  vscode.postMessage({ type: "setModel", model: activeModel });
});

// ─── Editor context ───────────────────────────────────────────────────────

ctxBtn.addEventListener("click", () => {
  vscode.postMessage({ type: "getContext" });
});

ctxClear.addEventListener("click", () => {
  editorContext = null;
  ctxPreview.classList.remove("visible");
});

// ─── Chat ─────────────────────────────────────────────────────────────────

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

// Auto-resize textarea
inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
});

function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isGenerating) return;
  if (!activeModel) {
    addSystemMsg("Select a model first.");
    return;
  }

  // Build prompt with optional context
  let prompt = text;
  if (editorContext) {
    prompt = `Context from ${editorContext.file} (${editorContext.lang}):\n\`\`\`${editorContext.lang}\n${editorContext.text}\n\`\`\`\n\n${text}`;
  }

  addUserMsg(text);
  inputEl.value = "";
  inputEl.style.height = "auto";

  // Clear context after use
  editorContext = null;
  ctxPreview.classList.remove("visible");

  streamResponse(prompt);
}

function addUserMsg(text) {
  const el = document.createElement("div");
  el.className = "msg user";
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function addSystemMsg(text) {
  const el = document.createElement("div");
  el.className = "msg system";
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function addAiMsg() {
  const el = document.createElement("div");
  el.className = "msg ai cursor";
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

async function streamResponse(prompt) {
  isGenerating = true;
  sendBtn.disabled = true;
  sendBtn.textContent = "Stop";
  sendBtn.onclick = stopGeneration;

  const aiEl = addAiMsg();
  let fullText = "";
  let aborted = false;

  const controller = new AbortController();
  currentStream = controller;

  try {
    const resp = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: activeModel,
        prompt,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`Ollama error: ${resp.status} ${resp.statusText}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value, { stream: true }).split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.response) {
            fullText += data.response;
            aiEl.innerHTML = renderMarkdown(fullText);
            if (!data.done) aiEl.classList.add("cursor");
            else aiEl.classList.remove("cursor");
            scrollToBottom();
          }
          if (data.done) break;
        } catch {
          // skip malformed JSON
        }
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      aborted = true;
      aiEl.classList.remove("cursor");
      fullText += " [stopped]";
      aiEl.innerHTML = renderMarkdown(fullText);
    } else {
      aiEl.classList.remove("cursor");
      aiEl.innerHTML = `<span style="color:#f87171">Error: ${err.message}</span>`;
      offlineBanner.classList.add("visible");
    }
  } finally {
    isGenerating = false;
    currentStream = null;
    aiEl.classList.remove("cursor");
    sendBtn.disabled = false;
    sendBtn.textContent = "Send";
    sendBtn.onclick = sendMessage;
    scrollToBottom();
  }
}

function stopGeneration() {
  if (currentStream) {
    currentStream.abort();
  }
}

// ─── Markdown rendering (minimal) ────────────────────────────────────────

function renderMarkdown(text) {
  // Escape HTML first
  let s = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks
  s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang}">${code.trimEnd()}</code></pre>`;
  });

  // Inline code
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Headers (h3 max to avoid visual noise)
  s = s.replace(/^### (.+)$/gm, "<strong>$1</strong>");
  s = s.replace(/^## (.+)$/gm, "<strong>$1</strong>");
  s = s.replace(/^# (.+)$/gm, "<strong>$1</strong>");

  // Line breaks (preserve them)
  s = s.replace(/\n/g, "<br>");

  return s;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
