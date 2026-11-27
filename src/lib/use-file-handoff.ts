import { useEffect, useRef, useState } from 'react';
import {
  consumeHandoffFiles,
  readHandoffParam,
  stripHandoffParamFromUrl,
  type ConsumedHandoff,
  type HandoffMeta,
} from './file-handoff';

// Shared promise cache so React StrictMode double-mounts reuse the same one-shot consume
const inFlightConsumes = new Map<string, Promise<ConsumedHandoff | null>>();

function getOrStartConsume(id: string): Promise<ConsumedHandoff | null> {
  const existing = inFlightConsumes.get(id);
  if (existing) return existing;

  const promise = consumeHandoffFiles(id);
  inFlightConsumes.set(id, promise);
  return promise;
}

export interface UseFileHandoffResult {
  handoffSource: string | null;
  handoffMeta: HandoffMeta | undefined;
  isLoadingHandoff: boolean;
  dismissHandoffNotice: () => void;
}

export function useFileHandoff(
  onFilesReceived: (
    files: File[],
    sourceRoute: string,
    meta?: HandoffMeta,
  ) => void | Promise<void>,
): UseFileHandoffResult {
  const [handoffSource, setHandoffSource] = useState<string | null>(null);
  const [handoffMeta, setHandoffMeta] = useState<HandoffMeta | undefined>(undefined);
  const [isLoadingHandoff, setIsLoadingHandoff] = useState(false);

  const callbackRef = useRef(onFilesReceived);
  callbackRef.current = onFilesReceived;

  useEffect(() => {
    const id = readHandoffParam();
    if (!id) return;

    let cancelled = false;
    setIsLoadingHandoff(true);

    void getOrStartConsume(id)
      .then(async (result) => {
        if (cancelled) return;
        stripHandoffParamFromUrl();
        inFlightConsumes.delete(id);

        if (result && result.files.length > 0) {
          setHandoffSource(result.sourceRoute);
          setHandoffMeta(result.meta);
          await callbackRef.current(result.files, result.sourceRoute, result.meta);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingHandoff(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    handoffSource,
    handoffMeta,
    isLoadingHandoff,
    dismissHandoffNotice: () => setHandoffSource(null),
  };
}
