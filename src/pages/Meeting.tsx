// Polyfill for process.nextTick to fix simple-peer error in browser
if (typeof process === "undefined") {
  (window as any).process = {};
}
if (!process.nextTick) {
  process.nextTick = (callback: (...args: any[]) => void, ...args: any[]) => {
    setTimeout(() => callback(...args), 0);
  };
}

import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import SimplePeer, { Instance as SimplePeerInstance } from "simple-peer";
import { io, Socket } from "socket.io-client";
import toast, { Toaster } from "react-hot-toast";
import { FiCopy, FiUsers } from "react-icons/fi";
import PreConversation from "../components/PreConversation";
import InMeeting from "../components/InMeeting";

interface UserData {
  username: string;
  email: string;
  id: string;
}

interface Participant {
  socketId: string;
  userId: string;
}

interface MeetParticipant {
  id: string;
  user: string;
  role: string;
  joined_at: string;
  left_at: string | null;
}

interface MeetingResponse {
  id: string;
  short_code: string;
  title: string | null;
  host: string;
  participants: string[];
  status: string;
  is_public: boolean;
  access_token: string | null;
  start_time: string | null;
  end_time: string | null;
  created: string;
  meet_participants: MeetParticipant[];
}

export default function Meeting() {
  const { id: roomId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [meetingData, setMeetingData] = useState<MeetingResponse | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [screenShareStream, setScreenShareStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remoteScreenShareStreams, setRemoteScreenShareStreams] = useState<Map<string, MediaStream>>(new Map());
  const [screenShareUserId, setScreenShareUserId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isStreamStarted, setIsStreamStarted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const socketIdToUserIdRef = useRef<Map<string, string>>(new Map());
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const videoPeersRef = useRef<Map<string, SimplePeerInstance>>(new Map());
  const screenSharePeersRef = useRef<Map<string, SimplePeerInstance>>(new Map());
  const isLeavingRef = useRef(false);
  const hasFetchedStreamRef = useRef(false);

  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ];

  const fetchUserData = async () => {
    try {
      const userId = localStorage.getItem("userId");
      const accessToken = localStorage.getItem("accessToken");
      if (!userId || !accessToken) {
        setError("User not authorized");
        return null;
      }

      const response = await axios.get(`http://127.0.0.1:8000/api/v1/users/user/${userId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setUserData(response.data);
      return userId;
    } catch (err) {
      console.error("Error fetching user data:", err);
      setError("Error loading user data");
      return null;
    }
  };

  const fetchMeetingData = async () => {
    try {
      const accessToken = localStorage.getItem("accessToken");
      if (!accessToken) {
        setError("User not authorized");
        return false;
      }

      const response = await axios.get<MeetingResponse>(`http://127.0.0.1:8000/api/v1/meet/meets/${roomId}/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      setMeetingData(response.data);
      console.log("Updated meetingData:", response.data);
      return true;
    } catch (err) {
      console.error("Error fetching meeting data:", err);
      setError("Failed to load meeting data. The meeting may not exist.");
      return false;
    }
  };

  const getUserMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setVideoStream(stream);
      console.log("Video stream tracks:", stream.getTracks());

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      setIsVideoOn(videoTrack.enabled);
      setIsAudioOn(audioTrack.enabled);

      return stream;
    } catch (err) {
      console.error("Error accessing camera and microphone:", err);
      setError("Error accessing camera and microphone");
      return null;
    }
  };

  const startStream = async () => {
    const userId = await fetchUserData();
    if (!userId) return;

    const meetingExists = await fetchMeetingData();
    if (!meetingExists) return;

    if (!videoStream && !hasFetchedStreamRef.current) {
      hasFetchedStreamRef.current = true;
      const stream = await getUserMedia();
      if (!stream) return;
    }

    if (socketRef.current) {
      socketRef.current.emit("join-room", roomId, userId);
      setIsStreamStarted(true);

      const socketId = socketRef.current.id;
      if (socketId && userId) {
        socketIdToUserIdRef.current.set(socketId, userId);
      }
    } else {
      console.error("Socket is not initialized in startStream");
      setError("Failed to connect to the video meeting server");
    }
  };

  const startScreenShare = async () => {
    if (screenShareUserId) {
      toast.error("Screen sharing is already being performed by another participant");
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setIsScreenSharing(true);
      setScreenShareStream(screenStream);
      setScreenShareUserId(userData?.id || null);
      console.log("Screen share stream tracks:", screenStream.getTracks());

      if (socketRef.current) {
        socketRef.current.emit("screen-share-start", { roomId, userId: userData?.id });

        participants.forEach(({ userId }) => {
          if (userId === userData?.id) return;

          const peer = new SimplePeer({
            initiator: true,
            trickle: true,
            stream: screenStream,
            config: { iceServers },
          });

          peer.on("signal", (signal) => {
            console.log(`Sending screen-share signal to user ${userId} (type: screen-share):`, signal);
            socketRef.current?.emit("signal", { roomId, userId, signal, type: "screen-share" });
          });

          peer.on("error", (err) => {
            console.error(`Screen share peer error for user ${userId}:`, err);
            if (!(peer as any).destroyed) {
              (peer as any).destroy();
              screenSharePeersRef.current.delete(userId);
            }
          });

          peer.on("connect", () => {
            console.log(`Screen-sharing peer connected with user ${userId}`);
          });

          peer.on("iceStateChange", (iceConnectionState) => {
            console.log(`ICE connection state for screen-share peer ${userId}: ${iceConnectionState}`);
            if (iceConnectionState === "failed") {
              console.error(`ICE connection failed for screen-share peer ${userId}`);
              if (!(peer as any).destroyed) {
                (peer as any).destroy();
                screenSharePeersRef.current.delete(userId);
              }
            }
          });

          screenSharePeersRef.current.set(userId, peer);
        });

        screenStream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          setScreenShareStream(null);
          setScreenShareUserId(null);
          if (socketRef.current) {
            socketRef.current.emit("screen-share-stop", { roomId, userId: userData?.id });
          }

          screenSharePeersRef.current.forEach((peer, userId) => {
            if (!(peer as any).destroyed) {
              (peer as any).destroy();
              screenSharePeersRef.current.delete(userId);
            }
          });

          if (videoStream && localVideoRef.current) {
            localVideoRef.current.srcObject = videoStream;
            localVideoRef.current.play().catch(err => {
              console.error("Error replaying local video after screen share stop:", err);
            });
          }

          setRemoteScreenShareStreams(new Map());
          toast.success("Screen sharing ended", { position: "top-center" });
        };
      }
    } catch (err: any) {
      console.error("Error starting screen share:", err);
      if (err.name === "NotAllowedError") {
        toast("Screen sharing canceled", { position: "top-center" });
      } else {
        setError("Failed to start screen sharing");
      }
    }
  };

  const copyShortCode = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId).then(() => {
        toast.success(`Meeting Code copied: ${roomId}`, { position: "top-center", duration: 2000 });
      });
    }
  };

  const onConnect = () => {
    console.log("Connected to signaling server");
  };

  const onConnectError = (err: any) => {
    console.error("Socket connection error:", err);
    setError("Error connecting to the video meeting server");
  };

  const onDisconnect = (reason: string) => {
    console.log("Disconnected from signaling server:", reason);
    setError("Disconnected from the video meeting server");
  };

  const onParticipants = (participants: Participant[]) => {
    console.log("Received participants:", participants);
    setParticipants(participants);
    participants.forEach(({ socketId, userId }) => {
      socketIdToUserIdRef.current.set(socketId, userId);
    });
    fetchMeetingData();
  };

  const onUserConnected = (data: { socketId: string; userId: string }) => {
    console.log("User connected:", data);
    socketIdToUserIdRef.current.set(data.socketId, data.userId);
    setParticipants(prev => [...prev, { socketId: data.socketId, userId: data.userId }]);
    fetchMeetingData();

    if (screenShareStream && userData?.id === screenShareUserId && data.userId !== userData?.id) {
      const peer = new SimplePeer({
        initiator: true,
        trickle: true,
        stream: screenShareStream,
        config: { iceServers },
      });

      peer.on("signal", (signal) => {
        socketRef.current?.emit("signal", { roomId, userId: data.userId, signal, type: "screen-share" });
      });

      peer.on("error", (err) => {
        console.error(`Screen share peer error for user ${data.userId}:`, err);
        if (!(peer as any).destroyed) peer.destroy();
      });

      screenSharePeersRef.current.set(data.userId, peer);
    }
  };

  const onSignal = (data: { senderSocketId: string; signal: any; type?: string }) => {
    const { senderSocketId, signal, type } = data;
    console.log(`Received signal from socket ${senderSocketId} (type: ${type}):`, signal);

    if (!type || !["video", "screen-share"].includes(type)) {
      console.error(`Invalid or missing signal type from socket ${senderSocketId}. Type: ${type}`);
      return;
    }

    const senderUserId = socketIdToUserIdRef.current.get(senderSocketId);
    if (!senderUserId) {
      console.error(`Could not map socket.id ${senderSocketId} to a userId`);
      return;
    }

    const isScreenShare = type === "screen-share";
    const peerRef = isScreenShare ? screenSharePeersRef : videoPeersRef;
    let peer = peerRef.current.get(senderUserId);

    if (!peer) {
      console.log(`Creating new peer for user ${senderUserId} (type: ${type})`);
      peer = new SimplePeer({
        initiator: false,
        trickle: true,
        config: { iceServers },
      });

      peer.on("signal", (signal) => {
        console.log(`Sending ${type} signal to user ${senderUserId}:`, signal);
        socketRef.current?.emit("signal", { roomId, userId: senderUserId, signal, type });
      });

      peer.on("stream", (remoteStream) => {
        console.log(`Received ${type} stream from user ${senderUserId}:`, remoteStream);
        if (isScreenShare) {
          setRemoteScreenShareStreams(prev => {
            const newStreams = new Map(prev);
            newStreams.set(senderUserId, remoteStream);
            console.log("Updated remoteScreenShareStreams:", Array.from(newStreams.entries()));
            return newStreams;
          });
        } else {
          setRemoteStreams(prev => {
            const newStreams = new Map(prev);
            newStreams.set(senderUserId, remoteStream);
            console.log("Updated remoteStreams:", Array.from(newStreams.entries()));
            return newStreams;
          });
        }
      });

      peer.on("error", (err) => {
        console.error(`${type} peer error for user ${senderUserId}:`, err);
        if (!(peer as any).destroyed) {
          (peer as any).destroy();
          peerRef.current.delete(senderUserId);
          if (!isScreenShare) {
            setRemoteStreams(prev => {
              const newStreams = new Map(prev);
              newStreams.delete(senderUserId);
              return newStreams;
            });
          }
        }
      });

      peer.on("connect", () => {
        console.log(`${type} peer connected with user ${senderUserId}`);
      });

      peerRef.current.set(senderUserId, peer);
    }

    if (peer && !(peer as any).destroyed) {
      console.log(`Signaling peer for user ${senderUserId} (type: ${type})`);
      try {
        peer.signal(signal);
      } catch (err) {
        console.error(`Error signaling peer for user ${senderUserId}:`, err);
      }
    }
  };

  const onUserDisconnected = (userId: string) => {
    console.log("User disconnected:", userId);

    const videoPeer = videoPeersRef.current.get(userId);
    if (videoPeer) {
      if (!(videoPeer as any).destroyed) (videoPeer as any).destroy();
      videoPeersRef.current.delete(userId);
      setRemoteStreams(prev => {
        const newStreams = new Map(prev);
        newStreams.delete(userId);
        return newStreams;
      });
    }

    const screenPeer = screenSharePeersRef.current.get(userId);
    if (screenPeer) {
      if (!(screenPeer as any).destroyed) (screenPeer as any).destroy();
      screenSharePeersRef.current.delete(userId);
      setRemoteScreenShareStreams(prev => {
        const newStreams = new Map(prev);
        newStreams.delete(userId);
        return newStreams;
      });
    }

    if (screenShareUserId === userId) {
      setScreenShareUserId(null);
      setRemoteScreenShareStreams(new Map());
      setIsScreenSharing(false);
      setScreenShareStream(null);
    }

    const socketId = Array.from(socketIdToUserIdRef.current.entries()).find(
      ([_, uId]) => uId === userId
    )?.[0];
    if (socketId) {
      socketIdToUserIdRef.current.delete(socketId);
    }
    setParticipants(prev => prev.filter(p => p.userId !== userId));
    fetchMeetingData();
  };

  const onScreenShareStart = (data: { userId: string }) => {
    console.log("Screen share started by user:", data.userId);
    setScreenShareUserId(data.userId);
  };

  const onScreenShareStop = (data: { userId: string }) => {
    console.log("Screen share stopped by user:", data.userId);
    setScreenShareUserId(null);
    setRemoteScreenShareStreams(new Map());
    setIsScreenSharing(false);
    setScreenShareStream(null);

    screenSharePeersRef.current.forEach((peer, userId) => {
      if (!(peer as any).destroyed) {
        (peer as any).destroy();
        screenSharePeersRef.current.delete(userId);
      }
    });

    if (videoStream && localVideoRef.current) {
      localVideoRef.current.srcObject = videoStream;
      localVideoRef.current.play().catch(err => {
        console.error("Error replaying local video after screen share stop:", err);
      });
    }
  };

  useEffect(() => {
    const socket = io("http://localhost:3001", {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socketRef.current.on("connect", onConnect);
    socketRef.current.on("connect_error", onConnectError);
    socketRef.current.on("disconnect", onDisconnect);
    socketRef.current.on("participants", onParticipants);
    socketRef.current.on("user-connected", onUserConnected);
    socketRef.current.on("signal", onSignal);
    socketRef.current.on("user-disconnected", onUserDisconnected);
    socketRef.current.on("screen-share-start", onScreenShareStart);
    socketRef.current.on("screen-share-stop", onScreenShareStop);

    return () => {
      console.log("Cleaning up socket on unmount or roomId change");
      if (socketRef.current) {
        socketRef.current.off("connect", onConnect);
        socketRef.current.off("connect_error", onConnectError);
        socketRef.current.off("disconnect", onDisconnect);
        socketRef.current.off("participants", onParticipants);
        socketRef.current.off("user-connected", onUserConnected);
        socketRef.current.off("signal", onSignal);
        socketRef.current.off("user-disconnected", onUserDisconnected);
        socketRef.current.off("screen-share-start", onScreenShareStart);
        socketRef.current.off("screen-share-stop", onScreenShareStop);
      }
    };
  }, [roomId]);

  useEffect(() => {
    if (!videoStream || !userData?.id) {
      console.log("Skipping peer creation: videoStream or userData not ready");
      return;
    }

    participants.forEach(({ userId }) => {
      if (!userId || videoPeersRef.current.has(userId) || userId === userData?.id) return;

      const peer = new SimplePeer({
        initiator: userData.id < userId,
        trickle: true,
        stream: videoStream,
        config: { iceServers },
      });

      peer.on("signal", (signal) => {
        socketRef.current?.emit("signal", { roomId, userId, signal, type: "video" });
      });

      peer.on("stream", (remoteStream) => {
        setRemoteStreams(prev => {
          const newStreams = new Map(prev);
          newStreams.set(userId, remoteStream);
          return newStreams;
        });
      });

      peer.on("error", (err) => {
        console.error(`Video peer error for user ${userId}:`, err);
        if (!(peer as any).destroyed) {
          (peer as any).destroy();
          videoPeersRef.current.delete(userId);
          setRemoteStreams(prev => {
            const newStreams = new Map(prev);
            newStreams.delete(userId);
            return newStreams;
          });
        }
      });

      peer.on("connect", () => {
        console.log(`WebRTC video connection established with user ${userId}`);
      });

      videoPeersRef.current.set(userId, peer);
    });
  }, [videoStream, userData, participants, roomId]);

  const leaveMeeting = async () => {
    isLeavingRef.current = true;

    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }

    if (screenShareStream) {
      screenShareStream.getTracks().forEach(track => track.stop());
      setScreenShareStream(null);
      setScreenShareUserId(null);
      if (socketRef.current) {
        socketRef.current.emit("screen-share-stop", { roomId, userId: userData?.id });
      }
    }

    const accessToken = localStorage.getItem("accessToken");
    if (accessToken && meetingData && roomId) {
      try {
        await axios.post(
          `http://127.0.0.1:8000/api/v1/meet/meets/${roomId}/leave/`,
          {},
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
      } catch (err) {
        console.error("Error leaving meeting on backend:", err);
      }
    }

    videoPeersRef.current.forEach((peer) => {
      if (!(peer as any).destroyed) (peer as any).destroy();
    });
    videoPeersRef.current.clear();

    screenSharePeersRef.current.forEach((peer) => {
      if (!(peer as any).destroyed) (peer as any).destroy();
    });
    screenSharePeersRef.current.clear();

    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    setRemoteStreams(new Map());
    setRemoteScreenShareStreams(new Map());
    setIsStreamStarted(false);
    setIsScreenSharing(false);
    setScreenShareUserId(null);
    setParticipants([]);
    socketIdToUserIdRef.current.clear();
    setMeetingData(null);

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    navigate("/");
  };

  const toggleVideo = () => {
    if (videoStream) {
      const videoTrack = videoStream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOn(videoTrack.enabled);
    }
  };

  const toggleAudio = () => {
    if (videoStream) {
      const audioTrack = videoStream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioOn(audioTrack.enabled);
    }
  };

  const connectedParticipantsCount = isStreamStarted ? participants.length + 1 : 0;

  useEffect(() => {
    const loadPreviewStream = async () => {
      const userId = await fetchUserData();
      if (!userId) return;

      const meetingExists = await fetchMeetingData();
      if (!meetingExists) return;

      if (!videoStream && !hasFetchedStreamRef.current) {
        hasFetchedStreamRef.current = true;
        await getUserMedia();
      }
    };

    loadPreviewStream();
  }, []);

  useEffect(() => {
    return () => {
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
      if (screenShareStream) {
        screenShareStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-800 to-gray-900 text-white flex items-center justify-center p-6">
        <div className="bg-gray-700 bg-opacity-50 rounded-lg p-8 shadow-lg max-w-md w-full text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-800 to-gray-900 text-white p-6">
      <Toaster />
      <div className="flex items-center justify-between px-6 pt-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-blue-400 hover:text-blue-300 transition-colors duration-300" style={{ fontFamily: "'Poppins', sans-serif" }}>
          EchoBridge
        </h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-4 py-2 shadow-inner border border-gray-600 hover:bg-gray-700 transition-all duration-300">
            <p className="text-base text-gray-200" style={{ fontFamily: "'Inter', sans-serif" }}>
              Meeting Code: <span className="font-mono">#{roomId}</span>
            </p>
            <button
              onClick={copyShortCode}
              className="flex items-center gap-2 px-3 py-1 bg-blue-600 rounded-md hover:bg-blue-700 transition-all duration-300 shadow-md hover:shadow-lg"
            >
              <FiCopy className="w-5 h-5 text-white" />
            </button>
          </div>
          <div className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-full font-semibold shadow-md hover:bg-green-700 transition-all duration-300">
            <FiUsers className="w-5 h-5" />
            <p className="text-base" style={{ fontFamily: "'Inter', sans-serif" }}>
              {connectedParticipantsCount} Participant(s)
            </p>
          </div>
        </div>
      </div>

      <div className="mt-20">
        {isStreamStarted ? (
          <InMeeting
            userData={userData}
            videoStream={videoStream}
            screenShareStream={screenShareStream}
            remoteStreams={remoteStreams}
            remoteScreenShareStreams={remoteScreenShareStreams}
            screenShareUserId={screenShareUserId}
            localVideoRef={localVideoRef}
            connectedParticipants={meetingData?.meet_participants || []}
            isVideoOn={isVideoOn}
            isAudioOn={isAudioOn}
            isScreenSharing={isScreenSharing}
            toggleVideo={toggleVideo}
            toggleAudio={toggleAudio}
            startScreenShare={startScreenShare}
            leaveMeeting={leaveMeeting}
          />
        ) : (
          <PreConversation
            userData={userData}
            videoStream={videoStream}
            localVideoRef={localVideoRef}
            isVideoOn={isVideoOn}
            isAudioOn={isAudioOn}
            toggleVideo={toggleVideo}
            toggleAudio={toggleAudio}
            startStream={startStream}
            leaveMeeting={leaveMeeting}
          />
        )}
      </div>
    </div>
  );
}