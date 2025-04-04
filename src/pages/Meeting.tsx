if (typeof process === "undefined") {
  (window as any).process = {};
}
if (!process.nextTick) {
  process.nextTick = (callback: (...args: any[]) => void, ...args: any[]) => {
    setTimeout(() => callback(...args), 0);
  };
}

import { useEffect, useState, useRef, memo } from "react";
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
import Select, { components } from "react-select";
import Flag from "react-world-flags";

interface UserAVI {
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
  const [userData, setUserData] = useState<UserAVI | null>(null);
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
  const [userLanguage, setUserLanguage] = useState(localStorage.getItem("userLanguage") || "en");
  const [voiceGender, setVoiceGender] = useState(localStorage.getItem("voiceGender") || "MALE");
  const [isGestureMode, setIsGestureMode] = useState(false);
  const [participantsLanguages, setParticipantsLanguages] = useState<Map<string, string>>(new Map());
  const socketIdToUserIdRef = useRef<Map<string, string>>(new Map());
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const videoPeersRef = useRef<Map<string, SimplePeerInstance>>(new Map());
  const screenSharePeersRef = useRef<Map<string, SimplePeerInstance>>(new Map());
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioSocketRef = useRef<W3CWebSocket | null>(null);
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
      stream.getAudioTracks().forEach(track => track.enabled = true);
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
        if (socketRef.current) {
          socketRef.current.emit("get-participants", roomId, (participants: Participant[]) => {
            if (participants.length === 0 && attempt < 3) {
              console.warn(`[fetchParticipants] Attempt ${attempt}: No participants received, retrying...`);
              setTimeout(() => attemptFetch(attempt + 1), 500);
            } else {
              setParticipants(participants);
              resolve(participants);
            }
          });
        }
      };

      attemptFetch(1);
    });
  };

  const startScreenShare = async () => {
    if (screenShareUserId) {
      toast.dismiss();
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
          toast.dismiss();
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
          toast.dismiss();
          toast.success("Screen sharing ended", { position: "top-center" });
        };
      }
    } catch (err: any) {
      console.error("[startScreenShare] Error starting screen share:", err);
      if (err.name === "NotAllowedError") {
        toast.dismiss();
        toast("Screen sharing canceled", { position: "top-center" });
      } else {
        setError("Failed to start screen sharing");
      }
    }
  };

  const copyShortCode = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId).then(() => {
        toast.dismiss();
        toast.success(`Meeting Code copied: ${roomId}`, { position: "top-center", duration: 2000 });
      });
    }
  };

  const handleLanguageChange = (lang: string) => {
    const languageMap: { [key: string]: string } = {
      "english": "en",
      "german": "de",
      "french": "fr",
      "spanish": "es",
      "arabic": "ar",
      "russian": "ru",
      "chinese": "zh",
      "hindi": "hi",
      "portuguese": "pt",
      "bengali": "bn",
    };
    const newLanguage = languageMap[lang] || "en";
    setUserLanguage(newLanguage);
    localStorage.setItem("userLanguage", newLanguage);

    if (translationSocket?.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        user_language: newLanguage,
      });
      translationSocket.send(message);
    }
  };

  const handleGenderChange = (gender: string) => {
    setVoiceGender(gender);
    localStorage.setItem("voiceGender", gender);

    if (translationSocket?.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        voice_gender: gender,
      });
      translationSocket.send(message);
    }
  };

  const setupTranslationSocket = () => {
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) {
      console.error("No access token found in localStorage.");
      setError("User not authenticated. Please log in again.");
      return;
    }

    const ws = new W3CWebSocket(`ws://localhost:8000/ws/translate/${roomId}/?token=${accessToken}`);
    setTranslationSocket(ws);

    ws.onopen = () => {
      console.log("Translation WebSocket connected");
      ws.send(JSON.stringify({
        user_language: userLanguage,
        voice_gender: voiceGender,
        gesture_mode: isGestureMode
      }));
      ws.send(JSON.stringify({ request_participants_languages: true }));
    };

    const pendingAudioMessages: { id: string; data: any }[] = [];

    ws.onmessage = (event) => {
      try {
        const messageData = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data);
        const data = JSON.parse(messageData);
        console.log("WebSocket message received:", data);

        const messageId = `${data.speaker_id || 'unknown'}-${Date.now()}`;

        if (data.type === "audio") {
          if (data.speaker_id === userData?.id) {
            return;
          }

          const audioBase64 = data.audio;
          if (!audioBase64 || !/^[A-Za-z0-9+/=]+$/.test(audioBase64)) {
            console.error("Invalid base64 audio data received:", audioBase64);
            return;
          }

          if (participantsLanguages.size === 0) {
            console.log("Participants languages not yet loaded, queuing audio message");
            pendingAudioMessages.push({ id: messageId, data });
            ws.send(JSON.stringify({ request_participants_languages: true }));
            return;
          }

          playAudio(audioBase64);

        } else if (data.type === "participants_languages") {
          const langMap = new Map<string, string>(Object.entries(data.languages));
          setParticipantsLanguages(langMap);

          if (pendingAudioMessages.length > 0) {
            console.log("Processing queued audio messages:", pendingAudioMessages.length);
            pendingAudioMessages.forEach(({data: queuedData }) => {
              if (queuedData.speaker_id !== userData?.id) {
                playAudio(queuedData.audio);
              }
            });
            pendingAudioMessages.length = 0;
          }
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    const playAudio = (audioBase64: string) => {
      const audioData = Uint8Array.from(atob(audioBase64).split("").map(char => char.charCodeAt(0)));
      const audioBlob = new Blob([audioData], { type: "audio/mp3" } as BlobPropertyBag);
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play()
        .then(() => URL.revokeObjectURL(audioUrl))
        .catch(err => console.error("Error playing audio:", err));
    };

    ws.onerror = (err) => {
      console.error("Translation WebSocket error:", err);
      setError("Failed to connect to translation server.");
    };

    ws.onclose = (event) => {
      console.log("Translation WebSocket closed:", event.code, event.reason);
      if (!isLeavingRef.current) {
        setTimeout(setupTranslationSocket, 3000);
      }
    };
  };

  const setupAudioSocket = () => {
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) {
      console.error("No access token for audio socket");
      return;
    }

    const ws = new W3CWebSocket(`ws://localhost:8000/ws/translate/${roomId}/?token=${accessToken}`);
    audioSocketRef.current = ws;

    ws.onopen = () => {
      console.log("Audio WebSocket connected");
    };

    ws.onerror = (err) => {
      console.error("Audio WebSocket error:", err);
    };

    ws.onclose = (event) => {
      console.log("Audio WebSocket closed:", event.code, event.reason);
    };
  };

  const startAudioStreaming = () => {
    if (!videoStream) {
      console.warn("Cannot start audio streaming: No stream");
      return;
    }

    if (!audioSocketRef.current || audioSocketRef.current.readyState !== WebSocket.OPEN) {
      setupAudioSocket();
    }

    const audioStream = new MediaStream(videoStream.getAudioTracks());
    const audioTracks = audioStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.error("No audio tracks available in the stream");
      setError("No audio input detected. Please check your microphone.");
      return;
    }

    audioTracks.forEach(track => {
      if (!track.enabled) track.enabled = true;
    });

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(audioStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const ENERGY_THRESHOLD = 40;
    const SILENCE_THRESHOLD_MS = 180;
    let isSpeaking = false;
    let silenceStart: number | null = null;
    let audioChunks: Blob[] = [];

    const recorder = new MediaRecorder(audioStream, { mimeType: "audio/webm;codecs=opus" });
    audioRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    recorder.onstop = () => {
      if (audioChunks.length > 0 && audioSocketRef.current?.readyState === WebSocket.OPEN) {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm;codecs=opus" } as BlobPropertyBag);
        audioBlob.arrayBuffer().then(buffer => {
          if (buffer.byteLength > 1000) {
            console.log("Sending audio buffer with speech, size:", buffer.byteLength);
            audioSocketRef.current?.send(buffer);
          }
        }).catch(err => console.error("Error converting to array buffer:", err));
      }
      audioChunks = [];
      if (audioContext.state === "suspended") audioContext.resume();
    };

    const detectSpeech = () => {
      analyser.getByteFrequencyData(dataArray);
      const averageEnergy = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;

      if (averageEnergy > ENERGY_THRESHOLD) {
        if (!isSpeaking) {
          console.log("Speech detected, starting recording");
          isSpeaking = true;
          silenceStart = null;
          if (recorder.state === "inactive") {
            audioChunks = [];
            recorder.start();
          }
        }
      } else if (isSpeaking) {
        if (silenceStart === null) silenceStart = Date.now();
        else if (Date.now() - silenceStart >= SILENCE_THRESHOLD_MS) {
          console.log("Silence detected, stopping recording");
          isSpeaking = false;
          silenceStart = null;
          if (recorder.state === "recording") recorder.stop();
        }
      }
    };

    const detectionInterval = setInterval(detectSpeech, 50);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (audioContext.state === "suspended") audioContext.resume();
        if (recorder.state === "inactive" && isSpeaking) recorder.start();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    recorder.onstart = () => console.log("Recorder started, state:", recorder.state);
    recorder.onerror = (err) => console.error("Recorder error:", err);

    return () => {
      clearInterval(detectionInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  };

  const startGestureStreaming = () => {
    if (!videoStream || !videoRef.current || !canvasRef.current || !translationSocket || translationSocket.readyState !== WebSocket.OPEN) {
      console.warn("Cannot start gesture streaming: Missing stream, refs, or WebSocket not connected");
      return;
    }
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    videoRef.current.srcObject = videoStream;
    videoRef.current.play();

    const sendFrame = () => {
      if (!isGestureMode || translationSocket.readyState !== WebSocket.OPEN) return;
      context.drawImage(videoRef.current!, 0, 0, 640, 480);
      const frameData = canvas.toDataURL("image/jpeg", 0.5).split(",")[1];
      translationSocket.send(JSON.stringify({ video_frame: frameData }));
      setTimeout(sendFrame, 200);
    };
    sendFrame();
  };

  const toggleGestureMode = () => {
    setIsGestureMode((prev) => {
      const newMode = !prev;

      toast.dismiss();
      toast("Gesture Mode is under development", {
        position: "top-center",
        duration: 3000,
        style: { background: "#ffcc00", color: "#000" },
      });

      if (translationSocket?.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({
          gesture_mode: newMode,
        });
        translationSocket.send(message);
        console.log(`Sent gesture mode toggle: ${message}`);
      }

      return newMode;
    });
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
    socket.on("connect_error", (err) => setError(`Error connecting to the video meeting server: ${err.message}`));
    socket.on("disconnect", (reason) => {
      if (!isLeavingRef.current) setError(`Disconnected from the video meeting server: ${reason}`);
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
          stream: isScreenShare ? screenShareStream || undefined : videoStream || undefined,
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
          if (peer && !(peer as any).destroyed) {
            peer.destroy();
          }
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

    socket.on("screen-share-stop", () => {
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
      isLeavingRef.current = true;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (translationSocket) {
        translationSocket.close();
        setTranslationSocket(null);
      }
      if (audioSocketRef.current) {
        audioSocketRef.current.close();
        audioSocketRef.current = null;
      }
      if (audioRecorderRef.current && audioRecorderRef.current.state !== "inactive") {
        audioRecorderRef.current.stop();
        audioRecorderRef.current = null;
      }
      if (videoStream) {
        videoStream.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
        setVideoStream(null);
      }
      if (screenShareStream) {
        screenShareStream.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
        setScreenShareStream(null);
      }
      videoPeersRef.current.forEach(peer => peer.destroy());
      screenSharePeersRef.current.forEach(peer => peer.destroy());
      videoPeersRef.current.clear();
      screenSharePeersRef.current.clear();
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
        const senderLanguage = participantsLanguages.get(userId) || "en";
        const shouldMute = senderLanguage !== userLanguage;
        remoteStream.getAudioTracks().forEach(track => {
          track.enabled = !shouldMute;
          console.log(`WebRTC audio for ${userId} ${shouldMute ? "muted" : "unmuted"} based on language comparison`);
        });
        setRemoteStreams(prev => new Map(prev).set(userId, remoteStream));
      });

      peer.on("error", () => {
        if (!(peer as any).destroyed) peer.destroy();
        videoPeersRef.current.delete(userId);
      });

      videoPeersRef.current.set(userId, peer);
    });

    remoteStreams.forEach((stream, userId) => {
      const senderLanguage = participantsLanguages.get(userId) || "en";
      const shouldMute = senderLanguage !== userLanguage;
      stream.getAudioTracks().forEach(track => {
        if (track.enabled !== !shouldMute) {
          track.enabled = !shouldMute;
          console.log(`Updated WebRTC audio for ${userId} to ${shouldMute ? "muted" : "unmuted"} based on language`);
        }
      });
    });
  }, [videoStream, userData, participants, roomId, participantsLanguages, userLanguage, remoteStreams]);

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

    if (videoStream) {
      videoStream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
    }
    if (screenShareStream) {
      screenShareStream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (translationSocket) {
      translationSocket.close();
      setTranslationSocket(null);
    }
    if (audioSocketRef.current) {
      audioSocketRef.current.close();
      audioSocketRef.current = null;
    }

    if (audioRecorderRef.current) {
      if (audioRecorderRef.current.state !== "inactive") {
        audioRecorderRef.current.stop();
      }
      audioRecorderRef.current = null;
    }

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
    setParticipantsLanguages(new Map());

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

  const connectedParticipantsCount = isStreamStarted
    ? new Set(participants.map(p => p.userId).concat(userData?.id || [])).size
    : 0;

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

  const languageOptions = [
    { value: "english", label: "English", code: "GB" },
    { value: "german", label: "German", code: "DE" },
    { value: "french", label: "French", code: "FR" },
    { value: "spanish", label: "Spanish", code: "ES" },
    { value: "arabic", label: "Arabic", code: "SA" },
    { value: "russian", label: "Russian", code: "RU" },
    { value: "chinese", label: "Chinese (Mandarin)", code: "CN" },
    { value: "hindi", label: "Hindi", code: "IN" },
    { value: "portuguese", label: "Portuguese", code: "PT" },
    { value: "bengali", label: "Bengali", code: "BD" },
  ];

  const CustomOption = (props: any) => (
    <components.Option {...props}>
      <div className="flex items-center gap-2">
        <Flag code={props.data.code} height="16" width="24" />
        <span>{props.data.label}</span>
      </div>
    </components.Option>
  );

  const CustomSingleValue = memo((props: any) => (
    <components.SingleValue {...props}>
      <div className="flex items-center gap-2">
        <Flag code={props.data.code} height="16" width="24" />
        <span>{props.data.label}</span>
      </div>
    </components.SingleValue>
  ));

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
          <Select
            options={languageOptions}
            value={languageOptions.find(option =>
              option.value === (
                userLanguage === "en" ? "english" :
                userLanguage === "de" ? "german" :
                userLanguage === "fr" ? "french" :
                userLanguage === "es" ? "spanish" :
                userLanguage === "ar" ? "arabic" :
                userLanguage === "ru" ? "russian" :
                userLanguage === "zh" ? "chinese" :
                userLanguage === "hi" ? "hindi" :
                userLanguage === "pt" ? "portuguese" :
                userLanguage === "bn" ? "bengali" : "english"
              )
            )}
            onChange={(selectedOption) => handleLanguageChange(selectedOption ? selectedOption.value : "english")}
            components={{ Option: CustomOption, SingleValue: CustomSingleValue }}
            className="w-48"
            classNamePrefix="react-select"
            styles={{
              control: (base) => ({
                ...base,
                backgroundColor: "#1F2937",
                borderColor: "#4B5563",
                color: "white",
                "&:hover": {
                  backgroundColor: "#374151",
                  borderColor: "#4B5563",
                },
              }),
              menu: (base) => ({
                ...base,
                backgroundColor: "#1F2937",
              }),
              option: (base, { isFocused }) => ({
                ...base,
                backgroundColor: isFocused ? "#374151" : "#1F2937",
                color: "white",
                "&:active": {
                  backgroundColor: "#4B5563",
                },
              }),
              singleValue: (base) => ({
                ...base,
                color: "white",
              }),
              input: (base) => ({
                ...base,
                color: "white",
              }),
            }}
          />
          <select
            onChange={(e) => handleGenderChange(e.target.value)}
            value={voiceGender}
            className="bg-gray-800 text-white p-2 rounded border border-gray-600 hover:bg-gray-700 transition-all duration-300"
          >
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select>
          <button
            onClick={toggleGestureMode}
            className={`px-4 py-2 rounded-md transition-all duration-300 border-2 ${
              isGestureMode
                ? "bg-gray-800 text-gray-200 border-gray-600 hover:bg-gray-700"
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