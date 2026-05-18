import * as React from "react";

type SessionActivity = {
  isStreaming: boolean;
  hasNewContent: boolean;
};

const store = new Map<string, SessionActivity>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
}

export function setSessionStreaming(sessionPath: string, streaming: boolean) {
  const current = store.get(sessionPath) || { isStreaming: false, hasNewContent: false };
  if (current.isStreaming === streaming) return;

  current.isStreaming = streaming;
  if (!streaming) {
    current.hasNewContent = true;
  }
  store.set(sessionPath, current);
  notify();
}

export function markSessionViewed(sessionPath: string) {
  const current = store.get(sessionPath);
  if (current) {
    current.hasNewContent = false;
    notify();
  }
}

export function getSessionActivity(sessionPath: string): SessionActivity {
  return store.get(sessionPath) || { isStreaming: false, hasNewContent: false };
}

export function useSessionActivity(sessionPath: string): SessionActivity {
  const [activity, setActivity] = React.useState<SessionActivity>(() =>
    getSessionActivity(sessionPath)
  );

  React.useEffect(() => {
    const update = () => setActivity(getSessionActivity(sessionPath));
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, [sessionPath]);

  return activity;
}
