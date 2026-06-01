import { Logger } from "../../core/logger";

const READ_ONLY_TOOLS = new Set([
    "read_file",
    "list_dir",
    "list_tree",
    "search",
    "find_files",
    "file_info",
    "list_open_files",
    "get_diagnostics",
    "workspace_info",
    "git_status",
    "git_diff",
]);

export class ToolCache {
    private map = new Map<string, string>();
    constructor(private enabled: boolean) {}

    has(name: string): boolean {
        return this.enabled && READ_ONLY_TOOLS.has(name);
    }
    key(name: string, args: any): string {
        return name + ":" + JSON.stringify(args ?? {});
    }
    get(name: string, args: any): string | undefined {
        if (!this.has(name)) return;
        const k = this.key(name, args);
        const v = this.map.get(k);
        if (v !== undefined) Logger.log("[cache] hit", name, k.length);
        return v;
    }
    set(name: string, args: any, value: string): void {
        if (!this.has(name)) return;
        this.map.set(this.key(name, args), value);
    }
}
