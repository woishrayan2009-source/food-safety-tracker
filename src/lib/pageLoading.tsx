import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type PageLoadingContextValue = {
  pendingCount: number;
  register: () => () => void;
};

export const PageLoadingContext = createContext<PageLoadingContextValue | null>(
  null
);

export function PageLoadingProvider({ children }: { children: React.ReactNode }) {
  const pendingOperations = useRef(new Set<number>());
  const nextOperationId = useRef(0);
  const [pendingCount, setPendingCount] = useState(0);

  const register = useCallback(() => {
    const operationId = nextOperationId.current++;
    pendingOperations.current.add(operationId);
    setPendingCount(pendingOperations.current.size);

    let released = false;
    return () => {
      if (released) return;
      released = true;

      if (pendingOperations.current.delete(operationId)) {
        setPendingCount(pendingOperations.current.size);
      }
    };
  }, []);

  return (
    <PageLoadingContext.Provider value={{ pendingCount, register }}>
      {children}
    </PageLoadingContext.Provider>
  );
}

export function usePageLoading() {
  const context = useContext(PageLoadingContext);
  if (!context) {
    throw new Error("usePageLoading must be used inside PageLoadingProvider");
  }

  const releaseRef = useRef<(() => void) | null>(null);
  const done = useCallback(() => {
    releaseRef.current?.();
    releaseRef.current = null;
  }, []);

  useEffect(() => {
    releaseRef.current = context.register();

    return () => {
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, [context.register]);

  return done;
}