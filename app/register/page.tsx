"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { User } from "@/types/user";
import { Button, Form, Input } from "antd";

interface FormFieldProps {
    username: string;
    password: string;
    bio: string;
}

const Register: React.FC = () => {
    const router = useRouter();
    const apiService = useApi();
    const [form] = Form.useForm();
    const { set: setToken } = useLocalStorage<string>("token", "");
    const { set: setUserId } = useLocalStorage<string>("userId", "");

    const handleRegister = async (values: FormFieldProps) => {
        try {
            const response = await apiService.post<User>("/users", values);

            if (response.token) {
                setToken(response.token);
            }
            if (response.id) {
                setUserId(String(response.id));
            }

            router.push("/dashboard");
        } catch (error) {
            if (error instanceof Error) {
                alert(`Registration failed:\n${error.message}`);
            }
        }
    };
return (
    <div className="cabo-background">
        <div className="login-container">
            <div className="form-card">
                <h1>Register</h1>
                <Form
                    form={form}
                    name="register"
                    size="large"
                    variant="outlined"
                    onFinish={handleRegister}
                    layout="vertical"
                >
                    <Form.Item
                        name="username"
                        label="Username"
                        rules={[{ required: true, message: "Please input your username!" }]}
                    >
                        <Input placeholder="Enter username" />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="Password"
                        rules={[{ required: true, message: "Please input your password!" }]}
                    >
                        <Input.Password placeholder="Enter password" />
                    </Form.Item>
                    <Form.Item
                        name="bio"
                        label="Bio"
                        rules={[{ required: true, message: "Please input your bio!" }]}
                    >
                        <Input placeholder="Enter bio" />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit" className="login-button">
                            Register
                        </Button>
                    </Form.Item>
                    <Form.Item>
                        <Button type="link" onClick={() => router.push("/login")}>
                            Login here!
                        </Button>
                    </Form.Item>
                </Form>
            </div>
        </div>
    </div>
);
};
export default Register;

