import * as vscode from "vscode";

export function nonce(): string {
    return Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 36).toString(36)
    ).join("");
}

export interface WebviewBundle {
    webview: vscode.Webview;
    extensionUri: vscode.Uri;
    nonce: string;
    title: string;
    bodyHtml: string;
    scriptFile: string;
    cssFile?: string;
}

export function buildHtml(b: WebviewBundle): string {
    const csp = [
        `default-src 'none'`,
        `style-src ${b.webview.cspSource}`,
        `script-src 'nonce-${b.nonce}'`,
        `img-src ${b.webview.cspSource} data:`,
        `font-src ${b.webview.cspSource}`,
    ].join("; ");

    const mediaUri = (file: string) =>
        b.webview
            .asWebviewUri(vscode.Uri.joinPath(b.extensionUri, "media", file))
            .toString();

    const cssLink = b.cssFile
        ? `<link rel="stylesheet" href="${mediaUri(b.cssFile)}">`
        : "";

    return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${b.title}</title>
${cssLink}
</head>
<body>
${b.bodyHtml}
<script nonce="${b.nonce}" src="${mediaUri(b.scriptFile)}"></script>
</body></html>`;
}
