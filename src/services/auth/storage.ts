import * as vscode from "vscode";
import { STORAGE_KEYS } from "../../core/config";

export interface Profile {
    id?: number;
    name?: string;
    email?: string;
    level?: number;
    balance?: number;
}

export class CredentialStore {
    constructor(private ctx: vscode.ExtensionContext) {}

    async saveToken(token: string, expiresAt: number): Promise<void> {
        await this.ctx.secrets.store(STORAGE_KEYS.accessToken, token);
        await this.ctx.globalState.update(STORAGE_KEYS.expiresAt, expiresAt);
    }
    async loadToken(): Promise<string | null> {
        const t = await this.ctx.secrets.get(STORAGE_KEYS.accessToken);
        const e = this.ctx.globalState.get<number>(STORAGE_KEYS.expiresAt) ?? 0;
        return t && Date.now() < e - 60_000 ? t : null;
    }
    async saveApiKey(k: string): Promise<void> {
        await this.ctx.secrets.store(STORAGE_KEYS.apiKey, k);
    }
    async loadApiKey(): Promise<string | null> {
        return (await this.ctx.secrets.get(STORAGE_KEYS.apiKey)) ?? null;
    }

    async saveProfile(p: Profile): Promise<void> {
        await this.ctx.globalState.update(STORAGE_KEYS.profile, p);
    }
    loadProfile(): Profile | undefined {
        return this.ctx.globalState.get<Profile>(STORAGE_KEYS.profile);
    }

    async clear(): Promise<void> {
        await this.ctx.secrets.delete(STORAGE_KEYS.accessToken);
        await this.ctx.secrets.delete(STORAGE_KEYS.apiKey);
        await this.ctx.globalState.update(STORAGE_KEYS.expiresAt, undefined);
        await this.ctx.globalState.update(STORAGE_KEYS.profile, undefined);
    }
}
