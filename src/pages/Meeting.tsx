import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import SimplePeer from "simple-peer";
import { io, Socket } from "socket.io-client";

interface UserData {
  username: string;
  email: string;
}

export default function Meeting() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isStreamStarted, setIsStreamStarted] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [newUser, setNewUser] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Map<string, any>>(new Map());

  const fetchUserData = async () => {
    try {
      const userId = localStorage.getItem("userId");
      const accessToken = localStorage.getItem("accessToken");
      if (!userId || !accessToken) {
        setError("Пользователь не авторизован");
        return;
      }

      const response = await axios.get(`http://127.0.0.1:8000/api/v1/users/user/${userId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setUserData(response.data);
      console.log("User Data:", response.data);
      return userId;
    } catch (err) {
      console.error("Error fetching user data:", err);
      setError("Ошибка загрузки данных пользователя");
      return null;
    }
  };

  const getUserMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setVideoStream(stream);
      console.log("Video Stream:", stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play();
      }
    } catch (err) {
      console.error("Error accessing camera and microphone:", err);
      setError("Ошибка доступа к камере и микрофону");
    }
  };

  const startStream = async () => {
    console.log("Starting stream...");
    const userId = await fetchUserData();
    if (!userId) return;

    await getUserMedia();
    if (!videoStream) return;

    socketRef.current?.emit("join-room", roomId, userId);
    setIsStreamStarted(true);
    console.log("Stream started");
  };

  useEffect(() => {
    console.log("useEffect running");

    try {
      socketRef.current = io("http://localhost:3001", {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
    } catch (err) {
      console.error("Failed to connect to signaling server:", err);
      setError("Ошибка подключения к серверу видеовстреч");
      return;
    }

    const onConnect = () => {
      console.log("Connected to signaling server");
    };

    const onConnectError = (err: Error) => {
      console.error("Socket connection error:", err);
      setError("Ошибка подключения к серверу видеовстреч: " + err.message);
    };

    const onDisconnect = (reason: string) => {
      console.log("Disconnected from signaling server:", reason);
      setError("Отключено от сервера видеовстреч: " + reason);
    };

    const onParticipants = (participants: string[]) => {
      console.log("Received participants:", participants);
      setParticipants(participants);
    };

    const onUserConnected = (userId: string) => {
      console.log("User connected:", userId);
      setNewUser(userId);
    };

    const onSignal = (data: { userId: string; signal: any }) => {
      const { userId, signal } = data;
      if (!peersRef.current) {
        console.error("peersRef.current is undefined in onSignal");
        return;
      }
      const peer = peersRef.current.get(userId);
      if (peer) {
        try {
          peer.signal(signal);
        } catch (err) {
          console.error("Error signaling peer:", userId, err);
        }
      }
    };

    const onUserDisconnected = (userId: string) => {
      console.log("User disconnected:", userId);
      if (!peersRef.current) {
        console.error("peersRef.current is undefined in onUserDisconnected");
        return;
      }
      const peer = peersRef.current.get(userId);
      if (peer) {
        peer.destroy();
        peersRef.current.delete(userId);
        setRemoteStream(null);
        console.log("Remote stream cleared due to user disconnect");
      }
    };

    // Attach event listeners
    socketRef.current.on("connect", onConnect);
    socketRef.current.on("connect_error", onConnectError);
    socketRef.current.on("disconnect", onDisconnect);
    socketRef.current.on("participants", onParticipants);
    socketRef.current.on("user-connected", onUserConnected);
    socketRef.current.on("signal", onSignal);
    socketRef.current.on("user-disconnected", onUserDisconnected);

    return () => {
      // Remove event listeners to prevent stale callbacks
      socketRef.current?.off("connect", onConnect);
      socketRef.current?.off("connect_error", onConnectError);
      socketRef.current?.off("disconnect", onDisconnect);
      socketRef.current?.off("participants", onParticipants);
      socketRef.current?.off("user-connected", onUserConnected);
      socketRef.current?.off("signal", onSignal);
      socketRef.current?.off("user-disconnected", onUserDisconnected);

      // Cleanup
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
      if (peersRef.current) {
        peersRef.current.forEach(peer => peer.destroy());
        peersRef.current.clear();
      } else {
        console.error("peersRef.current is undefined in useEffect cleanup");
      }
      socketRef.current?.disconnect();
    };
  }, [roomId]);

  useEffect(() => {
    if (!videoStream || participants.length === 0) return;

    participants.forEach(userId => {
      if (!peersRef.current) {
        console.error("peersRef.current is undefined in participants useEffect");
        return;
      }
      if (peersRef.current.has(userId)) return;

      try {
        console.log("Creating peer for participant:", userId);
        const peer = new SimplePeer({
          initiator: true,
          trickle: false,
          stream: videoStream,
          config: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
            ],
          },
        });

        peer.on("signal", (signal) => {
          socketRef.current?.emit("signal", { roomId, userId, signal });
        });

        peer.on("stream", (remoteStream) => {
          setRemoteStream(remoteStream);
          console.log("Received remote stream:", remoteStream);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(err => {
              console.error("Error playing remote video:", err);
              setError("Ошибка воспроизведения видео участника");
            });
          }
        });

        peer.on("error", (err) => {
          console.error("Peer error:", err);
          setError("Ошибка соединения с участником");
        });

        peersRef.current.set(userId, peer);
      } catch (err) {
        console.error("Error creating peer for participant:", userId, err);
      }
    });
  }, [videoStream, participants, roomId]);

  useEffect(() => {
    if (!videoStream || !newUser) return;

    if (!peersRef.current) {
      console.error("peersRef.current is undefined in newUser useEffect");
      return;
    }
    if (peersRef.current.has(newUser)) return;

    try {
      console.log("Creating peer for new user:", newUser);
      const peer = new SimplePeer({
        initiator: false,
        trickle: false,
        stream: videoStream,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
          ],
        },
      });

      peer.on("signal", (signal) => {
        socketRef.current?.emit("signal", { roomId, userId: newUser, signal });
      });

      peer.on("stream", (remoteStream) => {
        setRemoteStream(remoteStream);
        console.log("Received remote stream:", remoteStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play().catch(err => {
            console.error("Error playing remote video:", err);
            setError("Ошибка воспроизведения видео участника");
          });
        }
      });

      peer.on("error", (err) => {
        console.error("Peer error:", err);
        setError("Ошибка соединения с участником");
      });

      peersRef.current.set(newUser, peer);
      setNewUser(null);
    } catch (err) {
      console.error("Error creating peer for new user:", newUser, err);
    }
  }, [videoStream, newUser, roomId]);

  const leaveMeeting = () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    if (peersRef.current) {
      peersRef.current.forEach(peer => peer.destroy());
      peersRef.current.clear();
    } else {
      console.error("peersRef.current is undefined in leaveMeeting");
    }
    navigate("/");
  };

  const toggleVideo = () => {
    if (videoStream) {
      videoStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOn(!isVideoOn);
    }
  };

  const toggleAudio = () => {
    if (videoStream) {
      videoStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsAudioOn(!isAudioOn);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 text-white p-6 items-center justify-center">
      {error && <p className="text-red-500">{error}</p>}
      <h1 className="text-3xl font-bold">Видеовстреча #{roomId}</h1>
      <p className="mt-2">
        Ссылка для подключения:{" "}
        <a href={window.location.href} className="text-blue-400 underline">
          {window.location.href}
        </a>
      </p>
      {userData && (
        <div className="mt-4 text-center">
          <p className="text-lg">Пользователь: {userData.username}</p>
          <p className="text-lg">Email: {userData.email}</p>
        </div>
      )}
      {!isStreamStarted ? (
        <button
          onClick={startStream}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
        >
          Начать видеовстречу
        </button>
      ) : (
        <>
          <div className="mt-6 w-full max-w-4xl flex gap-4 justify-center">
            <div className="w-1/2">
              {videoStream ? (
                <div className="relative">
                  <video
                    className="w-full rounded-lg shadow-lg"
                    style={{ transform: "scaleX(-1)" }}
                    autoPlay
                    playsInline
                    muted
                    ref={localVideoRef}
                  />
                  <p className="absolute bottom-2 left-2 text-white bg-black bg-opacity-50 px-2 py-1 rounded">
                    Вы ({userData?.username || "Local"})
                  </p>
                </div>
              ) : (
                <p className="text-gray-400">Ожидание доступа к камере...</p>
              )}
            </div>
            <div className="w-1/2">
              {remoteStream ? (
                <div className="relative">
                  <video
                    className="w-full rounded-lg shadow-lg"
                    autoPlay
                    playsInline
                    ref={remoteVideoRef}
                  />
                  <p className="absolute bottom-2 left-2 text-white bg-black bg-opacity-50 px-2 py-1 rounded">
                    Участник
                  </p>
                </div>
              ) : (
                <p className="text-gray-400">Ожидание другого участника...</p>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-4">
            <button
              onClick={toggleVideo}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
            >
              {isVideoOn ? "Выключить камеру" : "Включить камеру"}
            </button>
            <button
              onClick={toggleAudio}
              className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition"
            >
              {isAudioOn ? "Выключить микрофон" : "Включить микрофон"}
            </button>
            <button
              onClick={leaveMeeting}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition"
            >
              Покинуть встречу
            </button>
          </div>
        </>
      )}
    </div>
  );
}