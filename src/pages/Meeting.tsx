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
import { w3cwebsocket as W3CWebSocket } from "websocket";
import toast, { Toaster } from "react-hot-toast";
import { FiCopy, FiUsers } from "react-icons/fi";
import PreConversation from "../components/PreConversation";
import InMeeting from "../components/InMeeting";
import { refreshToken } from "../api/auth";

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
  user: string | null;
  guest_name: string | null;
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
  const [usernames, setUsernames] = useState<Map<string, string>>(new Map());
  const [translationSocket, setTranslationSocket] = useState<W3CWebSocket | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("english");
  const [isGestureMode, setIsGestureMode] = useState(false);
  const socketIdToUserIdRef = useRef<Map<string, string>>(new Map());
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const videoPeersRef = useRef<Map<string, SimplePeerInstance>>(new Map());
  const screenSharePeersRef = useRef<Map<string, SimplePeerInstance>>(new Map());
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
      let accessToken = localStorage.getItem("accessToken");
      if (!userId || !accessToken) {
        setError("User not authorized");
        return null;
      }

      try {
        const response = await axios.get(`http://127.0.0.1:8000/api/v1/users/user/${userId}/`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setUserData(response.data);
        await fetchMeetingData();
        return userId;
      } catch (err: any) {
        if (err.response?.status === 401) {
          accessToken = await refreshToken();
          const response = await axios.get(`http://127.0.0.1:8000/api/v1/users/user/${userId}/`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          setUserData(response.data);
          await fetchMeetingData();
          return userId;
        }
        throw err;
      }
    } catch (err) {
      setError("Error loading user data");
      return null;
    }
  };

  const fetchMeetingData = async () => {
    try {
      let accessToken = localStorage.getItem("accessToken");
      if (!accessToken) {
        setError("User not authorized");
        return false;
      }

      try {
        const response = await axios.get<MeetingResponse>(`http://127.0.0.1:8000/api/v1/meet/meets/${roomId}/`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setMeetingData(response.data);
        return true;
      } catch (err: any) {
        if (err.response?.status === 401) {
          accessToken = await refreshToken();
          const response = await axios.get<MeetingResponse>(`http://127.0.0.1:8000/api/v1/meet/meets/${roomId}/`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          setMeetingData(response.data);
          return true;
        }
        throw err;
      }
    } catch (err) {
      setError("Failed to load meeting data. The meeting may not exist.");
      return false;
    }
  };

  const fetchUsername = async (userId: string) => {
    try {
      let accessToken = localStorage.getItem("accessToken");
      if (!accessToken) return "Unknown";

      try {
        const response = await axios.get(`http://127.0.0.1:8000/api/v1/users/user/${userId}/`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        return response.data.username || "Unknown";
      } catch (err: any) {
        if (err.response?.status === 401) {
          accessToken = await refreshToken();
          const response = await axios.get(`http://127.0.0.1:8000/api/v1/users/user/${userId}/`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          return response.data.username || "Unknown";
        }
        throw err;
      }
    } catch (err) {
      return "Unknown";
    }
  };

  const fetchAllUsernames = async (participantIds: string[]) => {
    const usernameMap = new Map<string, string>();
    if (userData) usernameMap.set(userData.id, userData.username);

    for (const userId of participantIds) {
      if (userId === userData?.id || usernameMap.has(userId)) continue;
      const username = await fetchUsername(userId);
      usernameMap.set(userId, username);
    }

    setUsernames(usernameMap);
  };

  const getUserMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getAudioTracks().forEach(track => track.enabled = false); // Mute WebRTC audio
      setVideoStream(stream);
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      setIsVideoOn(videoTrack.enabled);
      setIsAudioOn(audioTrack.enabled);
      return stream;
    } catch (err) {
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
      const accessToken = localStorage.getItem("accessToken");
      socketRef.current.emit("join-room", roomId, userId, accessToken);
      setIsStreamStarted(true);

      const socketId = socketRef.current.id;
      if (socketId && userId) socketIdToUserIdRef.current.set(socketId, userId);
    } else {
      setError("Failed to connect to the video meeting server");
    }
  };

  const fetchParticipants = () => {
    return new Promise<Participant[]>((resolve) => {
      if (!socketRef.current) {
        console.error("[fetchParticipants] Socket is not connected");
        resolve([]);
        return;
      }

      const attemptFetch = (attempt: number) => {
        console.log(`[fetchParticipants] Attempt ${attempt}: Emitting get-participants event for room:`, roomId);
        socketRef.current.emit("get-participants", roomId, (participants: Participant[]) => {
          console.log(`[fetchParticipants] Attempt ${attempt}: Received participants:`, participants);
          if (participants.length === 0 && attempt < 3) {
            console.warn(`[fetchParticipants] Attempt ${attempt}: No participants received, retrying...`);
            setTimeout(() => attemptFetch(attempt + 1), 500);
          } else {
            setParticipants(participants);
            resolve(participants);
          }
        });
      };

      attemptFetch(1);
    });
  };

  const startScreenShare = async () => {
    if (screenShareUserId) {
      toast.error("Screen sharing is already being performed by another participant");
      return;
    }

    if (!userData?.id) {
      console.error("[startScreenShare] userData.id is undefined, cannot start screen sharing");
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setIsScreenSharing(true);
      setScreenShareStream(screenStream);
      setScreenShareUserId(userData.id);

      if (socketRef.current) {
        socketRef.current.emit("screen-share-start", { roomId, userId: userData.id });

        let latestParticipants = await fetchParticipants();
        if (latestParticipants.length === 0) latestParticipants = participants;

        await new Promise(resolve => setTimeout(resolve, 500));

        if (latestParticipants.length === 0) {
          console.error("[startScreenShare] No participants available to share screen with");
          toast.error("No participants available to share screen with");
          return;
        }

        latestParticipants.forEach(({ userId }) => {
          if (userId === userData.id) return;

          const peer = new SimplePeer({
            initiator: true,
            trickle: true,
            stream: screenStream,
            config: { iceServers },
          });

          peer.on("signal", (signal) => {
            socketRef.current?.emit("signal", { roomId, userId, signal, type: "screen-share" });
          });

          peer.on("error", (err) => {
            console.error(`[startScreenShare] Screen share peer error for user ${userId}:`, err);
            if (!(peer as any).destroyed) peer.destroy();
            screenSharePeersRef.current.delete(userId);
          });

          screenSharePeersRef.current.set(userId, peer);
        });

        screenStream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          setScreenShareStream(null);
          setScreenShareUserId(null);
          if (socketRef.current) {
            socketRef.current.emit("screen-share-stop", { roomId, userId: userData.id });
          }
          screenSharePeersRef.current.forEach(peer => peer.destroy());
          screenSharePeersRef.current.clear();
          setRemoteScreenShareStreams(new Map());
          if (videoStream && localVideoRef.current) {
            localVideoRef.current.srcObject = videoStream;
            localVideoRef.current.play().catch(err => console.error("Error replaying local video:", err));
          }
          toast.success("Screen sharing ended", { position: "top-center" });
        };
      }
    } catch (err: any) {
      console.error("[startScreenShare] Error starting screen share:", err);
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

  const setupTranslationSocket = () => {
    const ws = new W3CWebSocket(`ws://localhost:8000/ws/translate/${roomId}/`);
    ws.onopen = () => {
      console.log("Translation WebSocket connected");
      ws.send(JSON.stringify({ language: targetLanguage, gesture: isGestureMode }));
    };
    ws.onmessage = (event) => {
      const audioBlob = new Blob([event.data], { type: "audio/mp3" });
      const audio = new Audio(URL.createObjectURL(audioBlob));
      audio.play().catch(err => console.error("Error playing translated audio:", err));
    };
    ws.onerror = (err) => console.error("Translation WebSocket error:", err);
    ws.onclose = () => console.log("Translation WebSocket closed");
    setTranslationSocket(ws);
  };

  const startAudioStreaming = () => {
    if (!videoStream) return;

    const audioStream = new MediaStream(videoStream.getAudioTracks());
    audioStream.getAudioTracks().forEach(track => track.enabled = true); // Enable for translation
    const recorder = new MediaRecorder(audioStream, { mimeType: "audio/webm;codecs=pcm" });
    audioRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0 && translationSocket?.readyState === WebSocket.OPEN) {
        event.data.arrayBuffer().then(buffer => translationSocket.send(buffer));
      }
    };

    recorder.start(200); // 200ms chunks
    console.log("Started audio streaming for translation");
  };

  const startGestureStreaming = () => {
    if (!videoStream || !videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    videoRef.current.srcObject = videoStream;
    videoRef.current.play();

    const sendFrame = () => {
      if (!isGestureMode || translationSocket?.readyState !== WebSocket.OPEN) return;
      context.drawImage(videoRef.current!, 0, 0, 640, 480);
      const frameData = canvas.toDataURL("image/jpeg", 0.5).split(",")[1];
      translationSocket.send(JSON.stringify({ video_frame: frameData }));
      setTimeout(sendFrame, 200); // ~5 FPS
    };
    sendFrame();
  };

  const handleLanguageChange = (lang: string) => {
    setTargetLanguage(lang);
    if (translationSocket?.readyState === WebSocket.OPEN) {
      translationSocket.send(JSON.stringify({ language: lang, gesture: isGestureMode }));
    }
  };

  const toggleGestureMode = () => {
    setIsGestureMode(prev => !prev);
    if (translationSocket?.readyState === WebSocket.OPEN) {
      translationSocket.send(JSON.stringify({ language: targetLanguage, gesture: !isGestureMode }));
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

    socket.on("connect", () => console.log("Connected to signaling server"));
    socket.on("connect_error", (err) => setError("Error connecting to the video meeting server"));
    socket.on("disconnect", (reason) => {
      if (!isLeavingRef.current) setError("Disconnected from the video meeting server");
    });
    socket.on("participants", (participants: Participant[]) => {
      setParticipants(participants);
      participants.forEach(({ socketId, userId }) => socketIdToUserIdRef.current.set(socketId, userId));
      fetchMeetingData();
    });
    socket.on("user-connected", (data: { socketId: string; userId: string }) => {
      socketIdToUserIdRef.current.set(data.socketId, data.userId);
      setParticipants(prev => [...prev.filter(p => p.userId !== data.userId), { socketId: data.socketId, userId: data.userId }]);
      fetchMeetingData();
    });
    socket.on("signal", (data: { senderSocketId: string; signal: any; type?: string }) => {
      const senderUserId = socketIdToUserIdRef.current.get(data.senderSocketId);
      if (!senderUserId) return;

      const isScreenShare = data.type === "screen-share";
      const peerRef = isScreenShare ? screenSharePeersRef : videoPeersRef;
      let peer = peerRef.current.get(senderUserId);

      if (!peer && userData) {
        peer = new SimplePeer({
          initiator: isScreenShare ? false : userData.id < senderUserId,
          trickle: true,
          stream: isScreenShare ? screenShareStream : videoStream,
          config: { iceServers },
        });

        peer.on("signal", (signal) => {
          socketRef.current?.emit("signal", { roomId, userId: senderUserId, signal, type: data.type });
        });

        peer.on("stream", (remoteStream) => {
          if (isScreenShare) {
            setRemoteScreenShareStreams(prev => new Map(prev).set(senderUserId, remoteStream));
          } else {
            setRemoteStreams(prev => new Map(prev).set(senderUserId, remoteStream));
          }
        });

        peer.on("error", () => {
          if (!(peer as any).destroyed) peer.destroy();
          peerRef.current.delete(senderUserId);
        });

        peerRef.current.set(senderUserId, peer);
      }

      if (peer && !(peer as any).destroyed) peer.signal(data.signal);
    });
    socket.on("user-disconnected", (userId: string) => {
      const videoPeer = videoPeersRef.current.get(userId);
      if (videoPeer && !(videoPeer as any).destroyed) {
        videoPeer.destroy();
        videoPeersRef.current.delete(userId);
        setRemoteStreams(prev => {
          const newStreams = new Map(prev);
          newStreams.delete(userId);
          return newStreams;
        });
      }

      const screenPeer = screenSharePeersRef.current.get(userId);
      if (screenPeer && !(screenPeer as any).destroyed) {
        screenPeer.destroy();
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
      }

      setParticipants(prev => prev.filter(p => p.userId !== userId));
      fetchMeetingData();
    });
    socket.on("screen-share-start", (data: { userId: string }) => {
      setScreenShareUserId(data.userId);
      if (data.userId !== userData?.id) {
        const peer = new SimplePeer({ initiator: false, trickle: true, config: { iceServers } });
        peer.on("signal", (signal) => {
          socketRef.current?.emit("signal", { roomId, userId: data.userId, signal, type: "screen-share" });
        });
        peer.on("stream", (remoteStream) => {
          setRemoteScreenShareStreams(prev => new Map(prev).set(data.userId, remoteStream));
        });
        peer.on("error", () => {
          if (!(peer as any).destroyed) peer.destroy();
          screenSharePeersRef.current.delete(data.userId);
        });
        screenSharePeersRef.current.set(data.userId, peer);
      }
    });
    socket.on("screen-share-stop", (data: { userId: string }) => {
      setScreenShareUserId(null);
      setRemoteScreenShareStreams(new Map());
      setIsScreenSharing(false);
      setScreenShareStream(null);
      screenSharePeersRef.current.forEach(peer => peer.destroy());
      screenSharePeersRef.current.clear();
      if (videoStream && localVideoRef.current) {
        localVideoRef.current.srcObject = videoStream;
        localVideoRef.current.play().catch(err => console.error("Error replaying local video:", err));
      }
    });
    socket.on("new-user-joined-for-screen-share", (data: { newUserId: string; newSocketId: string }) => {
      if (screenShareUserId !== userData?.id || !screenShareStream) return;
      const peer = new SimplePeer({
        initiator: true,
        trickle: true,
        stream: screenShareStream,
        config: { iceServers },
      });
      peer.on("signal", (signal) => {
        socketRef.current?.emit("signal", { roomId, userId: data.newUserId, signal, type: "screen-share" });
      });
      peer.on("error", () => {
        if (!(peer as any).destroyed) peer.destroy();
        screenSharePeersRef.current.delete(data.newUserId);
      });
      screenSharePeersRef.current.set(data.newUserId, peer);
      socketIdToUserIdRef.current.set(data.newSocketId, data.newUserId);
    });

    setupTranslationSocket();

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

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (translationSocket) translationSocket.close();
      if (audioRecorderRef.current) audioRecorderRef.current.stop();
      if (videoStream) videoStream.getTracks().forEach(track => track.stop());
      if (screenShareStream) screenShareStream.getTracks().forEach(track => track.stop());
      videoPeersRef.current.forEach(peer => peer.destroy());
      screenSharePeersRef.current.forEach(peer => peer.destroy());
      setVideoStream(null);
      setScreenShareStream(null);
    };
  }, [roomId]);

  useEffect(() => {
    if (!videoStream || !userData?.id) return;

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
        setRemoteStreams(prev => new Map(prev).set(userId, remoteStream));
      });

      peer.on("error", () => {
        if (!(peer as any).destroyed) peer.destroy();
        videoPeersRef.current.delete(userId);
      });

      videoPeersRef.current.set(userId, peer);
    });
  }, [videoStream, userData, participants, roomId]);

  useEffect(() => {
    if (meetingData?.participants && meetingData.participants.length > 0) {
      fetchAllUsernames(meetingData.participants);
    }
  }, [meetingData]);

  useEffect(() => {
    if (videoStream && isStreamStarted) {
      if (isGestureMode) startGestureStreaming();
      else startAudioStreaming();
    }
  }, [videoStream, isStreamStarted, isGestureMode]);

  const leaveMeeting = async () => {
    isLeavingRef.current = true;

    if (videoStream) videoStream.getTracks().forEach(track => track.stop());
    if (screenShareStream) screenShareStream.getTracks().forEach(track => track.stop());
    if (socketRef.current) socketRef.current.disconnect();
    if (translationSocket) translationSocket.close();
    if (audioRecorderRef.current) audioRecorderRef.current.stop();

    const accessToken = localStorage.getItem("accessToken");
    if (accessToken && roomId) {
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

    videoPeersRef.current.forEach(peer => peer.destroy());
    screenSharePeersRef.current.forEach(peer => peer.destroy());
    videoPeersRef.current.clear();
    screenSharePeersRef.current.clear();

    setVideoStream(null);
    setScreenShareStream(null);
    setRemoteStreams(new Map());
    setRemoteScreenShareStreams(new Map());
    setIsStreamStarted(false);
    setIsScreenSharing(false);
    setScreenShareUserId(null);
    setParticipants([]);
    socketIdToUserIdRef.current.clear();
    setMeetingData(null);
    setUsernames(new Map());

    if (localVideoRef.current) localVideoRef.current.srcObject = null;

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
        <h1
          className="text-3xl font-extrabold tracking-tight text-blue-400 hover:text-blue-300 transition-colors duration-300"
          style={{ fontFamily: "'Poppins', sans-serif" }}
        >
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
          <select
            onChange={(e) => handleLanguageChange(e.target.value)}
            value={targetLanguage}
            className="bg-gray-800 text-white p-2 rounded border border-gray-600 hover:bg-gray-700 transition-all duration-300"
          >
            <option value="english">English</option>
            <option value="german">German</option>
            <option value="french">French</option>
          </select>
          <button
            onClick={toggleGestureMode}
            className={`px-4 py-2 rounded-md transition-all duration-300 border-2 ${
              isGestureMode
                ? "bg-blue-600 text-white border-blue-400 shadow-[0_0_10px_rgba]"
                : "bg-gray-800 text-gray-200 border-gray-600 hover:bg-gray-700"
            }`}
          >
            Gesture Mode
          </button>
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
            usernames={usernames}
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
      <video ref={videoRef} autoPlay muted style={{ display: "none" }} />
      <canvas ref={canvasRef} width={640} height={480} style={{ display: "none" }} />
    </div>
  );
}