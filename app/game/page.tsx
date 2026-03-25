"use client";

import React from "react";
import { Button } from "antd";

const Game = () => {
  const isSpectator = true; // TODO: replace with real logic

  return (
    <div className="cabo-background">
      <div className="game-overlay">

        {/* EXIT BUTTON */}
        {isSpectator && (
          <Button className="exit-button">
            Exit
          </Button>
        )}

        {/* TOP CENTER (Player 5) */}
        <div className="top-cards">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card small" />
          ))}
        </div>

        {/* TOP RIGHT BUTTONS */}
        <div className="top-right-buttons">
          <Button>Scores</Button>
          <Button type="primary">Call Cabo</Button>
        </div>

        {/* LEFT SIDE (Player 4) */}
        <div className="left-cards">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card small" />
          ))}
        </div>

        {/* RIGHT SIDE (Player 1) */}
        <div className="right-cards">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card small" />
          ))}
        </div>

        {/* CENTER */}
        <div className="center-area">
          <div className="pile">
            <div className="card medium" />
            <p>Draw Pile</p>
          </div>

          <div className="pile">
            <div className="card medium" />
            <p>Visible Stack</p>
          </div>
        </div>

        {/* BOTTOM (You) */}
        <div className="bottom-cards">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card large" />
          ))}
        </div>

      </div>
    </div>
  );
};

export default Game;