"use client"; // all users, even oneself, uses this page now, reworked as a result

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { User } from "@/types/user";
import { Button, Card, Input } from "antd";

const DEFAULT_BIO = "This player hasn't added a bio yet."; //placeholder default text
const BIO_MAX_LENGTH = 180; // can be changed

const UserProfilePage: React.FC = () => {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const apiService = useApi();

  const { value: storedUserId } = useLocalStorage<string>("userId", "");

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");

  const viewedUserId = String(params?.id ?? "").trim();
  const ownUserId = String(storedUserId ?? "").trim();
  const isOwnProfile = viewedUserId.length > 0 && ownUserId === viewedUserId;

  useEffect(() => {
    if (!viewedUserId) {
      router.replace("/users");
      return;
    }

    let active = true;

    const fetchUser = async () => {
      setLoading(true);
      try {
        const fetched = await apiService.get<User>(`/users/${encodeURIComponent(viewedUserId)}`);
        if (!active) {
          return;
        }
        setUser(fetched);
        setBioDraft((fetched.bio ?? "").trim() || DEFAULT_BIO);
      } catch (error) {
        if (active && error instanceof Error) {
          alert(`Could not load profile:\n${error.message}`);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void fetchUser();

    return () => {
      active = false;
    };
  }, [apiService, viewedUserId, router]);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard");
  };

  const creationDate = user?.creationDate ?? "-";
  const wins = Number(user?.gamesWon ?? 0);
  const gamesPlayedRaw = (
    user as User & { gamesPlayed?: number | null; games?: number | null }
  )?.gamesPlayed ?? (
    user as User & { gamesPlayed?: number | null; games?: number | null }
  )?.games ?? 0;
  const gamesPlayed = Number.isFinite(Number(gamesPlayedRaw))
    ? Number(gamesPlayedRaw)
    : 0;
  const winRatePct = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0;
  const winRateText = Number(winRatePct).toFixed(1).replace(/\.0$/, "");
  const winsGamesSummary = `${wins}/${gamesPlayed} (${winRateText}%)`;
  const averageScore = user?.averageScorePerRound ?? "-";
  const rank = user?.overallRank ?? "-";
  const shownBio = (user?.bio ?? "").trim() || DEFAULT_BIO;
  const isDefaultBio = shownBio === DEFAULT_BIO;

  return (
    <div className="cabo-background">
      <div className="login-container">
        <div className="create-lobby-stack dashboard-stack">
          <Card
            loading={loading}
            className="dashboard-container"
            title={<div className="dashboard-section-title">User Profile</div>}
          >
            {!loading && user ? (
              <div className="profile-grid">
                <div className="profile-row">
                  <span className="profile-key">Username</span>
                  <span className="profile-value">{user.username ?? "-"}</span>
                </div>
                <div className="profile-row">
                  <span className="profile-key">Creation Date</span>
                  <span className="profile-value">{creationDate}</span>
                </div>
                <div className="profile-row">
                  <span className="profile-key">Wins/Games</span>
                  <span className="profile-value">{winsGamesSummary}</span>
                </div>
                <div className="profile-row">
                  <span className="profile-key">Average Score per Round</span>
                  <span className="profile-value">{averageScore}</span>
                </div>
                <div className="profile-row">
                  <span className="profile-key">Overall Rank</span>
                  <span className="profile-value">{rank}</span>
                </div>

                <div className="profile-bio-block">
                  <div className="profile-bio-head">
                    <span className="profile-key">Bio</span>
                    {isOwnProfile && !editingBio ? (
                      <Button
                        type="default"
                        className="profile-bio-edit-btn"
                        onClick={() => {
                          setBioDraft(shownBio);
                          setEditingBio(true);
                        }}
                      >
                        Edit 
                      </Button>
                    ) : null}
                  </div>

                  {isOwnProfile && editingBio ? ( //can only see edit and edit if own profile
                    <div className="profile-bio-editor">
                      <Input.TextArea
                        rows={4}
                        value={bioDraft}
                        onChange={(event) => setBioDraft(event.target.value)}
                        maxLength={BIO_MAX_LENGTH}
                        showCount
                        placeholder="Write a short bio"
                      />
                      <div className="profile-bio-actions">
                        <Button
                          type="primary"
                          disabled
                        >
                          Save Bio
                        </Button>
                        <Button
                          type="default"
                          onClick={() => {
                            setEditingBio(false);
                            setBioDraft(shownBio);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className={`profile-bio-text${isDefaultBio ? " profile-bio-text-placeholder" : ""}`}>
                      {shownBio}
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </Card>

          <Card className="dashboard-container">
            <div className="dashboard-button-stack">
              <Button type="default" onClick={handleBack}>
                {"\u2190"} Back
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default UserProfilePage;
