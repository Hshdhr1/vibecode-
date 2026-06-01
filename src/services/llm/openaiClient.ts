import { AI } from "../../core/config";
import { parseSSE } from "../../core/sse";
import { AuthService } from "../auth/authService";
import { Logger } from "../../core/logger";
import { ChatRequest, ChatDelta, ToolCall } from "./types";
import { UsageTracker } from "./usageTracker";

export class OpenAIClient {
    constructor(private auth: AuthService, private usage?: UsageTracker) {}

    async *stream(
        req: ChatRequest,
        signal?: AbortSignal
    ): AsyncGenerator<ChatDelta> {
        let key = await this.auth.getApiKey();
        let resp = await this.send(key, req, signal);
        if (resp.status === 401) {
            key = await this.auth.getApiKey(true);
            resp = await this.send(key, req, signal);
        }
        if (!resp.ok || !resp.body) {
            throw new Error(
                `Chat failed (${resp.status}): ${await resp.text()}`
            );
        }

        const acc: Record<number, ToolCall> = {};
        for await (const chunk of parseSSE(resp.body)) {
            if (chunk?.usage) this.usage?.record(chunk.usage);
            const choice = chunk?.choices?.[0];
            const delta = choice?.delta;
            if (!delta) continue;
            const out: ChatDelta = {};
            if (delta.content) out.content = delta.content;
            if (delta.tool_calls)
                out.toolCalls = mergeToolCalls(acc, delta.tool_calls);
            if (choice.finish_reason) out.finishReason = choice.finish_reason;
            yield out;
        }
    }

    async complete(req: ChatRequest, signal?: AbortSignal): Promise<string> {
        let out = "";
        for await (const d of this.stream(req, signal))
            if (d.content) out += d.content;
        return out;
    }

    private send(
        apiKey: string,
        req: ChatRequest,
        signal?: AbortSignal
    ): Promise<Response> {
        return fetch(`${AI.apiBase}${AI.chatPath}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                ...req,
                stream: true,
                stream_options: { include_usage: true },
            }),
            signal,
        });
    }
}

function mergeToolCalls(
    acc: Record<number, ToolCall>,
    parts: any[]
): ToolCall[] {
    for (const p of parts) {
        const i = p.index ?? 0;
        acc[i] ??= {
            id: "",
            type: "function",
            function: { name: "", arguments: "" },
        };
        if (p.id) acc[i].id = p.id;
        if (p.function?.name) acc[i].function.name += p.function.name;
        if (p.function?.arguments)
            acc[i].function.arguments += p.function.arguments;
    }
    return Object.values(acc);
}
