export async function* parseSSE(
    body: ReadableStream<Uint8Array>
): AsyncGenerator<any> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const raw of lines) {
                const line = raw.trim();
                if (!line.startsWith("data:")) {
                    continue;
                }
                const payload = line.slice(5).trim();
                if (!payload) {
                    continue;
                }
                if (payload === "[DONE]") {
                    return;
                }
                try {
                    yield JSON.parse(payload);
                } catch {
                    /* skip */
                }
            }
        }
    } finally {
        try {
            reader.releaseLock();
        } catch {
            /* */
        }
    }
}
