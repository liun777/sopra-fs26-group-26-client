// Change to redirect to dashboard if already logged in (check local storage)
// or redirect to login

"use client";

import { Spin } from "antd";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

function readStoredToken(): string {
  const raw = globalThis.localStorage.getItem("token");
  if (!raw) {
    return "";
  }
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? parsed.trim() : "";
  } catch {
    return raw.trim();
  }
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = readStoredToken();
    router.replace(token ? "/dashboard" : "/login");
  }, [router]);

  return (
    <div className="cabo-background">
      <div className="login-container">
        <Spin size="large" />
      </div>
    </div>
  );
}
