"use client";
//Add a visual timer/progress bar that syncs with the backend to warn the player of expiring time.
//#19 - int he backend this funciton is called startTurnTimer(..., 30 Sekunden)
import React, { useEffect, useState } from "react";

interface TurnTimerProps {
  duration: number; // in sec
  isActive: boolean;
}

const TurnTimer: React.FC<TurnTimerProps> = ({ duration, isActive }) => {
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    if (!isActive) return;

    setTimeLeft(duration);

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, duration]);

  const percentage = (timeLeft / duration) * 100;

  return (
    <div style={{ width: "200px", margin: "10px auto" }}>
      <div
        style={{
          height: "10px",
          backgroundColor: "#ccc",
          borderRadius: "5px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            backgroundColor: percentage > 30 ? "#4caf50" : "#f44336",
            transition: "width 1s linear",
          }}
        />
      </div>
      <p style={{ textAlign: "center", fontSize: "12px" }}>
        {timeLeft}s
      </p>
    </div>
  );
};

export default TurnTimer;