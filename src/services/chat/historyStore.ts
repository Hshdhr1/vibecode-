import * as vscode from "vscode";
import { ChatMessage } from "../llm/types";
import { STORAGE_KEYS, settings } from "../../core/config";

const MAX_PERSIST = 500;

export class HistoryStore {
    constructor(private ctx: vscode.ExtensionContext) {}

    load(): ChatMessage[] {
        if (!settings().persistHistory) return [];
        const raw = this.ctx.workspaceState.get<ChatMessage[]>(
            STORAGE_KEYS.chatHistory
        );
        return Array.isArray(raw) ? raw.slice(-MAX_PERSIST) : [];
    }

    async save(history: ChatMessage[]): Promise<void> {
        if (!settings().persistHistory) return;
        const trimmed = history
            .filter((m) => m.role === "user" || m.role === "assistant")
            .slice(-MAX_PERSIST);
        await this.ctx.workspaceState.update(STORAGE_KEYS.chatHistory, trimmed);
    }

    async clear(): Promise<void> {
        await this.ctx.workspaceState.update(
            STORAGE_KEYS.chatHistory,
            undefined
        );
    }
}
