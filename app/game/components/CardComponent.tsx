import React from "react";

interface CardProps {
  hidden: boolean;        // true = card back, false = show value
  value?: number;         // shown when hidden=false
  size?: "small" | "medium" | "large";
  onClick?: () => void;
  disabled?: boolean;
}

const CardComponent: React.FC<CardProps> = ({
  hidden,
  value,
  size = "medium",
  onClick,
  disabled = false,
}) => {
  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  if (hidden) {
    // card back — uses the existing .card CSS class with cards.png background
    return (
      <div
        className={`card ${size}`}
        onClick={handleClick}
        style={{
          cursor: disabled ? "not-allowed" : onClick ? "pointer" : "default",
          opacity: disabled ? 0.6 : 1,
        }}
      />
    );
  }

  // card front — white background with value
  return (
    <div
      className={`card ${size}`}
      onClick={handleClick}
      style={{
        cursor: disabled ? "not-allowed" : onClick ? "pointer" : "default",
        opacity: disabled ? 0.6 : 1,
        backgroundImage: "none",      // override the cards.png background to have a different front
        backgroundColor: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "24px",
        fontWeight: "bold",
        color: "#333",
        border: "2px solid #999",
      }}
    >
      {value ?? "?"}
    </div>
  );
};

export default CardComponent;