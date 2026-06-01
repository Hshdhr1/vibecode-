import * as vscode from "vscode";
import { ToolHandler } from "./toolRegistry";
import {
    listDir,
    listTree,
    readText,
    searchText,
    findFiles,
    exists,
    stat,
    deleteFile,
    renameFile,
    resolve,
    rel as toRel,
    getDiagnostics,
} from "../../services/workspace/fs";
import { createProposal, showDiff } from "../../services/workspace/diffPreview";
import { runInTerminal } from "../../services/workspace/terminal";
import { applyUnifiedDiff } from "../../services/workspace/patch";
import { previewLineEdit, LineEdit } from "../../services/workspace/lineEdit";
import { gotoLocation, getCursor } from "../../services/workspace/editorOps";
import { gitStatus, gitDiff } from "../../services/workspace/git";
import { listTasks, runTaskByName } from "../../services/workspace/tasks";
import {
    executeShell,
    formatShellResult,
} from "../../services/workspace/shell";
import { systemInfo, osOpenCommand } from "../../core/systemInfo";
import { askApproval } from "./approval";

const obj = (props: Record<string, any>, required: string[] = []) => ({
    type: "object",
    properties: props,
    required,
});
const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });
const arr = (items: any, description: string) => ({
    type: "array",
    items,
    description,
});

export const builtinTools: ToolHandler[] = [
    {
        def: {
            type: "function",
            function: {
                name: "read_file",
                description: "Read a UTF-8 file (truncated to 200KB).",
                parameters: obj({ path: str("Workspace-relative path") }, [
                    "path",
                ]),
            },
        },
        run: async ({ path }: { path: string }) => readText(path),
    },
    {
        def: {
            type: "function",
            function: {
                name: "list_dir",
                description: "List entries in a directory (one level).",
                parameters: obj({ path: str('Default ".".') }),
            },
        },
        run: async ({ path }: { path?: string }) => {
            const items = await listDir(path ?? ".");
            return (
                items
                    .map((i) => `${i.kind === "dir" ? "d" : "f"} ${i.name}`)
                    .join("\n") || "(empty)"
            );
        },
    },
    {
        def: {
            type: "function",
            function: {
                name: "list_tree",
                description: "Recursive tree (limited).",
                parameters: obj({
                    path: str('Root, default ".".'),
                    max_depth: num("Default 3"),
                    max_items: num("Default 200"),
                }),
            },
        },
        run: async (a: any) =>
            (
                await listTree(
                    a.path ?? ".",
                    a.max_depth ?? 3,
                    a.max_items ?? 200
                )
            ).join("\n") || "(empty)",
    },
    {
        def: {
            type: "function",
            function: {
                name: "search",
                description: "Regex search across files.",
                parameters: obj(
                    {
                        pattern: str("JS regex"),
                        glob: str("Default **/*"),
                        limit: num("Default 50"),
                    },
                    ["pattern"]
                ),
            },
        },
        run: async (a: any) =>
            (await searchText(a.pattern, a.glob ?? "**/*", a.limit ?? 50)).join(
                "\n"
            ) || "(no matches)",
    },
    {
        def: {
            type: "function",
            function: {
                name: "find_files",
                description: "Glob-based file search.",
                parameters: obj(
                    { glob: str('e.g. "**/*.ts"'), limit: num("Default 100") },
                    ["glob"]
                ),
            },
        },
        run: async (a: any) =>
            (await findFiles(a.glob, a.limit ?? 100)).join("\n") ||
            "(no files)",
    },
    {
        def: {
            type: "function",
            function: {
                name: "file_info",
                description: "Path metadata.",
                parameters: obj({ path: str("") }, ["path"]),
            },
        },
        run: async ({ path }: { path: string }) => {
            const s = await stat(path);
            if (!s) return JSON.stringify({ path, exists: false });
            return JSON.stringify(
                {
                    path,
                    exists: true,
                    kind: s.type === vscode.FileType.Directory ? "dir" : "file",
                    size: s.size,
                    mtime: new Date(s.mtime).toISOString(),
                },
                null,
                2
            );
        },
    },

    {
        def: {
            type: "function",
            function: {
                name: "propose_edit",
                description:
                    "Propose creating or fully overwriting a file. Opens diff with Apply/Reject in chat.",
                parameters: obj(
                    {
                        path: str(""),
                        content: str("Full new file content"),
                        reason: str("Why (shown to user)"),
                    },
                    ["path", "content"]
                ),
            },
        },
        run: async (a: any, ctx) => {
            const proposal = await createProposal({
                id: ctx.callId,
                path: a.path,
                newContent: String(a.content ?? ""),
                reason: a.reason ? String(a.reason) : undefined,
            });
            void showDiff(proposal.id);
            const head = `Proposed change to ${a.path}. Awaiting user review.`;
            return a.reason ? `${head}\nReason: ${a.reason}` : head;
        },
    },
    {
        def: {
            type: "function",
            function: {
                name: "patch_file",
                description:
                    "Apply a unified diff (with @@ hunks) to an existing file. Use for medium-sized changes across multiple non-adjacent regions. The user reviews a native diff with Apply/Reject buttons. For brand-new files or rewrites use propose_edit instead.",
                parameters: obj(
                    {
                        path: str("Workspace-relative path"),
                        diff: str(
                            'Unified diff text including @@ hunk headers. Lines start with " ", "+", or "-".'
                        ),
                        reason: str("Short summary shown to the user"),
                    },
                    ["path", "diff"]
                ),
            },
        },
        run: async (a: any, ctx) => {
            try {
                const preview = await applyUnifiedDiff(
                    String(a.path),
                    String(a.diff)
                );
                const proposal = await createProposal({
                    id: ctx.callId,
                    path: String(a.path),
                    newContent: preview.proposed,
                    reason: a.reason ? String(a.reason) : "Unified diff patch",
                });
                void showDiff(proposal.id);
                return `Proposed patch to ${a.path}. Awaiting user review.`;
            } catch (e: any) {
                return `Error: ${e?.message ?? e}`;
            }
        },
    },
    {
        def: {
            type: "function",
            function: {
                name: "apply_at_line",
                description:
                    "Modify a specific range of lines in a file. Use this for small, targeted edits. The user reviews a native diff with Apply/Reject buttons. " +
                    "CRITICAL: line numbers are 1-based and refer to the current file state. ALWAYS call read_file first to get correct line numbers. " +
                    "You MUST provide expected_lines — the exact text currently on those lines — so the tool can verify you are not editing stale content. " +
                    "If expected_lines do not match, you will get an error and must re-read the file.",
                parameters: obj(
                    {
                        path: str("Workspace-relative path"),
                        start_line: num("First line of the range, 1-based"),
                        end_line: num(
                            "Last line, inclusive. Defaults to start_line. Ignored for insert_before/insert_after."
                        ),
                        replacement: str(
                            "Text to insert or replace with (can span multiple lines, no trailing newline)"
                        ),
                        mode: {
                            type: "string",
                            enum: ["replace", "insert_before", "insert_after"],
                            description: 'Default "replace"',
                        },
                        expected_lines: arr(
                            str(""),
                            "REQUIRED. The exact current content of lines [start_line .. end_line], one element per line, as a verification anchor."
                        ),
                        reason: str("Short summary shown to the user"),
                    },
                    ["path", "start_line", "replacement", "expected_lines"]
                ),
            },
        },
        run: async (a: any, ctx) => {
            try {
                const edit: LineEdit = {
                    path: String(a.path),
                    startLine: Number(a.start_line),
                    endLine:
                        a.end_line != null ? Number(a.end_line) : undefined,
                    replacement: String(a.replacement ?? ""),
                    mode:
                        a.mode === "insert_before" || a.mode === "insert_after"
                            ? a.mode
                            : "replace",
                    expectedLines: Array.isArray(a.expected_lines)
                        ? a.expected_lines.map((x: any) => String(x))
                        : undefined,
                };
                if (!Number.isFinite(edit.startLine) || edit.startLine < 1) {
                    return "Error: start_line must be a positive integer (1-based)";
                }
                if (!edit.expectedLines || !edit.expectedLines.length) {
                    return "Error: expected_lines is required. Call read_file first, then provide the exact current content of the target lines.";
                }
                const preview = await previewLineEdit(edit);
                const proposal = await createProposal({
                    id: ctx.callId,
                    path: edit.path,
                    newContent: preview.proposed,
                    reason: a.reason
                        ? String(a.reason)
                        : `${edit.mode} lines ${edit.startLine}${
                              edit.endLine ? `-${edit.endLine}` : ""
                          }`,
                });
                void showDiff(proposal.id);
                return `Proposed ${edit.mode} at ${edit.path}:${edit.startLine}. Awaiting user review.\n\nReplaced content:\n${preview.originalRange}`;
            } catch (e: any) {
                return `Error: ${e?.message ?? e}`;
            }
        },
    },

    {
        def: {
            type: "function",
            function: {
                name: "delete_file",
                description: "Move file/folder to trash.",
                parameters: obj({ path: str("") }, ["path"]),
            },
        },
        run: async ({ path }: { path: string }) => {
            if (
                !(await askApproval(
                    "delete",
                    `OnlySq agent wants to delete ${path}. Allow?`
                ))
            )
                return "User denied delete";
            await deleteFile(path);
            return `Deleted ${path}`;
        },
    },
    {
        def: {
            type: "function",
            function: {
                name: "rename_file",
                description: "Rename / move file.",
                parameters: obj({ from: str(""), to: str("") }, ["from", "to"]),
            },
        },
        run: async ({ from, to }: { from: string; to: string }) => {
            if (
                !(await askApproval(
                    "rename",
                    `OnlySq agent wants to rename ${from} -> ${to}. Allow?`
                ))
            )
                return "User denied rename";
            if (await exists(to)) return `Target already exists: ${to}`;
            await renameFile(from, to);
            return `Renamed ${from} -> ${to}`;
        },
    },

    {
        def: {
            type: "function",
            function: {
                name: "open_file",
                description:
                    "Open a file in the editor; optionally reveal a line.",
                parameters: obj(
                    { path: str(""), line: num("Optional 1-based") },
                    ["path"]
                ),
            },
        },
        run: async ({ path, line }: { path: string; line?: number }) => {
            await gotoLocation(path, line ?? 1, 1);
            return `Opened ${path}${line ? `:${line}` : ""}`;
        },
    },
    {
        def: {
            type: "function",
            function: {
                name: "goto_position",
                description:
                    "Place the cursor at a specific position or select a range.",
                parameters: obj(
                    {
                        path: str(""),
                        line: num("1-based"),
                        column: num("1-based, default 1"),
                        end_line: num("Optional for selection"),
                        end_column: num("Optional, default 1"),
                    },
                    ["path", "line"]
                ),
            },
        },
        run: async (a: any) => {
            const sel =
                a.end_line != null
                    ? {
                          endLine: Number(a.end_line),
                          endColumn: a.end_column ?? 1,
                      }
                    : undefined;
            await gotoLocation(a.path, Number(a.line), a.column ?? 1, sel);
            return sel
                ? `Selected ${a.path}:${a.line}:${a.column ?? 1} → ${
                      a.end_line
                  }:${a.end_column ?? 1}`
                : `Cursor at ${a.path}:${a.line}:${a.column ?? 1}`;
        },
    },
    {
        def: {
            type: "function",
            function: {
                name: "get_cursor",
                description: "Current cursor position and selection.",
                parameters: obj({}),
            },
        },
        run: async () => {
            const c = await getCursor();
            return c ? JSON.stringify(c, null, 2) : "(no active editor)";
        },
    },
    {
        def: {
            type: "function",
            function: {
                name: "get_selection",
                description: "Current selection or active file content.",
                parameters: obj({}),
            },
        },
        run: async () => {
            const ed = vscode.window.activeTextEditor;
            if (!ed) return "(no active editor)";
            const sel = ed.selection;
            const text = ed.document.getText(sel.isEmpty ? undefined : sel);
            return JSON.stringify(
                {
                    file: toRel(ed.document.uri),
                    language: ed.document.languageId,
                    selection: sel.isEmpty
                        ? null
                        : {
                              start: {
                                  line: sel.start.line + 1,
                                  char: sel.start.character,
                              },
                              end: {
                                  line: sel.end.line + 1,
                                  char: sel.end.character,
                              },
                          },
                    text: text.slice(0, 50_000),
                },
                null,
                2
            );
        },
    },
    {
        def: {
            type: "function",
            function: {
                name: "list_open_files",
                description: "List currently open editor tabs.",
                parameters: obj({}),
            },
        },
        run: async () => {
            const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
            const out: string[] = [];
            for (const t of tabs) {
                const input: any = t.input;
                if (input?.uri instanceof vscode.Uri)
                    out.push(toRel(input.uri));
            }
            return out.length ? out.join("\n") : "(no open editors)";
        },
    },
    {
        def: {
            type: "function",
            function: {
                name: "get_diagnostics",
                description: "Errors / warnings from language servers.",
                parameters: obj({ path_filter: str("") }),
            },
        },
        run: async ({ path_filter }: { path_filter?: string }) => {
            const d = getDiagnostics(path_filter);
            if (!d.length) return "(no diagnostics)";
            return d
                .slice(0, 100)
                .map(
                    (x) =>
                        `${x.file}:${x.line}:${x.column} [${x.severity}]${
                            x.source ? ` (${x.source})` : ""
                        } ${x.message}`
                )
                .join("\n");
        },
    },

    {
        def: {
            type: "function",
            function: {
                name: "run_command",
                description:
                    "Run a shell command and capture its full stdout/stderr. Best for builds, tests, scripts. Times out after 30s. Use the user's native shell — chain operators differ per OS (see system context).",
                parameters: obj(
                    {
                        command: str("Shell command to execute"),
                        cwd: str("Optional relative working directory"),
                        timeout_ms: num(
                            "Optional timeout, default 30000, max 120000"
                        ),
                    },
                    ["command"]
                ),
            },
        },
        run: async (a: any) => {
            if (!(await askApproval("shell", `Run: ${a.command}`)))
                return "User denied command";
            const timeout = Math.min(
                Math.max(1000, Number(a.timeout_ms) || 30_000),
                120_000
            );
            const r = await executeShell(String(a.command), {
                cwd: a.cwd,
                timeoutMs: timeout,
            });
            return formatShellResult(r);
        },
    },
    {
        def: {
            type: "function",
            function: {
                name: "run_command_interactive",
                description:
                    "Run a long-running command in the OnlySq Agent terminal (e.g. dev server). User sees output live; this tool returns immediately without capturing output. Use for `npm run dev`, watchers, etc.",
                parameters: obj(
                    {
                        command: str(""),
                        cwd: str("Optional relative cwd"),
                    },
                    ["command"]
                ),
            },
        },
        run: async (a: any) => {
            if (
                !(await askApproval("shell", `Start in terminal: ${a.command}`))
            )
                return "User denied command";
            const { runInTerminal } = await import(
                "../../services/workspace/terminal"
            );
            const full = a.cwd ? `cd "${a.cwd}" && ${a.command}` : a.command;
            runInTerminal(full, true);
            return `Started in terminal: ${a.command}`;
        },
    },
    {
        def: {
            type: "function",
            function: {
                name: "open_in_browser",
                description:
                    "Open a local file or URL in the default browser using the correct OS command.",
                parameters: obj(
                    {
                        target: str("File path (workspace-relative) or URL"),
                    },
                    ["target"]
                ),
            },
        },
        run: async ({ target }: { target: string }) => {
            const isUrl = /^https?:\/\//i.test(target);
            if (isUrl) {
                await vscode.env.openExternal(vscode.Uri.parse(target));
                return `Opened URL: ${target}`;
            }
            const uri = resolve(target);
            await vscode.env.openExternal(uri);
            return `Opened: ${target}`;
        },
    },
    {
        def: {
            type: "function",
            function: {
                name: "system_info",
                description:
                    "Get host OS, shell, VS Code and workspace context.",
                parameters: obj({}),
            },
        },
        run: async () => {
            const s = systemInfo();
            return JSON.stringify(s, null, 2);
        },
    },
    {
        def: {
            type: "function",
            function: {
                name: "list_tasks",
                description: "List VS Code tasks declared in tasks.json.",
                parameters: obj({}),
            },
        },
        run: async () => {
            const tasks = await listTasks();
            return tasks.length
                ? tasks.map((t) => `${t.name} [${t.source}]`).join("\n")
                : "(no tasks)";
        },
    },
    {
        def: {
            type: "function",
            function: {
                name: "run_task",
                description: "Run a VS Code task by name.",
                parameters: obj({ name: str("Task name") }, ["name"]),
            },
        },
        run: async ({ name }: { name: string }) => {
            if (!(await askApproval("shell", `Run task "${name}"?`)))
                return "User denied task";
            return runTaskByName(name);
        },
    },

    {
        def: {
            type: "function",
            function: {
                name: "git_status",
                description: "git status --short --branch",
                parameters: obj({}),
            },
        },
        run: async () => gitStatus(),
    },
    {
        def: {
            type: "function",
            function: {
                name: "git_diff",
                description:
                    "git diff for the workspace, optionally a single path.",
                parameters: obj({ path: str("Optional") }),
            },
        },
        run: async ({ path }: { path?: string }) => gitDiff(path),
    },

    {
        def: {
            type: "function",
            function: {
                name: "workspace_info",
                description: "Workspace folders, active file, language.",
                parameters: obj({}),
            },
        },
        run: async () => {
            const folders = (vscode.workspace.workspaceFolders ?? []).map(
                (f) => f.uri.fsPath
            );
            const ed = vscode.window.activeTextEditor;
            return JSON.stringify(
                {
                    folders,
                    activeFile: ed ? toRel(ed.document.uri) : null,
                    language: ed?.document.languageId ?? null,
                    lineCount: ed?.document.lineCount ?? null,
                },
                null,
                2
            );
        },
    },
    {
        def: {
            type: "function",
            function: {
                name: "run_vscode_command",
                description: "Run any VS Code command by id.",
                parameters: obj(
                    { command: str(""), args: arr({}, "Optional args") },
                    ["command"]
                ),
            },
        },
        run: async ({ command, args }: { command: string; args?: any[] }) => {
            if (
                !(await askApproval(
                    "vscodeCommand",
                    `Run VS Code command "${command}"?`
                ))
            ) {
                return "User denied command";
            }
            const r = await vscode.commands.executeCommand(
                command,
                ...(args ?? [])
            );
            try {
                return JSON.stringify(r ?? null);
            } catch {
                return String(r);
            }
        },
    },
];
