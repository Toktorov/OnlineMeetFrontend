import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

interface UserData {
    username: string;
    email: string;
}

export default function Meeting() {
  const { id } = useParams();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userId = localStorage.getItem("userId");
        const accessToken = localStorage.getItem("accessToken");
        if (!userId || !accessToken) {
          setError("Пользователь не авторизован");
          return;
        }
        
        const response = await axios.get(`https://meet.arzanall.kg/api/v1/users/users/${userId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setUserData(response.data);
      } catch (err) {
        setError("Ошибка загрузки данных пользователя");
      }
    };

    const getUserMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setVideoStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setError("Ошибка доступа к камере и микрофону");
      }
    };

    fetchUserData();
    getUserMedia();
  }, [id]);

  const toggleVideo = () => {
    if (videoStream) {
      videoStream.getVideoTracks().forEach(track => track.enabled = !track.enabled);
      setIsVideoOn(!isVideoOn);
    }
  };

  const toggleAudio = () => {
    if (videoStream) {
      videoStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
      setIsAudioOn(!isAudioOn);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 text-white p-6 items-center justify-center">
      {error && <p className="text-red-500">{error}</p>}
      <h1 className="text-3xl font-bold">Видеовстреча #{id}</h1>
      <p className="mt-2">Ссылка для подключения: <a href={window.location.href} className="text-blue-400 underline">{window.location.href}</a></p>
      {userData && (
        <div className="mt-4 text-center">
          <p className="text-lg">Пользователь: {userData.username}</p>
          <p className="text-lg">Email: {userData.email}</p>
        </div>
      )}
      <div className="mt-6 w-full max-w-lg">
        {videoStream ? (
          <video className="w-full rounded-lg shadow-lg" autoPlay playsInline ref={videoRef}></video>
        ) : (
          <p className="text-gray-400">Ожидание доступа к камере...</p>
        )}
      </div>
      <div className="mt-4 flex gap-4">
        <button onClick={toggleVideo} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition">
          {isVideoOn ? "Выключить камеру" : "Включить камеру"}
        </button>
        <button onClick={toggleAudio} className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition">
          {isAudioOn ? "Выключить микрофон" : "Включить микрофон"}
        </button>
      </div>
    </div>
  );
}