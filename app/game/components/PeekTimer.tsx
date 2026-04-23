import React, { useEffect, useState } from "react";

// S4: Create a 5-second visual timer/progress bar that appears on the screen overlay to inform players how much time they have left.
//     #17



interface PeekTimerProps {
    duration?: number;
    onComplete?: () => void;
}

const PeekTimer: React.FC<PeekTimerProps> = ({
    duration = 5,
    onComplete,
}) => {
    const [timeLeft, setTimeLeft] = useState(duration);
    const [deadlineMs, setDeadlineMs] = useState<number>(() => Date.now() + (duration * 1000));

    useEffect(() => {
        setTimeLeft(duration);
        setDeadlineMs(Date.now() + (duration * 1000));
    }, [duration]);

    useEffect(() => {
        const tick = () => {
            const remainingMs = Math.max(0, deadlineMs - Date.now());
            const nextLeft = Math.max(0, Math.ceil(remainingMs / 1000));
            setTimeLeft(nextLeft);
            if (nextLeft <= 0) {
                onComplete?.();
            }
        };

        tick();
        const timer = window.setInterval(tick, 250);
        return () => window.clearInterval(timer);
    }, [deadlineMs, onComplete]);

    // progress: 100% = full, 0% = empty
    const progress = (timeLeft / duration) * 100;

    const barColor =
        progress > 60 ? "#4caf50" :
        progress > 30 ? "#ff9800" :
        "#f44336";
    const displayedTimeLeft = timeLeft > 0 ? Math.max(0, timeLeft - 1) : 0;

    return (
        <div style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1000,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            borderRadius: "16px",
            padding: "24px 32px",
            textAlign: "center",
            minWidth: "280px",
        }}>
            {/* Titel */}
            <p style={{
                color: "white",
                fontSize: "18px",
                fontWeight: "bold",
                marginBottom: "8px",
            }}>
                Peek
            </p>

            {/* Description */}
            <p style={{
                color: "#ccc",
                fontSize: "13px",
                marginBottom: "16px",
            }}>
                Remember these two cards!
            </p>

            {/* Countdown  */}
            <p style={{
                color: barColor,
                fontSize: "48px",
                fontWeight: "bold",
                marginBottom: "12px",
                lineHeight: 1,
            }}>
                {displayedTimeLeft}
            </p>

            {/* progressbar */}
            <div style={{
                width: "100%",
                height: "10px",
                backgroundColor: "#444",
                borderRadius: "5px",
                overflow: "hidden",
            }}>
                <div style={{
                    width: `${progress}%`,
                    height: "100%",
                    backgroundColor: barColor,
                    borderRadius: "5px",
                    transition: "width 1s linear, background-color 0.5s",
                }} />
            </div>
        </div>
    );
};

export default PeekTimer;
