import * as vscode from "vscode";

const TERMINAL_NAME = "OnlySq Agent";
let agentTerminal: vscode.Terminal | undefined;

export function getOrCreateTerminal(): vscode.Terminal {
    if (!agentTerminal || agentTerminal.exitStatus) {
        agentTerminal = vscode.window.createTerminal({ name: TERMINAL_NAME });
    }
    return agentTerminal;
}

export function runInTerminal(command: string, show = true): void {
    const t = getOrCreateTerminal();
    if (show) t.show(true);
    t.sendText(command, true);
}

export function disposeTerminal(): void {
    agentTerminal?.dispose();
    agentTerminal = undefined;
}
