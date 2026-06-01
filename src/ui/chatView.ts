import * as vscode from "vscode";
import { OpenAIClient } from "../services/llm/openaiClient";
import { ChatMessage } from "../services/llm/types";
import { ToolRegistry } from "../features/agent/toolRegistry";
import { runAgent } from "../features/agent/loop";
import { settings, updateSetting } from "../core/config";
import { AuthService, AuthState } from "../services/auth/authService";
import { ModelsService } from "../services/llm/modelsService";
import { buildHtml, nonce } from "./webview/shared";
import { Logger } from "../core/logger";
import { HistoryStore } from "../services/chat/historyStore";
import { systemBriefForLLM } from "../core/systemInfo";

const HISTORY_WINDOW = 30;
const HISTORY_PAGE = 30;

const SYSTEM_CHAT = `You are OnlySq CLI, a coding assistant inside VS Code.
- Answer in Markdown with fenced code blocks (\`\`\`lang).
- "This file" / "selection" refers to the active editor context provided.
- Be concise. Prefer code over prose when code is the answer.`;

const CHAT_BODY = `
<div id="authPanel" class="auth-wrap" style="display:none">
  <div class="auth-card">
    <div class="auth-logo"><span>Sq</span><span class="dot">.</span></div>
    <div class="auth-title">OnlySq CLI</div>
    <div class="auth-sub" id="authSub">Sign in with your OnlySq account to use chat, completions and the agent.</div>
    <div class="auth-error" id="authError" style="display:none"></div>
    <button class="btn primary" id="authBtn">Auth with OnlySq</button>
  </div>
</div>

<main id="logEl" class="chat-log" style="display:none">
  <div id="loadMoreWrap" class="load-more-wrap" style="display:none">
    <button class="btn ghost small" id="loadMoreBtn">Load previous messages</button>
  </div>
  <div id="logBody"></div>
</main>

<div id="composerWrap" class="composer-wrap" style="display:none">
  <div class="composer-resizer" id="composerResizer"></div>
  <div id="composer" class="composer">
    <textarea id="inp" rows="1" placeholder="Ask anything, or describe a task…"></textarea>
    <div class="composer-toolbar">
      <div class="toolbar-left">
        <button class="icon-btn" id="agentToggle" title="Agent mode (file edits)">A</button>
        <button class="icon-btn" id="newChat" title="New chat">+</button>
        <div class="model-pill" id="modelPill" title="Select model">
          <span id="modelLabel">Loading…</span>
          <span class="pcaret">▾</span>
        </div>
      </div>
      <div class="toolbar-right">
        <button class="send-btn" id="sendBtn" title="Send (Enter)" disabled>↑</button>
        <button class="stop-btn" id="stopBtn" title="Stop" style="display:none">■</button>
      </div>
    </div>
  </div>
</div>

<div id="modelModal" class="modal-backdrop">
  <div class="modal">
    <div class="modal-head">
      <input id="modelSearch" type="text" placeholder="Search models…" />
    </div>
    <div id="modelList" class="modal-body"></div>
  </div>
</div>
`;

export class ChatView implements vscode.WebviewViewProvider {
    static readonly viewId = "onlysq.chat";

    private view?: vscode.WebviewView;
    private history: ChatMessage[] = [];
    private windowStart = 0;
    private aborter?: AbortController;
    private subs: vscode.Disposable[] = [];
    private historyStore: HistoryStore;

    constructor(
        private ctx: vscode.ExtensionContext,
        private client: OpenAIClient,
        private registry: ToolRegistry,
        private auth: AuthService,
        private modelsService: ModelsService
    ) {
        this.historyStore = new HistoryStore(ctx);
        this.history = this.historyStore.load();
        this.windowStart = Math.max(0, this.history.length - 30);
    }

    resolveWebviewView(view: vscode.WebviewView): void {
        Logger.log("[chat] resolveWebviewView");
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.ctx.extensionUri, "media"),
            ],
        };
        view.webview.html = buildHtml({
            webview: view.webview,
            extensionUri: this.ctx.extensionUri,
            nonce: nonce(),
            title: "OnlySq Chat",
            bodyHtml: CHAT_BODY,
            scriptFile: "chat.js",
            cssFile: "webview.css",
        });

        this.disposeSubs();
        this.subs.push(
            view.webview.onDidReceiveMessage((m) => this.onMessage(m))
        );
        this.subs.push(this.auth.onChange((s) => this.pushAuth(s)));
        this.subs.push(
            view.onDidChangeVisibility(() => {
                if (view.visible) {
                    void this.pushAuth();
                    this.pushHistoryWindow("replace");
                }
            })
        );
        this.subs.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration("onlysq.chatModel"))
                    this.pushModel();
            })
        );
        this.subs.push(view.onDidDispose(() => this.disposeSubs()));
    }

    focus(): void {
        vscode.commands.executeCommand(`${ChatView.viewId}.focus`);
    }

    async sendPrompt(
        text: string,
        mode: "chat" | "agent" = "chat"
    ): Promise<void> {
        this.focus();
        await new Promise((r) => setTimeout(r, 200));
        if (!(await this.auth.isSignedIn())) {
            await this.pushAuth();
            return;
        }
        await this.handleSend(text, mode);
    }

    private async pushAuth(state?: AuthState): Promise<void> {
        if (!this.view) return;
        const s = state ?? (await this.auth.getState());
        this.view.webview.postMessage({
            type: "auth",
            signed: s.signed,
            signingIn: s.signingIn,
            error: s.error ?? null,
            profile: s.profile ?? null,
        });
        if (s.signed) {
            await this.pushModels();
            this.pushModel();
            if (this.history.length) this.pushHistoryWindow("replace");
        }
    }

    private async pushModels(): Promise<void> {
        const list = await this.modelsService.fetch();
        this.view?.webview.postMessage({ type: "models", list });
    }

    private pushModel(): void {
        this.view?.webview.postMessage({
            type: "model",
            id: settings().chatModel,
        });
    }

    private async onMessage(m: any): Promise<void> {
        if (m?.type === "__log") {
            Logger.log("[webview]", ...(m.args ?? []));
            return;
        }
        Logger.log("[chat] onMessage", m?.type);
        switch (m.type) {
            case "ready":
                await this.pushAuth();
                return;

            case "signIn":
                return this.auth.signIn();

            case "send":
                if (!(await this.auth.isSignedIn())) {
                    await this.pushAuth();
                    return;
                }
                return this.handleSend(m.text, m.mode);

            case "cancel":
                Logger.log("[chat] cancel requested");
                this.aborter?.abort();
                return;

            case "reset":
                this.history = [];
                this.windowStart = 0;
                void this.historyStore.clear();
                this.pushHistoryWindow("replace");
                return;

            case "loadMore":
                return this.loadMore();

            case "trimToWindow":
                return this.trimToWindow();

            case "selectModel":
                if (typeof m.model === "string") {
                    await updateSetting("chatModel", m.model);
                    this.pushModel();
                }
                return;

            case "refreshModels":
                await this.modelsService.fetch(true);
                await this.pushModels();
                return;

            case "showDiff":
                if (typeof m.id === "string") {
                    const { showDiff } = await import(
                        "../services/workspace/diffPreview"
                    );
                    await showDiff(m.id);
                }
                return;

            case "applyEdit":
                if (typeof m.id === "string") {
                    const { applyProposal, getProposalState } = await import(
                        "../services/workspace/diffPreview"
                    );
                    const ok = await applyProposal(m.id).catch(() => false);
                    this.view?.webview.postMessage({
                        type: "editResult",
                        id: m.id,
                        state: ok ? "applied" : getProposalState(m.id),
                    });
                }
                return;

            case "rejectEdit":
                if (typeof m.id === "string") {
                    const { rejectProposal } = await import(
                        "../services/workspace/diffPreview"
                    );
                    rejectProposal(m.id);
                    this.view?.webview.postMessage({
                        type: "editResult",
                        id: m.id,
                        state: "rejected",
                    });
                }
                return;
        }
    }

    private async handleSend(
        text: string,
        mode: "chat" | "agent"
    ): Promise<void> {
        this.aborter?.abort();
        const aborter = new AbortController();
        this.aborter = aborter;

        try {
            if (mode === "agent") await this.runAgentMode(text, aborter.signal);
            else await this.runChatMode(text, aborter.signal);
        } catch (e: any) {
            Logger.error("[chat] send", e);
            this.post({ type: "error", message: String(e?.message ?? e) });
        }
    }

    private async runChatMode(
        text: string,
        signal: AbortSignal
    ): Promise<void> {
        const ctx = await editorContextSnippet();
        const userContent = ctx
            ? `${text}\n\n---\n**Editor context:**\n${ctx}`
            : text;
        const systemPrompt = `You are OnlySq CLI, a coding assistant inside VS Code.
- Answer in Markdown with fenced code blocks (\`\`\`lang).
- "This file" / "selection" refers to the active editor context provided.
- Be concise. Prefer code over prose when code is the answer.

--- System context ---
${systemBriefForLLM()}`;
        const messages: ChatMessage[] = [
            { role: "system", content: systemPrompt },
            ...this.history,
            { role: "user", content: text },
        ];

        let acc = "";
        for await (const d of this.client.stream(
            {
                model: settings().chatModel,
                temperature: settings().temperature,
                messages: [
                    { role: "system", content: systemPrompt },
                    ...this.history,
                    { role: "user", content: userContent },
                ],
            },
            signal
        )) {
            if (d.content) {
                acc += d.content;
                this.post({ type: "token", text: d.content });
            }
        }
        this.history.push({ role: "user", content: text });
        this.history.push({ role: "assistant", content: acc });
        this.post({ type: "done" });
        this.updateHistoryAfterTurn();
    }

    private async runAgentMode(
        text: string,
        signal: AbortSignal
    ): Promise<void> {
        const ctx = await editorContextSnippet();
        const goal = ctx ? `${text}\n\n---\n**Editor context:**\n${ctx}` : text;
        this.history = await runAgent(
            this.client,
            this.registry,
            goal,
            (e) => {
                switch (e.type) {
                    case "token":
                        this.post({ type: "token", text: e.text });
                        break;
                    case "tool-call":
                        this.post({
                            type: "tool-call",
                            id: e.id,
                            name: e.name,
                            args: e.args,
                        });
                        break;
                    case "tool-result":
                        this.post({
                            type: "tool-result",
                            id: e.id,
                            name: e.name,
                            result: e.result,
                        });
                        break;
                    case "done":
                        this.post({ type: "done", reason: e.reason });
                        break;
                    case "error":
                        this.post({ type: "error", message: e.message });
                        break;
                }
            },
            signal,
            this.history
        );
        this.updateHistoryAfterTurn();
    }

    private updateHistoryAfterTurn(): void {
        this.windowStart = Math.max(0, this.history.length - 30);
        this.notifyCanLoadMore();
        void this.historyStore.save(this.history);
    }

    private loadMore(): void {
        const next = Math.max(0, this.windowStart - HISTORY_PAGE);
        if (next === this.windowStart) return;
        const slice = this.history.slice(next, this.windowStart);
        this.windowStart = next;
        this.view?.webview.postMessage({
            type: "prepend",
            messages: serializeMessages(slice),
        });
        this.notifyCanLoadMore();
    }

    private trimToWindow(): void {
        // when user scrolled all the way back to bottom — keep only window
        this.windowStart = Math.max(0, this.history.length - HISTORY_WINDOW);
        this.view?.webview.postMessage({
            type: "trimTo",
            keep: this.history.length - this.windowStart,
        });
        this.notifyCanLoadMore();
    }

    private notifyCanLoadMore(): void {
        this.view?.webview.postMessage({
            type: "canLoadMore",
            value: this.windowStart > 0,
        });
    }

    private pushHistoryWindow(_mode: "replace"): void {
        const slice = this.history.slice(this.windowStart);
        this.view?.webview.postMessage({
            type: "replace",
            messages: serializeMessages(slice),
        });
        this.notifyCanLoadMore();
    }

    private post(msg: any): void {
        this.view?.webview.postMessage(msg);
    }

    private disposeSubs(): void {
        for (const d of this.subs.splice(0)) {
            try {
                d.dispose();
            } catch {
                /* */
            }
        }
    }
}

function serializeMessages(
    msgs: ChatMessage[]
): Array<{ role: string; content: string }> {
    return msgs
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content ?? "" }));
}

async function editorContextSnippet(): Promise<string | null> {
    const ed = vscode.window.activeTextEditor;
    if (!ed) return null;
    const doc = ed.document;

    if (doc.uri.scheme !== "file" && doc.uri.scheme !== "untitled") return null;

    const sel = ed.selection;
    if (sel.isEmpty) return null;

    const rel = vscode.workspace.asRelativePath(doc.uri, false);
    const text = doc.getText(sel);
    return `File: \`${rel}\` (selection ${sel.start.line + 1}-${
        sel.end.line + 1
    })\n\`\`\`${doc.languageId}\n${text.slice(0, 8000)}\n\`\`\``;
}
