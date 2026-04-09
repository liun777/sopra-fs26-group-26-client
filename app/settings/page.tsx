"use client"; //dedicated settings page, makes a lot more sense imo

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { Button, Card, Form, Input, message } from "antd";

const SettingsPage = () => {
  const router = useRouter();
  const apiService = useApi();
  const [form] = Form.useForm();

  const [savingPassword, setSavingPassword] = useState(false);

  const { value: userId, clear: clearUserId } = useLocalStorage<string>("userId", "");
  const { clear: clearToken } = useLocalStorage<string>("token", "");

  useEffect(() => {
    if (!userId.trim()) {
      router.replace("/login");
    }
  }, [userId, router]);

  const handlePasswordSave = async () => {
    const uid = userId.trim();
    const password = String(form.getFieldValue("password") ?? "");
    const confirmPassword = String(form.getFieldValue("confirmPassword") ?? "");

    if (!uid) {
      router.replace("/login");
      return;
    }

    if (!password.trim() || !confirmPassword.trim()) {
      message.warning("Please fill in both password fields.");
      return;
    }

    if (password !== confirmPassword) {
      message.error("Passwords do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      await apiService.put(`/users/${encodeURIComponent(uid)}`, { password });
      message.success("Password updated. Please log in again.");
      clearToken();
      clearUserId();
      window.location.assign("/login");
    } catch (error) {
      if (error instanceof Error) {
        alert(`Could not save password:\n${error.message}`);
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard");
  };

  return (
    <div className="cabo-background">
      <div className="login-container">
        <div className="create-lobby-stack dashboard-stack">
          <Card className="dashboard-container" title={<div className="dashboard-section-title">Settings</div>}>
            <Form form={form} layout="vertical" className="settings-form" requiredMark={false}>
              <Form.Item
                name="password"
                label={<span className="form-label-required">New Password<span className="form-label-required-star">*</span></span>}
                rules={[{ required: true, message: "Please enter your new password." }]}
              >
                <Input
                  type="password"
                  placeholder="Enter your new password"
                />
              </Form.Item>
              <Form.Item
                name="confirmPassword"
                label={<span className="form-label-required">Confirm New Password<span className="form-label-required-star">*</span></span>}
                dependencies={["password"]}
                rules={[
                  { required: true, message: "Please confirm your new password." },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue("password") === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error("Passwords do not match."));
                    },
                  }),
                ]}
              >
                <Input
                  type="password"
                  placeholder="Re-enter your new password"
                />
              </Form.Item>
              <div className="dashboard-button-stack">
                <Button type="primary" loading={savingPassword} onClick={() => void handlePasswordSave()}>
                  Save Password
                </Button>
              </div>
            </Form>
          </Card>

          <Card className="dashboard-container">
            <div className="dashboard-button-stack">
              <Button type="default" onClick={handleBack}>{"\u2190"} Back</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
