export interface WorkerProgressEvent {
  type: 'progress';
  percent: number;
  current?: number;
  total?: number;
  label?: string;
}

export interface WorkerResultEvent<TResult> {
  type: 'result';
  data: TResult;
}

export interface WorkerErrorEvent {
  type: 'error';
  code?: string;
  message: string;
}

export type WorkerOutboundMessage<TResult> =
  | WorkerProgressEvent
  | WorkerResultEvent<TResult>
  | WorkerErrorEvent;

export interface RunWorkerOptions {
  transfer?: Transferable[];
  signal?: AbortSignal;
  onProgress?: (event: WorkerProgressEvent) => void;
}

/**
 * Executes a single typed request against a Web Worker factory,
 * forwarding progress updates and cleanly terminating the worker on completion or abort.
 */
export function runWorkerTask<TPayload, TResult>(
  createWorker: () => Worker,
  payload: TPayload,
  options: RunWorkerOptions = {},
): Promise<TResult> {
  const { transfer = [], signal, onProgress } = options;

  return new Promise<TResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Task aborted by user', 'AbortError'));
      return;
    }

    const worker = createWorker();
    let settled = false;

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', handleAbort);
      }
      worker.terminate();
    };

    const handleAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('Task aborted by user', 'AbortError'));
    };

    if (signal) {
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    worker.onmessage = (event: MessageEvent<WorkerOutboundMessage<TResult>>) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'progress') {
        onProgress?.(msg);
        return;
      }

      if (msg.type === 'result') {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(msg.data);
        return;
      }

      if (msg.type === 'error') {
        if (settled) return;
        settled = true;
        cleanup();
        const err = new Error(msg.message) as Error & { code?: string };
        err.code = msg.code;
        reject(err);
      }
    };

    worker.onerror = (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(event.message || 'Web Worker encountered an unexpected error.'));
    };

    worker.postMessage(payload, transfer);
  });
}
