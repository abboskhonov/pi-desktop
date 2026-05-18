import * as React from "react";

const STREAMING_TIMEOUT_MS = 60_000; // Auto-clear streaming if no token for 60s

type SessionActivity = {
  isStreaming: boolean;
  hasNewContent: boolean;
  lastTokenAt: number;
};

const store = new Map<string, SessionActivity>();
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function notify() {
  listeners.forEach((cb) => cb());
}

function clearTimer(sessionPath: string) {
  const t = timers.get(sessionPath);
  if (t) {
    clearTimeout(t);
    timers.delete(sessionPath);
  }
}

function startTimer(sessionPath: string) {
  clearTimer(sessionPath);
  timers.set(
    sessionPath,
    setTimeout(() => {
      const current = store.get(sessionPath);
      if (current?.isStreaming) {
        current.isStreaming = false;
        current.hasNewContent = true;
        store.set(sessionPath, current);
        notify();
      }
      timers.delete(sessionPath);
    }, STREAMING_TIMEOUT_MS)
  );
}

export function touchSessionToken(sessionPath: string) {
  const current = store.get(sessionPath) || {
    isStreaming: false,
    hasNewContent: false,
    lastTokenAt: 0,
  };
  current.lastTokenAt = Date.now();
  store.set(sessionPath, current);

  // Reset the safety timeout so it doesn't fire while tokens are still arriving.
  if (current.isStreaming) {
    startTimer(sessionPath);
  }
}

export function setSessionStreaming(sessionPath: string, streaming: boolean) {
  const current = store.get(sessionPath) || {
    isStreaming: false,
    hasNewContent: false,
    lastTokenAt: 0,
  };
  if (current.isStreaming === streaming) return;

  current.isStreaming = streaming;
  if (!streaming) {
    current.hasNewContent = true;
    clearTimer(sessionPath);
  } else {
    current.lastTokenAt = Date.now();
    startTimer(sessionPath);
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
  return (
    store.get(sessionPath) || {
      isStreaming: false,
      hasNewContent: false,
      lastTokenAt: 0,
    }
  );
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
