"use client";

import { Spin } from "antd";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { User } from "@/types/user";

export default function Home() {
  const router = useRouter();
  const apiService = useApi();
  const { value: token, clear: clearToken } = useLocalStorage<string>("token", "");
  const { value: userId, clear: clearUserId } = useLocalStorage<string>("userId", "");
  const normalizedToken = typeof token === "string" ? token.trim() : "";
  const normalizedUserId = typeof userId === "string" ? userId.trim() : "";

  useEffect(() => {
    if (!normalizedToken || !normalizedUserId) {
      clearToken();
      clearUserId();
      router.replace("/login");
      return;
    }

    let active = true;
    void apiService
      .getWithAuth<User>(`/users/${encodeURIComponent(normalizedUserId)}`, normalizedToken)
      .then((fetchedUser) => {
        const fetchedId = String((fetchedUser as Partial<User>)?.id ?? "").trim();
        if (!active) return;
        if (!fetchedId || fetchedId !== normalizedUserId) {
          clearToken();
          clearUserId();
          router.replace("/login");
          return;
        }
        router.replace("/dashboard");
      })
      .catch((error) => {
        if (!active) return;
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403 || status === 404) {
          clearToken();
          clearUserId();
        }
        router.replace("/login");
      });

    return () => {
      active = false;
    };
  }, [apiService, normalizedToken, normalizedUserId, router, clearToken, clearUserId]);

  return (
    <div className="cabo-background">
      <div className="login-container">
        <Spin size="large" />
      </div>
    </div>
  );
}
