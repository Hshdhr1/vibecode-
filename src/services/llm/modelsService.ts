import * as vscode from "vscode";
import { AI, STORAGE_KEYS } from "../../core/config";
import { AuthService } from "../auth/authService";
import { Logger } from "../../core/logger";

export interface ModelInfo {
    id: string;
    owner: string;
}

const PROVIDER_LABELS: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google",
    gemini: "Google",
    cohere: "Cohere",
    deepseek: "DeepSeek",
    grok: "xAI",
    qwen: "Qwen",
    perplexity: "Perplexity",
    mistral: "Mistral",
    cloudflare: "Cloudflare",
    salutedevices: "GigaChat",
    websim: "Websim",
    "zai-org": "Z.AI",
};

export function providerOf(owner: string): string {
    const k = String(owner).toLowerCase().replace(/[<>]/g, "").trim();
    return PROVIDER_LABELS[k] ?? (owner || "Other");
}

export class ModelsService {
    constructor(
        private ctx: vscode.ExtensionContext,
        private auth: AuthService
    ) {}

    cached(): ModelInfo[] {
        return this.ctx.globalState.get<ModelInfo[]>(STORAGE_KEYS.models) ?? [];
    }

    async fetch(force = false): Promise<ModelInfo[]> {
        const cached = this.cached();
        if (!force && cached.length) return cached;
        try {
            const key = await this.auth.getApiKey();
            const r = await fetch(`${AI.apiBase}${AI.modelsPath}`, {
                headers: { Authorization: `Bearer ${key}` },
            });
            if (!r.ok) throw new Error(`models fetch failed (${r.status})`);
            const body = (await r.json()) as {
                data?: Array<{ id: string; owned_by?: string }>;
            };
            const list = (body.data ?? [])
                .filter((m) => !!m?.id)
                .map((m) => ({
                    id: m.id,
                    owner: providerOf(m.owned_by ?? "Other"),
                }))
                .sort((a, b) =>
                    a.owner === b.owner
                        ? a.id.localeCompare(b.id)
                        : a.owner.localeCompare(b.owner)
                );
            await this.ctx.globalState.update(STORAGE_KEYS.models, list);
            return list;
        } catch (e) {
            Logger.error("[models] fetch", e);
            return cached;
        }
    }

    groupByOwner(models: ModelInfo[]): Record<string, ModelInfo[]> {
        const out: Record<string, ModelInfo[]> = {};
        for (const m of models) (out[m.owner] ??= []).push(m);
        return out;
    }
}
