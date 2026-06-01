import * as vscode from "vscode";
import * as http from "http";
import * as crypto from "crypto";
import { URL } from "url";
import { SAUTH } from "../../core/config";
import { BRAND } from "../../core/branding";

export interface AuthResult {
    accessToken: string;
    expiresAt: number;
}

export async function interactiveSignIn(): Promise<AuthResult> {
    const state = crypto.randomBytes(16).toString("hex");
    const { codePromise, close } = await listenCallback(state);
    try {
        const url = new URL(SAUTH.authPage);
        url.searchParams.set("appid", SAUTH.clientId);
        url.searchParams.set("redirect_uri", SAUTH.redirectUri);
        url.searchParams.set("scopes", SAUTH.scopes.join(","));
        url.searchParams.set("state", state);
        if (
            !(await vscode.env.openExternal(vscode.Uri.parse(url.toString())))
        ) {
            throw new Error("Failed to open browser");
        }
        return await exchange(await codePromise);
    } finally {
        close();
    }
}

async function exchange(code: string): Promise<AuthResult> {
    const r = await fetch(`${SAUTH.apiBase}/sauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            client_id: SAUTH.clientId,
            client_secret: SAUTH.clientSecret,
            code,
            redirect_uri: SAUTH.redirectUri,
        }),
    });
    if (!r.ok) {
        throw new Error(
            `Token exchange failed (${r.status}): ${await r.text()}`
        );
    }
    const d = (await r.json()) as { access_token: string; expires_in?: number };
    if (!d.access_token) {
        throw new Error("No access_token in response");
    }
    return {
        accessToken: d.access_token,
        expiresAt: Date.now() + (d.expires_in ?? 86400) * 1000,
    };
}

function listenCallback(
    expectedState: string
): Promise<{ codePromise: Promise<string>; close: () => void }> {
    return new Promise((resolve, reject) => {
        let resolveCode!: (v: string) => void;
        let rejectCode!: (e: Error) => void;
        const codePromise = new Promise<string>((res, rej) => {
            resolveCode = res;
            rejectCode = rej;
        });

        const server = http.createServer((req, res) => {
            const u = new URL(req.url ?? "/", `http://127.0.0.1:${SAUTH.port}`);
            if (u.pathname !== SAUTH.path) {
                res.statusCode = 404;
                res.end("not found");
                return;
            }

            const code = u.searchParams.get("code");
            const state = u.searchParams.get("state");
            const err = u.searchParams.get("error");
            res.setHeader("Content-Type", "text/html; charset=utf-8");

            if (err) {
                return finish(res, false, "Sign-in cancelled", err, () =>
                    rejectCode(new Error(err))
                );
            }
            if (!code || !state) {
                return finish(
                    res,
                    false,
                    "Sign-in failed",
                    "Missing code/state",
                    () => rejectCode(new Error("Missing code/state"))
                );
            }
            if (state !== expectedState) {
                return finish(
                    res,
                    false,
                    "Sign-in failed",
                    "State mismatch",
                    () => rejectCode(new Error("State mismatch"))
                );
            }
            finish(
                res,
                true,
                "Signed in to OnlySq CLI",
                "You can close this tab and return to VS Code.",
                () => resolveCode(code)
            );
        });

        const timer = setTimeout(() => {
            rejectCode(new Error("Auth timeout"));
            server.close();
        }, 5 * 60 * 1000);
        server.once("error", (e: NodeJS.ErrnoException) => {
            clearTimeout(timer);
            reject(
                e.code === "EADDRINUSE"
                    ? new Error(
                          `Port ${SAUTH.port} is busy. Close the conflicting process and retry.`
                      )
                    : e
            );
        });
        server.listen(SAUTH.port, "127.0.0.1", () => {
            resolve({
                codePromise,
                close: () => {
                    clearTimeout(timer);
                    server.close();
                },
            });
        });
    });
}

function finish(
    res: http.ServerResponse,
    ok: boolean,
    title: string,
    message: string,
    after: () => void
) {
    res.statusCode = ok ? 200 : 400;
    res.end(page(title, message, ok));
    after();
}

function page(title: string, message: string, ok: boolean): string {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { font: 14px/1.5 -apple-system, Segoe UI, sans-serif; margin: 0;
       background: ${BRAND.bg}; color: ${BRAND.fg};
       display: grid; place-items: center; min-height: 100vh; }
.card { background: ${BRAND.bgPanel}; padding: 40px 48px; border-radius: 10px;
        border: 1px solid ${BRAND.border};
        max-width: 440px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
.logo { font-weight: 800; font-size: 30px; letter-spacing: -0.8px; margin-bottom: 20px;
        display: inline-flex; align-items: baseline; }
.logo .sq { color: ${BRAND.accent}; }
.logo .dot { color: ${BRAND.accent}; margin-left: 1px; }
.status { font-size: 11px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase;
          color: ${ok ? BRAND.accent : BRAND.error}; margin-bottom: 12px; }
h1 { margin: 0 0 10px; font-size: 16px; font-weight: 600; }
p { margin: 0; color: ${BRAND.muted}; font-size: 13px; }
</style></head><body><div class="card">
<div class="logo"><span>Sq</span><span class="dot">.</span></div>
<div class="status">${ok ? "Signed in" : "Failed"}</div>
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>
</div></body></html>`;
}

function escapeHtml(s: string): string {
    const map: Record<string, string> = {
        "&": "&",
        "<": "<",
        ">": ">",
        '"': '"',
        "'": "'",
    };
    return s.replace(/[&<>"']/g, (c) => map[c]);
}
