import { readText, writeText, exists } from "./fs";

export interface LineEdit {
    path: string;
    startLine: number;
    endLine?: number;
    replacement: string;
    mode: "replace" | "insert_before" | "insert_after";
}

export interface LineEditPreview {
    path: string;
    original: string;
    proposed: string;
    exists: boolean;
}

export async function previewLineEdit(
    edit: LineEdit
): Promise<LineEditPreview> {
    const ex = await exists(edit.path);
    const original = ex ? await readText(edit.path) : "";
    const lines = original.split("\n");

    const start = Math.max(1, edit.startLine) - 1;
    const end = Math.max(start, (edit.endLine ?? edit.startLine) - 1);
    const repl = edit.replacement.split("\n");

    let nextLines: string[];
    if (edit.mode === "replace") {
        nextLines = [
            ...lines.slice(0, start),
            ...repl,
            ...lines.slice(end + 1),
        ];
    } else if (edit.mode === "insert_before") {
        nextLines = [...lines.slice(0, start), ...repl, ...lines.slice(start)];
    } else {
        nextLines = [
            ...lines.slice(0, end + 1),
            ...repl,
            ...lines.slice(end + 1),
        ];
    }
    return {
        path: edit.path,
        original,
        proposed: nextLines.join("\n"),
        exists: ex,
    };
}
