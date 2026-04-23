"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import CardShuffleLoader from "./CardShuffleLoader";

const LOADER_MIN_VISIBLE_MS = 1100;

export default function PageTransitionLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);

  const routeKey = useMemo(
    () => `${pathname ?? ""}?${searchParams?.toString() ?? ""}`,
    [pathname, searchParams],
  );

  const previousRouteRef = useRef<string>(routeKey);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      previousRouteRef.current = routeKey;
      return;
    }

    if (previousRouteRef.current === routeKey) {
      return;
    }

    previousRouteRef.current = routeKey;
    setVisible(true);

    const timeoutId = window.setTimeout(() => {
      setVisible(false);
    }, LOADER_MIN_VISIBLE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [routeKey]);

  if (!visible) {
    return null;
  }

  return (
    <div className="page-transition-loader-overlay">
      <CardShuffleLoader />
    </div>
  );
}
