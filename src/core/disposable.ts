import * as vscode from "vscode";

export class DisposableStore implements vscode.Disposable {
    private items: vscode.Disposable[] = [];
    add<T extends vscode.Disposable>(d: T): T {
        this.items.push(d);
        return d;
    }
    dispose(): void {
        for (const d of this.items.splice(0)) {
            try {
                d.dispose();
            } catch {
                /* */
            }
        }
    }
}
