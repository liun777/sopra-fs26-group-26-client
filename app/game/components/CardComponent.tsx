import React from "react";

interface CardProps {
  hidden: boolean;        // true = card back, false = show value
  value?: number;         // shown when hidden=false
  size?: "small" | "medium" | "large";
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  onDragEnd?: React.DragEventHandler<HTMLDivElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  onDragEnter?: React.DragEventHandler<HTMLDivElement>;
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
}

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
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onDragEnter,
  onDragLeave,
}) => {
  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  const cursorStyle = disabled ? "not-allowed" : draggable ? "grab" : onClick ? "pointer" : "default";
  const opacityStyle = disabled ? 0.6 : 1;


// card backsides
  if (hidden) {
    // card back — uses the existing .card CSS class with cards.png background
    return (
      <div
        className={`card ${size}`}
        onClick={handleClick}
        draggable={!disabled && draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
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

  return (
    <div
          className={`card ${size}`}
          onClick={handleClick}
          draggable={!disabled && draggable}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
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
        </div>
      );
    };

    export default CardComponent;
