import * as vscode from "vscode";
import { EventEmitter } from "vscode";
import { interactiveSignIn } from "./sauth";
import { CredentialStore, Profile } from "./storage";
import { SAUTH } from "../../core/config";
import { Logger } from "../../core/logger";

export class NoApiKeyError extends Error {
    constructor() {
        super("No active OnlySq API key. Create one in the dashboard.");
    }
}

export interface AuthState {
    signed: boolean;
    signingIn: boolean;
    error?: string;
    profile?: Profile;
}

export class AuthService {
    private resolving: Promise<string> | null = null;
    private signingIn = false;
    private hasToken = false;
    private lastError: string | undefined;

    private readonly _onChange = new EventEmitter<AuthState>();
    readonly onChange = this._onChange.event;

    constructor(private store: CredentialStore) {}

    get profile(): Profile | undefined {
        return this.store.loadProfile();
    }

    private snapshot(): AuthState {
        return {
            signed: this.hasToken,
            signingIn: this.signingIn,
            error: this.lastError,
            profile: this.profile,
        };
    }

    async getState(): Promise<AuthState> {
        this.hasToken = !!(await this.store.loadToken());
        return this.snapshot();
    }

    async isSignedIn(): Promise<boolean> {
        this.hasToken = !!(await this.store.loadToken());
        return this.hasToken;
    }

    async getApiKey(force = false): Promise<string> {
        if (!force) {
            const cached = await this.store.loadApiKey();
            if (cached) return cached;
        }
        this.resolving ??= this.resolveKey().finally(() => {
            this.resolving = null;
        });
        return this.resolving;
    }

    private async resolveKey(): Promise<string> {
        const access = await this.store.loadToken();
        if (!access) throw new Error("Not signed in");
        await this.fetchProfile(access).catch((e) =>
            Logger.error("profile fetch", e)
        );
        const key = await this.fetchActiveKey(access);
        await this.store.saveApiKey(key);
        this._onChange.fire(this.snapshot());
        return key;
    }

    private async fetchProfile(accessToken: string): Promise<void> {
        const r = await fetch(
            `${SAUTH.apiBase}/sauth/getinfo?scopes=${SAUTH.scopes.join(",")}`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );
        if (!r.ok) return;
        const body = (await r.json()) as any;
        const d = body?.data ?? {};
        await this.store.saveProfile({
            id: d.id,
            name: d.name,
            email: d.email,
            level: d.level,
            balance: d?.balance?.balance,
        });
    }

    private async fetchActiveKey(accessToken: string): Promise<string> {
        const r = await fetch(
            `${SAUTH.apiBase}/sauth/getinfo?scopes=ai.readKeys`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );
        if (!r.ok)
            throw new Error(`getinfo failed (${r.status}): ${await r.text()}`);
        const body = (await r.json()) as any;
        const keys: any[] = body?.data?.api_keys ?? [];
        const active = keys
            .filter(
                (k) => k?.key && String(k.status).toLowerCase() === "active"
            )
            .sort((a, b) => Number(b.id) - Number(a.id));
        if (!active.length) throw new NoApiKeyError();
        return String(active[0].key);
    }

    async init(): Promise<void> {
        this.hasToken = !!(await this.store.loadToken());
        Logger.log("[auth] init", this.snapshot());
        this._onChange.fire(this.snapshot());
    }

    async signIn(): Promise<void> {
        Logger.log("[auth] signIn() called, signingIn=", this.signingIn);
        if (this.signingIn) return;
        this.signingIn = true;
        this.lastError = undefined;
        this._onChange.fire(this.snapshot());
        Logger.log("[auth] fired signingIn=true", this.snapshot());

        try {
            await this.store.clear();
            this.hasToken = false;
            Logger.log("[auth] starting interactiveSignIn");
            const r = await interactiveSignIn();
            Logger.log(
                "[auth] got token, expires at",
                new Date(r.expiresAt).toISOString()
            );
            await this.store.saveToken(r.accessToken, r.expiresAt);
            this.hasToken = true;
            this._onChange.fire(this.snapshot());
            Logger.log("[auth] fired signed=true", this.snapshot());

            try {
                await this.getApiKey(true);
                Logger.log("[auth] api key resolved");
            } catch (e) {
                if (e instanceof NoApiKeyError) {
                    this.lastError = e.message;
                    Logger.log("[auth] no api key, prompting");
                    const c = await vscode.window.showWarningMessage(
                        e.message,
                        "Open dashboard"
                    );
                    if (c === "Open dashboard") {
                        await vscode.env.openExternal(
                            vscode.Uri.parse(SAUTH.dashboard)
                        );
                    }
                } else {
                    throw e;
                }
            }

            if (!this.lastError) {
                vscode.window.showInformationMessage(
                    `OnlySq CLI: signed in${
                        this.profile?.name ? ` as ${this.profile.name}` : ""
                    }`
                );
            }
        } catch (e: any) {
            this.lastError = String(e?.message ?? e);
            Logger.error("[auth] signIn failed", e);
            vscode.window.showErrorMessage(`OnlySq CLI: ${this.lastError}`);
        } finally {
            this.signingIn = false;
            this._onChange.fire(this.snapshot());
            Logger.log("[auth] fired final", this.snapshot());
        }
    }

    async signOut(): Promise<void> {
        await this.store.clear();
        this.hasToken = false;
        this.lastError = undefined;
        this._onChange.fire(this.snapshot());
        vscode.window.showInformationMessage("OnlySq CLI: signed out");
    }
}
