import * as cp from "child_process";
import { root } from "./fs";

function run(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolveP, rejectP) => {
        const p = cp.spawn(cmd, args, { cwd: root().fsPath, shell: false });
        let out = "",
            err = "";
        p.stdout.on("data", (d) => (out += d.toString()));
        p.stderr.on("data", (d) => (err += d.toString()));
        p.on("close", (code) =>
            code === 0
                ? resolveP(out)
                : rejectP(new Error(err || `exit ${code}`))
        );
        p.on("error", rejectP);
    });
}

export async function gitStatus(): Promise<string> {
    try {
        return (
            (await run("git", ["status", "--short", "--branch"])).trim() ||
            "(clean)"
        );
    } catch (e: any) {
        return `Error: ${e.message}`;
    }
}

export async function gitDiff(path?: string): Promise<string> {
    try {
        const args = ["diff", "--no-color"];
        if (path) args.push("--", path);
        const out = await run("git", args);
        return out.trim().slice(0, 50_000) || "(no changes)";
    } catch (e: any) {
        return `Error: ${e.message}`;
    }
}
