import { NextResponse } from "next/server";

type SSEOptions = {
  signal?: AbortSignal;
};

export type SSEStream = {
  send: (event: string, data: unknown) => Promise<void>;
  close: () => Promise<void>;
  response: (init?: ResponseInit) => NextResponse;
};

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export function createSSEStream(options: SSEOptions = {}): SSEStream {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  let closed = false;
  let chain: Promise<void> = Promise.resolve();
  let seq = 1;

  const enqueue = (fn: () => Promise<void>) => {
    chain = chain.then(fn).catch(() => {});
    return chain;
  };

  const write = async (chunk: string) => {
    if (closed) return;
    try {
      await writer.write(encoder.encode(chunk));
    } catch {
      closed = true;
    }
  };

  const heartbeat = setInterval(() => {
    void write(": ping\n\n");
  }, 20_000);

  const close = () =>
    enqueue(async () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      await writer.close().catch(() => {});
    });

  if (options.signal) {
    if (options.signal.aborted) {
      void close();
    } else {
      options.signal.addEventListener("abort", () => {
        void close();
      }, { once: true });
    }
  }

  const send = (event: string, data: unknown) =>
    enqueue(async () => {
      if (closed) return;
      const currentSeq = seq++;
      const shouldAttachSeq = event === "status" || event === "result" || event === "error" || event === "message";
      const enriched =
        shouldAttachSeq && data && typeof data === "object"
          ? { ...(data as Record<string, unknown>), seq: currentSeq }
          : shouldAttachSeq
          ? { data, seq: currentSeq }
          : data;
      const payload = typeof enriched === "string" ? enriched : JSON.stringify(enriched);
      const chunk = `event: ${event}\n` + `data: ${payload}\n\n`;
      await write(chunk);
    });

  const response = (init?: ResponseInit) => {
    const headers = new Headers(init?.headers);
    Object.entries(SSE_HEADERS).forEach(([key, value]) => headers.set(key, value));
    return new NextResponse(readable, { ...init, headers });
  };

  return { send, close, response };
}

