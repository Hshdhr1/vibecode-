import * as vscode from "vscode";

export class Logger {
    private static channel: vscode.OutputChannel | undefined;

    static init(name: string): void {
        this.channel ??= vscode.window.createOutputChannel(name);
    }
    static log(...args: unknown[]): void {
        const line = `[${new Date().toISOString()}] ${args
            .map(format)
            .join(" ")}`;
        this.channel?.appendLine(line);
    }
    static error(prefix: string, e: unknown): void {
        this.log(prefix, e instanceof Error ? `${e.message}\n${e.stack}` : e);
    }
    static show(): void {
        this.channel?.show(true);
    }
}

function format(v: unknown): string {
    if (typeof v === "string") {
        return v;
    }
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}
