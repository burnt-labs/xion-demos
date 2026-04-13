import React from 'react';
import type { TimeStatus } from '../types/chess';

interface TimeDisplayProps {
  timeStatus: TimeStatus | null;
  playerColor: 'white' | 'black';
  isCurrentPlayer: boolean;
}

export function TimeDisplay({ timeStatus, playerColor, isCurrentPlayer }: TimeDisplayProps) {
  if (!timeStatus) return null;

  // Convert blocks to human readable time with live countdown
  const blocksToTime = (blocks: number): string => {
    if (blocks <= 0) return "0:00";
    
    const totalSeconds = blocks; // 1 block = ~1 second
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  };

  // Get live time remaining (accounting for time since last move)
  const getLiveTimeRemaining = (): number => {
    if (!timeStatus || timeStatus.move_count < 2) return timeRemaining;
    
    // If it's this player's turn, subtract time since last move
    if (isCurrentPlayer) {
      return Math.max(0, timeRemaining - timeStatus.time_since_last_move);
    }
    
    return timeRemaining;
  };

  const timeRemaining = playerColor === 'white' 
    ? timeStatus.white_time_remaining 
    : timeStatus.black_time_remaining;

  const liveTimeRemaining = getLiveTimeRemaining();
  const isLowTime = liveTimeRemaining < 600; // Less than 10 minutes
  const isCriticalTime = liveTimeRemaining < 60; // Less than 1 minute

  // Determine increment text
  const getIncrementText = () => {
    if (timeStatus.move_count < 2) {
      return "Time starts after both players' first move";
    } else if (timeStatus.move_count <= 20) {
      return "+10 min/move";
    } else {
      return "+1 min/move";
    }
  };

  return (
    <div className={`time-display ${isCurrentPlayer ? 'active' : ''}`}>
      <div className={`time-value ${isCriticalTime ? 'critical' : isLowTime ? 'low' : ''}`}>
        {blocksToTime(liveTimeRemaining)}
      </div>
      <div className="time-info">
        <span className="player-label">{playerColor === 'white' ? '⚪' : '⚫'} {playerColor}</span>
        {isCurrentPlayer && timeStatus.move_count >= 2 && (
          <span className="time-ticking">⏱️</span>
        )}
      </div>
      <div className="increment-info">
        {getIncrementText()}
      </div>
      {timeStatus.time_expired && isCurrentPlayer && (
        <div className="time-expired">TIME EXPIRED!</div>
      )}
      
      <style jsx>{`
        .time-display {
          padding: 12px;
          border-radius: 8px;
          background: #f5f5f5;
          border: 2px solid #ddd;
          margin: 8px 0;
          transition: all 0.3s ease;
        }
        
        .time-display.active {
          background: #fff;
          border-color: #4CAF50;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .time-value {
          font-size: 28px;
          font-weight: bold;
          font-family: 'Courier New', monospace;
          color: #333;
          letter-spacing: 1px;
          text-align: center;
          padding: 8px 16px;
          background: rgba(0, 0, 0, 0.1);
          border-radius: 8px;
          border: 2px solid #ddd;
        }
        
        .time-value.low {
          color: #ff9800;
          border-color: #ff9800;
          background: rgba(255, 152, 0, 0.1);
        }
        
        .time-value.critical {
          color: #f44336;
          border-color: #f44336;
          background: rgba(244, 67, 54, 0.1);
          animation: pulse 1s infinite;
        }
        
        .time-display.active .time-value {
          border-color: #4CAF50;
          background: rgba(76, 175, 80, 0.1);
        }
        
        .time-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 4px;
          font-size: 14px;
          color: #666;
        }
        
        .player-label {
          text-transform: capitalize;
        }
        
        .time-ticking {
          animation: rotate 2s linear infinite;
        }
        
        .increment-info {
          font-size: 12px;
          color: #888;
          margin-top: 4px;
        }
        
        .time-expired {
          background: #f44336;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          text-align: center;
          margin-top: 8px;
          font-weight: bold;
          animation: blink 1s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}