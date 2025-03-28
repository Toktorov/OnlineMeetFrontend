import { useEffect, useRef, useState } from "react";
import { FiVideo, FiVideoOff, FiMic, FiMicOff, FiMonitor, FiLogOut } from "react-icons/fi";
import axios from "axios";

interface UserData {
  username: string;
  email: string;
  id: string;
}

interface MeetParticipant {
  id: string;
  user: string;
  role: string;
  joined_at: string;
  left_at: string | null;
}

interface InMeetingProps {
  userData: UserData | null;
  videoStream: MediaStream | null;
  screenShareStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  remoteScreenShareStreams: Map<string, MediaStream>;
  screenShareUserId: string | null;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  connectedParticipants: MeetParticipant[];
  isVideoOn: boolean;
  isAudioOn: boolean;
  isScreenSharing: boolean;
  toggleVideo: () => void;
  toggleAudio: () => void;
  startScreenShare: () => void;
  leaveMeeting: () => void;
}

const InMeeting: React.FC<InMeetingProps> = ({
  userData,
  videoStream,
  screenShareStream,
  remoteStreams,
  remoteScreenShareStreams,
  screenShareUserId,
  localVideoRef,
  connectedParticipants,
  isVideoOn,
  isAudioOn,
  isScreenSharing,
  toggleVideo,
  toggleAudio,
  startScreenShare,
  leaveMeeting,
}) => {
  const screenShareVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoScrollRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement | null>>(new Map());
  const remoteScreenShareRefs = useRef<Map<string, HTMLVideoElement | null>>(new Map());
  const scrollableContainerRef = useRef<HTMLDivElement | null>(null);
  const [needsPlayTrigger, setNeedsPlayTrigger] = useState(false);
  const [participantUsernames, setParticipantUsernames] = useState<Map<string, string>>(new Map());
  const [shouldScroll, setShouldScroll] = useState(false);

  // Log when screenShareUserId changes
  useEffect(() => {
    console.log("InMeeting: screenShareUserId changed:", screenShareUserId);
  }, [screenShareUserId]);

  useEffect(() => {
    const fetchUsernames = async () => {
      const accessToken = localStorage.getItem("accessToken");
      if (!accessToken) {
        console.error("No access token found");
        return;
      }
      const usernameMap = new Map<string, string>();
      for (const participant of connectedParticipants) {
        try {
          const response = await axios.get<UserData>(
            `http://127.0.0.1:8000/api/v1/users/user/${participant.user}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          usernameMap.set(participant.user, response.data.username);
        } catch (err) {
          console.error(`Error fetching username for user ${participant.user}:`, err);
          usernameMap.set(participant.user, "Unknown");
        }
      }
      console.log("Updated username map:", Array.from(usernameMap.entries()));
      setParticipantUsernames(usernameMap);
    };
    if (connectedParticipants.length > 0) fetchUsernames();
  }, [connectedParticipants]);

  // Local video (main view)
  useEffect(() => {
    if (!localVideoRef.current || !videoStream) {
      console.log("Skipping local video setup: ref or stream missing", { ref: localVideoRef.current, stream: videoStream });
      return;
    }
    const videoElement = localVideoRef.current;

    const playVideo = async () => {
      try {
        console.log("Local video stream state:", {
          active: videoStream.active,
          videoTracks: videoStream.getVideoTracks(),
          audioTracks: videoStream.getAudioTracks(),
        });
        if (videoElement.srcObject !== videoStream) {
          videoElement.pause();
          videoElement.srcObject = null;
          videoElement.srcObject = videoStream;
          await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => resolve(null);
          });
        }
        if (videoElement.paused && videoStream.active) {
          console.log("Attempting to play local video on localVideoRef");
          await videoElement.play();
          console.log("Local video playing on localVideoRef");
        }
        const videoTrack = videoStream.getVideoTracks()[0];
        videoTrack.enabled = isVideoOn;
      } catch (err: unknown) {
        console.error("Error playing local video:", err);
        if (err instanceof Error && (err.name === "NotAllowedError" || err.name === "NotSupportedError")) {
          setNeedsPlayTrigger(true);
        }
      }
    };

    playVideo();

    return () => {
      console.log("Cleaning up localVideoRef");
      if (videoElement && !videoElement.paused) {
        videoElement.pause();
      }
    };
  }, [videoStream, localVideoRef, isVideoOn, screenShareUserId]);

  // Local video (scrollable column during screen-share)
  useEffect(() => {
    if (!localVideoScrollRef.current || !videoStream) {
      console.log("Skipping local video scroll setup: ref or stream missing", { ref: localVideoScrollRef.current, stream: videoStream });
      return;
    }
    const videoElement = localVideoScrollRef.current;

    const playVideo = async () => {
      try {
        console.log("Local video scroll stream state:", {
          active: videoStream.active,
          videoTracks: videoStream.getVideoTracks(),
          audioTracks: videoStream.getAudioTracks(),
        });
        if (videoElement.srcObject !== videoStream) {
          videoElement.pause();
          videoElement.srcObject = null;
          videoElement.srcObject = videoStream;
          await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => resolve(null);
          });
        }
        if (videoElement.paused && videoStream.active) {
          console.log("Attempting to play local video on localVideoScrollRef");
          await videoElement.play();
          console.log("Local video playing on localVideoScrollRef");
        }
        const videoTrack = videoStream.getVideoTracks()[0];
        videoTrack.enabled = isVideoOn;
      } catch (err: unknown) {
        console.error("Error playing local video in scrollable column:", err);
        if (err instanceof Error && (err.name === "NotAllowedError" || err.name === "NotSupportedError")) {
          setNeedsPlayTrigger(true);
        }
      }
    };

    playVideo();

    return () => {
      console.log("Cleaning up localVideoScrollRef");
      if (videoElement && !videoElement.paused) {
        videoElement.pause();
      }
    };
  }, [videoStream, localVideoScrollRef, isVideoOn, screenShareUserId]);

  // Local screen-share video
  useEffect(() => {
    if (!screenShareVideoRef.current) return;
    const videoElement = screenShareVideoRef.current;
    if (screenShareStream) {
      videoElement.srcObject = screenShareStream;
      videoElement.play().catch(err => console.error("Error playing screen share video:", err));
    } else {
      videoElement.pause();
      videoElement.srcObject = null;
    }
  }, [screenShareStream]);

  // Remote camera videos
  useEffect(() => {
    remoteStreams.forEach((stream, userId) => {
      const videoElement = remoteVideoRefs.current.get(userId);
      if (videoElement) {
        if (videoElement.srcObject !== stream) {
          videoElement.pause();
          videoElement.srcObject = null;
          videoElement.srcObject = stream;
          videoElement.play().catch(err => console.error(`Error playing remote video for ${userId}:`, err));
        }
      }
    });
  }, [remoteStreams, screenShareUserId]);

  // Remote screen-share videos
  useEffect(() => {
    console.log("Remote screen-share useEffect triggered:", { screenShareUserId, remoteScreenShareStreams: Array.from(remoteScreenShareStreams.entries()) });
    remoteScreenShareRefs.current.forEach((videoElement, userId) => {
      if (!videoElement) return;
      if (screenShareUserId === userId && remoteScreenShareStreams.has(userId)) {
        const stream = remoteScreenShareStreams.get(userId);
        if (stream) {
          if (videoElement.srcObject !== stream) {
            videoElement.pause();
            videoElement.srcObject = null;
            videoElement.srcObject = stream;
            videoElement.play().catch(err => console.error(`Error playing remote screen share video for ${userId}:`, err));
          }
        }
      } else {
        console.log(`Clearing remote screen-share video for user ${userId} as screenShareUserId is ${screenShareUserId}`);
        videoElement.pause();
        videoElement.srcObject = null;
      }
    });
  }, [remoteScreenShareStreams, screenShareUserId]);

  useEffect(() => {
    const checkOverflow = () => {
      if (scrollableContainerRef.current) {
        const container = scrollableContainerRef.current;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        const hasOverflow = scrollHeight > clientHeight + 2;
        setShouldScroll(hasOverflow);
        console.log(
          "Scroll height:",
          scrollHeight,
          "Client height:",
          clientHeight,
          "Height difference:",
          scrollHeight - clientHeight,
          "Should scroll:",
          hasOverflow
        );
      }
    };

    checkOverflow();
    window.addEventListener("resize", checkOverflow);

    return () => window.removeEventListener("resize", checkOverflow);
  }, [remoteStreams, screenShareUserId]);

  const handlePlayTrigger = () => {
    if (localVideoRef.current) localVideoRef.current.play().catch(err => console.error("Error playing local video:", err));
    if (localVideoScrollRef.current) localVideoScrollRef.current.play().catch(err => console.error("Error playing local video in scrollable column:", err));
    setNeedsPlayTrigger(false);
  };

  const getParticipantName = (userId: string) => participantUsernames.get(userId) || "Unknown";

  // Log render to confirm UI updates
  console.log("InMeeting render:", { screenShareUserId, remoteScreenShareStreams: Array.from(remoteScreenShareStreams.entries()) });

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto mb-8">
        <div className="flex-1">
          {screenShareUserId ? (
            <div className="relative bg-black rounded-lg shadow-lg w-full aspect-[16/10] max-h-[60vh]">
              {screenShareUserId === userData?.id ? (
                screenShareStream ? (
                  <video
                    className="w-full h-full object-contain rounded-lg"
                    autoPlay
                    playsInline
                    ref={screenShareVideoRef}
                  />
                ) : (
                  <p className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-gray-400">
                    Waiting for screen share...
                  </p>
                )
              ) : (
                Array.from(remoteScreenShareStreams.entries()).map(([userId]) =>
                  userId === screenShareUserId ? (
                    <video
                      key={userId}
                      className="w-full h-full object-contain rounded-lg"
                      autoPlay
                      playsInline
                      ref={(video) => {
                        if (video) {
                          remoteScreenShareRefs.current.set(userId, video);
                        }
                      }}
                    />
                  ) : null
                )
              )}
              {screenShareUserId && (
                <div className="absolute bottom-2 left-2 bg-gray-900 bg-opacity-75 text-white px-3 py-1 rounded-full text-sm">
                  Screen Share ({screenShareUserId === userData?.id ? "You" : getParticipantName(screenShareUserId)})
                </div>
              )}
            </div>
          ) : (
            <div className={`grid gap-4 ${remoteStreams.size === 0 ? "grid-cols-1 justify-items-center" : "grid-cols-1 sm:grid-cols-2"}`}>
              <div className="relative bg-gray-800 rounded-lg shadow-lg aspect-[4/3] max-h-[60vh] w-auto">
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
                      className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-90 rounded-lg transition-opacity duration-300"
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
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-90 rounded-lg">
                    <p className="text-gray-400">Waiting for camera access...</p>
                  </div>
                )}
              </div>
              {Array.from(remoteStreams.entries()).map(([userId]) => {
                const participant = connectedParticipants.find(p => p.user === userId);
                return (
                  <div
                    key={userId}
                    className="relative bg-gray-800 rounded-lg shadow-lg aspect-[4/3] max-h-[60vh] w-auto"
                  >
                    <video
                      className="w-full h-full object-cover rounded-lg"
                      style={{ transform: "scaleX(-1)" }}
                      autoPlay
                      playsInline
                      ref={(video) => {
                        if (video) {
                          remoteVideoRefs.current.set(userId, video);
                        }
                      }}
                    />
                    <div className="absolute bottom-2 left-2 bg-gray-900 bg-opacity-75 text-white px-3 py-1 rounded-full text-sm">
                      {getParticipantName(userId)}
                      {participant?.role === "host" && (
                        <span className="ml-2 text-xs bg-blue-500 px-2 py-1 rounded-full">Host</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {screenShareUserId && (
          <div className="w-full lg:w-80 flex-shrink-0 pr-4">
            <div
              ref={scrollableContainerRef}
              className={`h-[60vh] space-y-2 pr-4 custom-scrollbar ${shouldScroll ? "overflow-y-auto" : "overflow-y-hidden"} [&>*:last-child]:mb-0`}
            >
              <div className="relative aspect-[4/3] bg-gray-800 rounded-lg shadow-lg w-full">
                <video
                  className="w-full h-full object-cover rounded-lg"
                  style={{ transform: "scaleX(-1)" }}
                  autoPlay
                  playsInline
                  muted
                  ref={localVideoScrollRef}
                />
                {videoStream ? (
                  <>
                    <div
                      className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-90 rounded-lg transition-opacity duration-300"
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
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-90 rounded-lg">
                    <p className="text-gray-400">Waiting for camera access...</p>
                  </div>
                )}
              </div>
              {Array.from(remoteStreams.entries()).map(([userId]) => {
                const participant = connectedParticipants.find(p => p.user === userId);
                return (
                  <div
                    key={userId}
                    className="relative aspect-[4/3] bg-gray-800 rounded-lg shadow-lg w-full"
                  >
                    <video
                      className="w-full h-full object-cover rounded-lg"
                      style={{ transform: "scaleX(-1)" }}
                      autoPlay
                      playsInline
                      ref={(video) => {
                        if (video) {
                          remoteVideoRefs.current.set(userId, video);
                        }
                      }}
                    />
                    <div className="absolute bottom-2 left-2 bg-gray-900 bg-opacity-75 text-white px-3 py-1 rounded-full text-sm">
                      {getParticipantName(userId)}
                      {participant?.role === "host" && (
                        <span className="ml-2 text-xs bg-blue-500 px-2 py-1 rounded-full">Host</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-center gap-4 flex-wrap">
        <button
          onClick={toggleVideo}
          className={`flex items-center gap-2 px-6 py-3 rounded-full shadow-md transition-all duration-300 ${
            isVideoOn ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-600 hover:bg-gray-700"
          }`}
        >
          {isVideoOn ? <FiVideo className="w-5 h-5" /> : <FiVideoOff className="w-5 h-5" />}
          {isVideoOn ? "Turn Off Camera" : "Turn On Camera"}
        </button>
        <button
          onClick={toggleAudio}
          className={`flex items-center gap-2 px-6 py-3 rounded-full shadow-md transition-all duration-300 ${
            isAudioOn ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-600 hover:bg-gray-700"
          }`}
        >
          {isAudioOn ? <FiMic className="w-5 h-5" /> : <FiMicOff className="w-5 h-5" />}
          {isAudioOn ? "Turn Off Microphone" : "Turn On Microphone"}
        </button>
        <button
          onClick={startScreenShare}
          className={`flex items-center gap-2 px-6 py-3 rounded-full shadow-md transition-all duration-300 ${
            isScreenSharing || screenShareUserId
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-yellow-600 hover:bg-yellow-700"
          }`}
          disabled={isScreenSharing || !!screenShareUserId}
        >
          <FiMonitor className="w-5 h-5" />
          {isScreenSharing ? "Screen Sharing" : "Start Screen Share"}
        </button>
        <button
          onClick={leaveMeeting}
          className="flex items-center gap-2 px-6 py-3 bg-red-600 rounded-full hover:bg-red-700 transition-all duration-300 shadow-md hover:shadow-lg"
        >
          <FiLogOut className="w-5 h-5" />
          Leave Meeting
        </button>
      </div>
    </>
  );
};

export default InMeeting;