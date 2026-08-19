import { useEffect, useRef } from "react";

export function useNotificationSound(count: number) {
  const prevCount = useRef(count);
  const hasInteracted = useRef(false);

  useEffect(() => {
    const handleInteraction = () => {
      hasInteracted.current = true;
    };
    window.addEventListener("click", handleInteraction, { once: true });
    return () => window.removeEventListener("click", handleInteraction);
  }, []);

  useEffect(() => {
    if (count > prevCount.current && hasInteracted.current) {
      playNotificationSound();
    }
    prevCount.current = count;
  }, [count]);
}

function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a pleasant notification sound
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
    
    oscillator.type = "sine";
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    // Silent fail if audio context is not available
  }
}
