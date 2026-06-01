import * as vscode from "vscode";

export async function listTasks(): Promise<vscode.Task[]> {
    return vscode.tasks.fetchTasks();
}

export async function runTaskByName(name: string): Promise<string> {
    const tasks = await listTasks();
    const t = tasks.find((x) => x.name === name);
    if (!t) return `Task "${name}" not found`;
    await vscode.tasks.executeTask(t);
    return `Started task: ${name}`;
}
