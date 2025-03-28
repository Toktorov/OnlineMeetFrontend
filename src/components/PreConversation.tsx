import { useEffect, useState, useRef } from "react";
import { FiVideo, FiVideoOff, FiMic, FiMicOff, FiLogOut, FiUserPlus } from "react-icons/fi";

interface UserData {
  username: string;
  email: string;
  id: string;
}

interface PreConversationProps {
  userData: UserData | null;
  videoStream: MediaStream | null;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  isVideoOn: boolean;
  isAudioOn: boolean;
  toggleVideo: () => void;
  toggleAudio: () => void;
  startStream: () => void;
  leaveMeeting: () => void;
}

const PreConversation: React.FC<PreConversationProps> = ({
  userData,
  videoStream,
  localVideoRef,
  isVideoOn,
  isAudioOn,
  toggleVideo,
  toggleAudio,
  startStream,
  leaveMeeting,
}) => {
  const [needsPlayTrigger, setNeedsPlayTrigger] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false); // Track if mic is active to stop logging
  const animationFrameRef = useRef<number | null>(null); // To cancel requestAnimationFrame

  useEffect(() => {
    console.log("PreConversation mounted with props:", {
      videoStream,
      localVideoRef: localVideoRef.current,
      isVideoOn,
      isAudioOn,
    });

    if (!videoStream || !localVideoRef.current) {
      console.log("Skipping local video playback in PreConversation: videoStream or localVideoRef not ready", {
        videoStream,
        localVideoRef: localVideoRef.current,
      });
      return;
    }

    const videoElement = localVideoRef.current;
    console.log("Setting local video srcObject in PreConversation:", videoStream);
    videoElement.srcObject = videoStream;

    // Ensure video track is enabled based on isVideoOn
    const videoTrack = videoStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = isVideoOn;
      console.log(`Video track enabled: ${videoTrack.enabled}`);

      // If the video track is re-enabled, ensure the video element resumes playback
      if (videoTrack.enabled && videoElement.paused) {
        videoElement.play().catch(err => {
          console.error("Error resuming video playback after enabling track:", err);
          setNeedsPlayTrigger(true); // Show play button if autoplay fails
        });
      }
    }

    const playVideo = async () => {
      try {
        if (videoElement.paused && videoStream.active && isVideoOn) {
          console.log("Attempting to play local video in PreConversation");
          await videoElement.play();
          console.log("Local video playing successfully in PreConversation");
          setNeedsPlayTrigger(false);
        }
      } catch (err) {
        console.error("Error playing local video in PreConversation:", err);
        if (err instanceof Error && (err.name === "NotAllowedError" || err.name === "NotSupportedError")) {
          console.warn("Autoplay blocked in PreConversation. Video will play after user interaction.");
          setNeedsPlayTrigger(true);
        }
      }
    };

    playVideo();

    // Log audio track status
    const audioTracks = videoStream.getAudioTracks();
    console.log("Audio tracks in PreConversation:", audioTracks);
    audioTracks.forEach(track => {
      console.log(`Audio track (id: ${track.id}) enabled: ${track.enabled}`);
    });

    return () => {
      console.log("Cleaning up PreConversation");
      if (videoElement) {
        videoElement.pause();
        videoElement.srcObject = null;
        console.log("Cleared local video srcObject in PreConversation");
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        console.log("Cancelled requestAnimationFrame in PreConversation");
      }
    };
  }, [videoStream, localVideoRef, isVideoOn]); // Include isVideoOn in dependencies to handle toggle

  // Add echo effect to hear your own voice
  useEffect(() => {
    if (!videoStream) return;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(videoStream);
    const gainNode = audioContext.createGain();
    const delayNode = audioContext.createDelay(1); // 1-second delay for echo

    // Set up the audio graph: source -> delay -> gain -> destination (speakers)
    source.connect(delayNode);
    delayNode.connect(gainNode);
    gainNode.connect(audioContext.destination); // Output to speakers
    gainNode.gain.value = 0.5; // Reduce volume to avoid feedback loop
    delayNode.delayTime.value = 0.3; // 300ms delay for a subtle echo

    // Log audio levels to confirm microphone is working
    const analyser = audioContext.createAnalyser();
    source.connect(analyser);
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkAudioLevel = () => {
      // Double-check isMicActive to prevent rescheduling
      if (isMicActive) {
        console.log("Microphone already confirmed active, stopping audio level checks");
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        return;
      }

      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      console.log("Microphone audio level:", average);
      if (average > 0) {
        console.log("Microphone is active and detecting sound");
        setIsMicActive(true); // Set flag to stop further logging
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      } else {
        animationFrameRef.current = requestAnimationFrame(checkAudioLevel); // Continue checking if mic is not active
      }
    };

    // Start the audio level check only if mic is not already active
    if (!isMicActive) {
      checkAudioLevel();
    }

    return () => {
      audioContext.close();
      console.log("Audio context closed in PreConversation");
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        console.log("Cancelled requestAnimationFrame on cleanup");
      }
    };
  }, [videoStream, isMicActive]);

  const handlePlayTrigger = () => {
    if (localVideoRef.current) {
      localVideoRef.current.play().catch(err => {
        console.error("Error playing local video after user interaction in PreConversation:", err);
      });
      setNeedsPlayTrigger(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row items-center gap-8 max-w-5xl mx-auto">
      {/* Left Side: Video and Toggle Buttons */}
      <div className="flex flex-col items-center gap-6">
        <div className="relative w-full max-w-[500px] aspect-[4/3] bg-gray-800 rounded-lg shadow-lg border border-gray-700">
          <video
            className="w-full h-full object-cover rounded-lg"
            style={{ transform: "scaleX(-1)" }}
            autoPlay
            playsInline
            muted
            ref={localVideoRef}
          />
          {videoStream ? (
            <>
              <div
                className="absolute inset-0 flex items-center justify-center bg-gray-800 rounded-lg transition-opacity duration-300"
                style={{ opacity: isVideoOn ? 0 : 1, pointerEvents: isVideoOn ? "none" : "auto" }}
              >
                <p className="text-gray-400">Camera Off</p>
              </div>
              <div className="absolute bottom-2 left-2 bg-gray-900 bg-opacity-75 text-white px-3 py-1 rounded-full text-sm">
                You ({userData?.username || "Local"})
              </div>
              {needsPlayTrigger && (
                <button
                  onClick={handlePlayTrigger}
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                >
                  Play Video
                </button>
              )}
            </>
          ) : (
            <p className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-gray-400">
              Waiting for camera access...
            </p>
          )}
        </div>

        {/* Toggle Buttons */}
        <div className="flex gap-4">
          <button
            onClick={toggleVideo}
            className={`flex items-center gap-2 px-6 py-3 rounded-full shadow-md transition-all duration-300 ${
              isVideoOn
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-600 hover:bg-gray-700"
            }`}
          >
            {isVideoOn ? (
              <FiVideo className="w-5 h-5" />
            ) : (
              <FiVideoOff className="w-5 h-5" />
            )}
            {isVideoOn ? "Turn Off Camera" : "Turn On Camera"}
          </button>
          <button
            onClick={toggleAudio}
            className={`flex items-center gap-2 px-6 py-3 rounded-full shadow-md transition-all duration-300 ${
              isAudioOn
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-600 hover:bg-gray-700"
            }`}
          >
            {isAudioOn ? (
              <FiMic className="w-5 h-5" />
            ) : (
              <FiMicOff className="w-5 h-5" />
            )}
            {isAudioOn ? "Turn Off Microphone" : "Turn On Microphone"}
          </button>
        </div>
      </div>

      {/* Right Side: Join Section */}
      <div className="flex flex-col items-center gap-4 bg-gray-900 bg-opacity-50 p-6 rounded-lg shadow-lg">
        <h2 className="text-2xl font-semibold text-gray-200 mb-2">Ready to Join?</h2>
        <div className="flex gap-4">
          <button
            onClick={startStream}
            className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-full hover:bg-green-700 transition-all duration-300 shadow-md hover:shadow-lg"
          >
            <FiUserPlus className="w-5 h-5" />
            Join Meeting
          </button>
          <button
            onClick={() => {
              console.log("Leave Meeting button clicked");
              leaveMeeting();
            }}
            className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-full hover:bg-red-700 transition-all duration-300 shadow-md hover:shadow-lg"
          >
            <FiLogOut className="w-5 h-5" />
            Leave Meeting
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreConversation;