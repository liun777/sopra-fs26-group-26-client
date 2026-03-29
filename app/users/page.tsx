// this code is part of S2 to display a list of all registered users 
// clicking on a user in this list will display /app/users/[id]/page.tsx
"use client"; // For components that need React hooks and browser APIs, SSR (server side rendering) has to be disabled. Read more here: https://nextjs.org/docs/pages/building-your-application/rendering/server-side-rendering

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { User } from "@/types/user";
import { Button, Card, Table } from "antd";
import type { TableProps } from "antd"; // antd component library allows imports of types
// Optionally, you can import a CSS module or file for additional styling:
// import "@/styles/views/Dashboard.scss";

// Columns for the antd table of User objects
const columns: TableProps<User>["columns"] = [
  {
    title: "Username",
    dataIndex: "username",
    key: "username",
  },
  {
    title: "Status",
    dataIndex: "status",
    key: "status",
  },
  {
    title: "Bio",
    dataIndex: "bio",
    key: "bio",
  },
  {
    title: "Id",
    dataIndex: "id",
    key: "id",
  },
];

const Dashboard: React.FC = () => {
  const router = useRouter();
  const apiService = useApi();
  const [users, setUsers] = useState<User[] | null>(null);
  // useLocalStorage hook example use
  // The hook returns an object with the value and two functions
  // Simply choose what you need from the hook:
  const {
    // value: token, // is commented out because we dont need to know the token value for logout
    // set: setToken, // is commented out because we dont need to set or update the token value
    clear: clearToken, // all we need in this scenario is a method to clear the token
  } = useLocalStorage<string>("token", ""); // if you wanted to select a different token, i.e "lobby", useLocalStorage<string>("lobby", "");
// wir holen token und userId aus dem local storage und wenn man sich ausloggt werden sie gelöscht
  const {
    value: userId,
    clear: clearUserId,
  } = useLocalStorage<string>("userId", "");


  // beim Logout wird User auf OFFLINE gesetzt im Backend, dann wird token und userId gelöscht
  const handleLogout = async (): Promise<void> => {
    try {
      // Status auf OFFLINE setzen im Backend
      await apiService.put(`/users/${userId}`, { status: "OFFLINE" });
    } catch (error) {
      console.error("Logout error:", error);
    }
    // Token und userId aus localStorage löschen
    clearToken();
    clearUserId();
    window.location.assign("/login");
  };

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        // apiService.get<User[]> returns the parsed JSON object directly,
        // thus we can simply assign it to our users variable.
        const users: User[] = await apiService.get<User[]>("/users");
        setUsers(users);
        console.log("Fetched users:", users);
      } catch (error) {
        if (error instanceof Error) {
          alert(`Something went wrong while fetching users:\n${error.message}`);
        } else {
          console.error("An unknown error occurred while fetching users.");
        }
      }
    };

    fetchUsers();
  }, [apiService]); // dependency apiService does not re-trigger the useEffect on every render because the hook uses memoization (check useApi.tsx in the hooks).
  // if the dependency array is left empty, the useEffect will trigger exactly once
  // if the dependency array is left away, the useEffect will run on every state change. Since we do a state change to users in the useEffect, this results in an infinite loop.
  // read more here: https://react.dev/reference/react/useEffect#specifying-reactive-dependencies

return (
    <div className="cabo-background">
        <div className="login-container">
            <Card
                title="User Overview:"
                loading={!users}
                className="dashboard-container"
            >
                {users && (
                    <>
                        <p
                            className="back-link"
                            onClick={() => router.push("/dashboard")}
                        >
                            ← Back to my profile
                        </p>
                        <Table<User>
                            columns={columns}
                            dataSource={users}
                            rowKey="id"
                            pagination={false}
                            onRow={(row) => ({
                                onClick: () => router.push(`/users/${row.id}`),
                                style: { cursor: "pointer" },
                                onMouseEnter: (e) => {
                                    (e.currentTarget as HTMLElement).style.fontWeight = "bold";
                                },
                                onMouseLeave: (e) => {
                                    (e.currentTarget as HTMLElement).style.fontWeight = "normal";
                                },
                            })}
                        />
                        <Button
                            type="link"
                            onClick={handleLogout}
                            style={{ color: "#b10660", fontSize: "12px", display: "block", margin: "0 auto" }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.color = "#ffb1d4";
                                (e.currentTarget as HTMLElement).style.fontWeight = "bold";
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.color = "#b10660";
                                (e.currentTarget as HTMLElement).style.fontWeight = "normal";
                            }}
                        >
                            Logout
                        </Button>
                    </>
                )}
            </Card>
        </div>
    </div>
);
};

export default Dashboard;

