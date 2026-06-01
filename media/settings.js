(function () {
    "use strict";

    const vscode = acquireVsCodeApi();
    window.__vscode = vscode;

    function log() {
        try {
            const a = Array.prototype.slice.call(arguments);
            console.log.apply(console, ["[onlysq-settings]"].concat(a));
            vscode.postMessage({
                type: "__log",
                args: a.map(function (x) {
                    try {
                        return typeof x === "string" ? x : JSON.stringify(x);
                    } catch (e) {
                        return String(x);
                    }
                }),
            });
        } catch (e) {}
    }

    window.addEventListener("error", function (ev) {
        log("window.onerror", ev.message, ev.filename + ":" + ev.lineno);
    });

    log("script ready");

    document.querySelectorAll("button[data-cmd]").forEach(function (b) {
        b.addEventListener("click", function () {
            vscode.postMessage({ type: b.dataset.cmd });
        });
    });

    function row(label, value) {
        return (
            '<div class="row"><span class="k">' +
            label +
            '</span><span class="v">' +
            (value == null ? "—" : value) +
            "</span></div>"
        );
    }

    function render(state) {
        log("render", state);
        const body = document.getElementById("accountBody");
        const actions = document.getElementById("accountActions");

        if (state.signingIn) {
            body.innerHTML = '<div class="muted small">Opening browser…</div>';
            actions.innerHTML =
                '<button class="btn primary" disabled>Signing in…</button>';
            return;
        }

        if (!state.signed) {
            const err = state.error
                ? '<div class="muted small" style="color:var(--err);margin-bottom:6px">' +
                  state.error +
                  "</div>"
                : "";
            body.innerHTML =
                err + '<div class="muted small">Not signed in.</div>';
            actions.innerHTML =
                '<button class="btn primary" id="signIn">Auth with OnlySq</button>';
            document
                .getElementById("signIn")
                .addEventListener("click", function () {
                    vscode.postMessage({ type: "signIn" });
                });
            return;
        }

        body.innerHTML =
            row("Name", state.profile.name) +
            row("Email", state.profile.email) +
            row("User ID", state.profile.id) +
            row("Level", state.profile.level) +
            row(
                "Balance",
                state.profile.balance != null
                    ? "$" + state.profile.balance
                    : null
            );

        actions.innerHTML =
            '<button class="btn" id="refresh">Refresh</button>' +
            '<button class="btn ghost" id="signOut">Sign out</button>';
        document
            .getElementById("refresh")
            .addEventListener("click", function () {
                vscode.postMessage({ type: "refresh" });
            });
        document
            .getElementById("signOut")
            .addEventListener("click", function () {
                vscode.postMessage({ type: "signOut" });
            });
    }

    window.addEventListener("message", function (e) {
        if (e.data && e.data.type === "state") render(e.data);
    });

    vscode.postMessage({ type: "ready" });
})();
