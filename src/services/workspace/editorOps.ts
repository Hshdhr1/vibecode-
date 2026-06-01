import * as vscode from "vscode";
import { resolve } from "./fs";

export async function gotoLocation(
    path: string,
    line: number,
    column = 1,
    select?: { endLine: number; endColumn?: number }
): Promise<void> {
    const uri = resolve(path);
    const doc = await vscode.workspace.openTextDocument(uri);
    const ed = await vscode.window.showTextDocument(doc);
    const start = new vscode.Position(
        Math.max(0, line - 1),
        Math.max(0, column - 1)
    );
    const end = select
        ? new vscode.Position(
              Math.max(0, select.endLine - 1),
              Math.max(0, (select.endColumn ?? 1) - 1)
          )
        : start;
    ed.selection = new vscode.Selection(start, end);
    ed.revealRange(
        new vscode.Range(start, end),
        vscode.TextEditorRevealType.InCenter
    );
}

export async function getCursor(): Promise<{
    file: string;
    line: number;
    column: number;
    selection: string;
} | null> {
    const ed = vscode.window.activeTextEditor;
    if (!ed) return null;
    const sel = ed.selection;
    return {
        file: vscode.workspace.asRelativePath(ed.document.uri, false),
        line: sel.active.line + 1,
        column: sel.active.character + 1,
        selection: sel.isEmpty ? "" : ed.document.getText(sel),
    };
}
