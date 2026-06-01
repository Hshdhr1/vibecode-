import * as vscode from "vscode";

export interface CompletionContext {
    language: string;
    fileName: string;
    before: string;
    after: string;
    currentLine: string;
    cursorOffset: number;
}

export function buildContext(
    doc: vscode.TextDocument,
    pos: vscode.Position,
    linesBefore: number,
    linesAfter: number
): CompletionContext {
    const startLine = Math.max(0, pos.line - linesBefore);
    const endLine = Math.min(doc.lineCount - 1, pos.line + linesAfter);

    const before = doc.getText(
        new vscode.Range(new vscode.Position(startLine, 0), pos)
    );
    const after = doc.getText(
        new vscode.Range(pos, doc.lineAt(endLine).range.end)
    );

    return {
        language: doc.languageId,
        fileName: doc.fileName,
        before,
        after,
        currentLine: doc.lineAt(pos.line).text,
        cursorOffset: pos.character,
    };
}

export function shouldSkip(ctx: CompletionContext): boolean {
    const trimmed = ctx.currentLine.trim();
    const charAfter = ctx.currentLine[ctx.cursorOffset] ?? "";
    if (/\w/.test(charAfter)) {
        return true;
    }
    if (!trimmed && !ctx.before.trim()) {
        return true;
    }
    return false;
}
