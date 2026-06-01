import * as vscode from "vscode";
import { OpenAIClient } from "../../services/llm/openaiClient";
import { settings } from "../../core/config";
import { buildContext, shouldSkip } from "./contextBuilder";
import { Logger } from "../../core/logger";

const SYSTEM = `You are a precise code completion engine inside an IDE.
Rules:
- Output ONLY the text to insert at the <CURSOR> marker. No prose, no markdown, no fences.
- Do not repeat code that appears before the cursor.
- If there is nothing meaningful to add, output exactly: <SKIP>
- Match the existing code style (indentation, quotes, naming).
- Keep completions short and focused unless clearly starting a new block.`;

const PRELOAD_PING = `You are a code completion engine. Reply with a single newline character only.`;

export class OnlySqInlineProvider
    implements vscode.InlineCompletionItemProvider
{
    private debounce?: NodeJS.Timeout;
    private aborter?: AbortController;
    private preloadedModel: string | null = null;
    private preloadPromise: Promise<void> | null = null;

    constructor(private client: OpenAIClient) {
        // preload at startup
        void this.preload();
    }

    private async preload(): Promise<void> {
        const model = settings().completionModel;
        if (this.preloadedModel === model) return;
        if (this.preloadPromise) return this.preloadPromise;
        this.preloadPromise = (async () => {
            try {
                Logger.log("[completion] preloading model", model);
                await this.client.complete({
                    model,
                    temperature: 0,
                    max_tokens: 1,
                    messages: [
                        { role: "system", content: PRELOAD_PING },
                        { role: "user", content: "." },
                    ],
                });
                this.preloadedModel = model;
                Logger.log("[completion] preload ok");
            } catch (e) {
                Logger.error("[completion] preload failed", e);
            } finally {
                this.preloadPromise = null;
            }
        })();
        return this.preloadPromise;
    }

    async provideInlineCompletionItems(
        doc: vscode.TextDocument,
        pos: vscode.Position,
        _ctx: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | null> {
        const cfg = settings();
        if (!cfg.inlineEnabled) return null;

        if (this.preloadedModel !== cfg.completionModel) {
            void this.preload();
        }

        const c = buildContext(
            doc,
            pos,
            cfg.contextLinesBefore,
            cfg.contextLinesAfter
        );
        if (shouldSkip(c)) return null;

        this.aborter?.abort();
        const aborter = new AbortController();
        this.aborter = aborter;
        token.onCancellationRequested(() => aborter.abort());

        await new Promise((r) => {
            clearTimeout(this.debounce);
            this.debounce = setTimeout(r, 220);
        });
        if (aborter.signal.aborted) return null;

        const user = [
            `Language: ${c.language}`,
            `File: ${c.fileName}`,
            "",
            "<context_before>",
            c.before,
            "<CURSOR>",
            c.after,
            "</context_before>",
            "",
            "Insertion at <CURSOR>:",
        ].join("\n");

        try {
            const text = await this.client.complete(
                {
                    model: cfg.completionModel,
                    temperature: 0.2,
                    max_tokens: 256,
                    messages: [
                        { role: "system", content: SYSTEM },
                        { role: "user", content: user },
                    ],
                    stop: ["<CURSOR>", "</context_before>"],
                },
                aborter.signal
            );

            const clean = sanitize(text);
            if (!clean || clean === "<SKIP>") return null;
            return [
                new vscode.InlineCompletionItem(
                    clean,
                    new vscode.Range(pos, pos)
                ),
            ];
        } catch (e: any) {
            if (e?.name !== "AbortError") Logger.error("[completion]", e);
            return null;
        }
    }
}

function sanitize(s: string): string {
    let out = s ?? "";
    const fence = out.match(/^```[\w-]*\n([\s\S]*?)\n?```\s*$/);
    if (fence) out = fence[1];
    return out.replace(/^\n+/, "").replace(/\s+$/g, "");
}
