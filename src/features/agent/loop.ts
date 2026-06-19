import { OpenAIClient } from "../../services/llm/openaiClient";
import { systemBriefForLLM } from "../../core/systemInfo";
import { ChatMessage } from "../../services/llm/types";
import { ToolRegistry } from "./toolRegistry";
import { settings } from "../../core/config";
import { ToolCache } from "./toolCache";

export type AgentEvent =
    | { type: "token"; text: string }
    | { type: "tool-call"; id: string; name: string; args: any }
    | { type: "tool-result"; id: string; name: string; result: string }
    | { type: "done"; reason?: string }
    | { type: "error"; message: string };

const SYSTEM_BASE = `You are OnlySq CLI, an autonomous coding agent operating inside VS Code.
    You have access to the user's workspace through tools. Workflow:
    1. Understand the goal. Ask for clarification only if truly ambiguous.
    2. Explore: use list_dir / search / read_file before assuming structure.
    3. Plan briefly (1-3 sentences), then act.
    4. Choose the right edit tool:
       - propose_edit — create a new file, or fully rewrite an existing one. Provide the COMPLETE new content.
       - apply_at_line — replace, insert before, or insert after a specific range of lines. You MUST provide expected_lines as a verification anchor.
       - patch_file — apply a unified diff. Include accurate context lines.
       ALL three open a native diff in the chat with Apply/Reject buttons.
    5. CRITICAL: before apply_at_line or patch_file, ALWAYS call read_file to get the current file content. Never guess line numbers or context — the tool will reject your call if expected_lines / context lines do not match the real file, and you will have to read and retry.
    6. After making one edit, the file content may have changed. If you need to make another edit to the same file, re-read it first.
    7. You may request multiple read-only tools in one step — they run in parallel.
    8. Stop and summarize when the goal is complete.
    
    Shell commands:
    - run_command — captures stdout/stderr, use for one-off commands.
    - run_command_interactive — fire-and-forget into terminal, use for dev servers / watchers.
    - Respect the user's shell. Do NOT chain commands with operators the shell doesn't support.
    
    Be concise. Don't dump file contents back at the user unless asked.`;

export async function runAgent(
    client: OpenAIClient,
    registry: ToolRegistry,
    goal: string,
    onEvent: (e: AgentEvent) => void,
    signal?: AbortSignal,
    history: ChatMessage[] = []
): Promise<ChatMessage[]> {
    const cfg = settings();
    const cache = new ToolCache(cfg.toolCache);

    let systemPrompt = `${SYSTEM_BASE}\n\n--- System context ---\n${systemBriefForLLM()}`;
    if (cfg.customSystemPrompt) {
        systemPrompt += `\n\n--- Custom context ---\n${cfg.customSystemPrompt}`;
    }

    const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: goal },
    ];

    const tools = registry.list();

    for (let step = 0; step < cfg.maxAgentSteps; step++) {
        if (signal?.aborted) {
            onEvent({ type: "done", reason: "cancelled" });
            return messages;
        }

        let content = "";
        let toolCalls: any[] = [];

        try {
            for await (const d of client.stream(
                {
                    model: cfg.chatModel,
                    temperature: cfg.temperature,
                    messages,
                    tools,
                    tool_choice: "auto",
                },
                signal
            )) {
                if (d.content) {
                    content += d.content;
                    onEvent({ type: "token", text: d.content });
                }
                if (d.toolCalls) toolCalls = d.toolCalls;
            }
        } catch (e: any) {
            onEvent({ type: "error", message: String(e?.message ?? e) });
            return messages;
        }

        messages.push({
            role: "assistant",
            content,
            tool_calls: toolCalls.length ? toolCalls : undefined,
        });

        if (!toolCalls.length) {
            onEvent({ type: "done" });
            return messages;
        }

        const runOne = async (
            tc: any
        ): Promise<{ id: string; name: string; result: string }> => {
            let args: any = {};
            try {
                args = JSON.parse(tc.function.arguments || "{}");
            } catch {
                /* */
            }
            onEvent({
                type: "tool-call",
                id: tc.id,
                name: tc.function.name,
                args,
            });

            const cached = cache.get(tc.function.name, args);
            if (cached !== undefined) {
                const cachedNote = "(cached) " + cached;
                onEvent({
                    type: "tool-result",
                    id: tc.id,
                    name: tc.function.name,
                    result: cachedNote,
                });
                return {
                    id: tc.id,
                    name: tc.function.name,
                    result: cachedNote,
                };
            }

            const tool = registry.get(tc.function.name);
            let result: string;
            try {
                result = tool
                    ? await tool.run(args, { callId: tc.id })
                    : `Unknown tool: ${tc.function.name}`;
            } catch (e: any) {
                result = `Error: ${e?.message ?? e}`;
            }
            cache.set(tc.function.name, args, result);
            onEvent({
                type: "tool-result",
                id: tc.id,
                name: tc.function.name,
                result,
            });
            return { id: tc.id, name: tc.function.name, result };
        };

        const results = cfg.parallelTools
            ? await Promise.all(toolCalls.map(runOne))
            : await sequential(toolCalls, runOne);

        for (const r of results) {
            messages.push({
                role: "tool",
                tool_call_id: r.id,
                content: r.result.slice(0, 60_000),
            });
        }
    }
    onEvent({ type: "done", reason: "max_steps" });
    return messages;
}

async function sequential<T, R>(
    items: T[],
    fn: (x: T) => Promise<R>
): Promise<R[]> {
    const out: R[] = [];
    for (const it of items) out.push(await fn(it));
    return out;
}
