import React from "react";

interface CardProps {
  hidden: boolean;        // true = card back, false = show value
  value?: number;         // shown when hidden=false
  size?: "small" | "medium" | "large";
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}

// Card abilities
const getAbility = (value: number): string => {
  if (value === 7 || value === 8) return "PEEK";   // peek your own card
  if (value === 9 || value === 10) return "SPY";   // spy on an opponent card
  if (value === 11 || value === 12) return "SWAP"; // swap cards w someone else
  return "none";
};
// get the correct oath of the png's
const getCardImagePath = (value: number): string => {
  return `/card${value}.png`;
};

const CardComponent: React.FC<CardProps> = ({
  hidden,
  value,
  size = "medium",
  onClick,
  disabled = false,
  style,
}) => {
  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  const cursorStyle = disabled ? "not-allowed" : onClick ? "pointer" : "default";
  const opacityStyle = disabled ? 0.6 : 1;


// card backsides
  if (hidden) {
    // card back — uses the existing .card CSS class with cards.png background
    return (
      <div
        className={`card ${size}`}
        onClick={handleClick}
        style={{
          cursor: cursorStyle,
          opacity: opacityStyle,
          ...style,
        }}
      />
    );
  }

  // card front — shows the correct picture
  const imagePath = value !== undefined ? getCardImagePath(value) : null;
  const ability = value !== undefined ? getAbility(value) : "none";

  return (
    <div
          className={`card ${size}`}
          onClick={handleClick}
          style={{
            cursor: cursorStyle,
            opacity: opacityStyle,
            backgroundImage: imagePath ? `url(${imagePath})` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundColor: imagePath ? "transparent" : "#fff",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            border: "2px solid #999",
            position: "relative",
            ...style,
          }}
        >
          {/* if no picture yet show value with white backgorund */}
          {!imagePath && (
            <span style={{
              fontSize: "24px",
              fontWeight: "bold",
              color: "#333",
            }}>
              {value ?? "?"}
            </span>
          )}

          {/* Ability Badge */}
          {ability !== "none" && (
            <span style={{
              position: "absolute",
              bottom: "4px",
              fontSize: "9px",
              fontWeight: "bold",
              color: "white",
              backgroundColor:
                ability === "PEEK" ? "rgba(76, 175, 80, 0.85)" :
                ability === "SPY" ? "rgba(33, 150, 243, 0.85)" :
                "rgba(156, 39, 176, 0.85)",
              padding: "2px 4px",
              borderRadius: "4px",
            }}>
              {ability}
            </span>
          )}
        </div>
      );
    };

    export default CardComponent;
