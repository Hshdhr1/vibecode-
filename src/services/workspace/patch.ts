import { readText, exists } from "./fs";

interface Hunk {
    oldStart: number;
    lines: string[];
}

export interface PatchPreview {
    path: string;
    proposed: string;
    exists: boolean;
}

export async function applyUnifiedDiff(
    path: string,
    diff: string
): Promise<PatchPreview> {
    const ex = await exists(path);
    const original = ex ? await readText(path) : "";
    const hunks = parseHunks(diff);
    if (!hunks.length) throw new Error("No @@ hunks found in diff");
    const proposed = applyHunks(original, hunks);
    return { path, proposed, exists: ex };
}

function parseHunks(diff: string): Hunk[] {
    const lines = diff.split("\n");
    const hunks: Hunk[] = [];
    let cur: Hunk | null = null;
    for (const line of lines) {
        const m = line.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
        if (m) {
            if (cur) hunks.push(cur);
            cur = { oldStart: parseInt(m[1], 10), lines: [] };
            continue;
        }
        if (!cur) continue;
        if (
            line.startsWith("---") ||
            line.startsWith("+++") ||
            line.startsWith("diff ") ||
            line.startsWith("index ")
        )
            continue;
        cur.lines.push(line);
    }
    if (cur) hunks.push(cur);
    return hunks;
}

function applyHunks(original: string, hunks: Hunk[]): string {
    const src = original.split("\n");
    const out: string[] = [];
    let cursor = 0;
    for (const h of hunks) {
        const target = Math.max(0, h.oldStart - 1);
        while (cursor < target && cursor < src.length) out.push(src[cursor++]);
        for (const ln of h.lines) {
            if (ln.startsWith("+")) out.push(ln.slice(1));
            else if (ln.startsWith("-")) cursor++;
            else if (ln.startsWith(" ")) {
                if (cursor < src.length) out.push(src[cursor]);
                cursor++;
            }
        }
    }
    while (cursor < src.length) out.push(src[cursor++]);
    return out.join("\n");
}
