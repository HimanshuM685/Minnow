// Handles split UTF-8 chunks, CRLF, comments, and multiline SSE data.
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lines: string[] = [];
  function message(): unknown | undefined {
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    lines = [];
    if (!data || data === '[DONE]') return undefined;
    return JSON.parse(data);
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, '');
        buffer = buffer.slice(end + 1);
        if (line === '') {
          const data = message();
          if (data !== undefined) yield data;
        } else lines.push(line);
      }
      if (done) {
        if (buffer) lines.push(buffer.replace(/\r$/, ''));
        const data = message();
        if (data !== undefined) yield data;
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
