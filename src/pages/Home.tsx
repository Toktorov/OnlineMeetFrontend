import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import axios, { AxiosError } from "axios";

// Define the type for the error response from the backend
interface ErrorResponse {
  detail?: string;
  [key: string]: any;
}

// Define the type for the meeting response
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
  meet_participants: any[];
}

export default function Home() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem("darkMode") === "true";
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [shortCode, setShortCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setIsAuthenticated(!!localStorage.getItem("accessToken"));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userId");
    setIsAuthenticated(false);
    navigate("/");
  };

  const createMeeting = async () => {
    setLoading(true);
    setError("");
    try {
      const accessToken = localStorage.getItem("accessToken");
      if (!accessToken) {
        setError("Вы не авторизованы!");
        setLoading(false);
        return;
      }
      
      const response = await axios.post<MeetingResponse>("http://127.0.0.1:8000/api/v1/meet/meets/", {}, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const shortCode = response.data.short_code;
      navigate(`/meet/${shortCode}`);
    } catch (error) {
      console.error("Ошибка при создании встречи", error);
      const axiosError = error as AxiosError<ErrorResponse>;
      if (axiosError.response) {
        console.log("Backend error response:", axiosError.response.data);
        const errorMessage = axiosError.response.data?.detail || JSON.stringify(axiosError.response.data);
        setError(`Ошибка при создании встречи: ${errorMessage}`);
      } else {
        setError("Ошибка при создании встречи: Не удалось подключиться к серверу");
      }
    } finally {
      setLoading(false);
    }
  };

  const joinMeeting = async () => {
    if (!shortCode.trim()) {
      setError("Пожалуйста, введите код встречи");
      return;
    }

    // Strip '#' from the left side of the shortCode
    const cleanedShortCode = shortCode.replace(/^#/, '').trim();

    const shortCodeRegex = /^[A-Z0-9]{6}$/;
    if (!shortCodeRegex.test(cleanedShortCode)) {
      setError("Код встречи должен состоять из 6 символов (A-Z, 0-9)");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const accessToken = localStorage.getItem("accessToken");
      if (!accessToken) {
        setError("Вы не авторизованы!");
        setLoading(false);
        return;
      }

      const response = await axios.get<MeetingResponse>(`http://127.0.0.1:8000/api/v1/meet/meets/${cleanedShortCode}/`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      navigate(`/meet/${response.data.short_code}`);
    } catch (error) {
      console.error("Ошибка при присоединении к встрече", error);
      const axiosError = error as AxiosError<ErrorResponse>;
      if (axiosError.response) {
        console.log("Status Code:", axiosError.response.status);
        console.log("Response Data:", axiosError.response.data);
        if (axiosError.response.status === 404 || 
            axiosError.response.data?.detail?.toLowerCase().includes("not found")) {
          setError("Неверный код встречи");
        } else {
          const errorMessage = axiosError.response.data?.detail || JSON.stringify(axiosError.response.data);
          setError(`Ошибка при присоединении к встрече: ${errorMessage}`);
        }
      } else {
        setError("Ошибка при присоединении к встрече: Не удалось подключиться к серверу");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("darkMode", darkMode.toString());
  }, [darkMode]);

  return (

    <div className="flex flex-col min-h-screen bg-gray-100 white:bg-gray-900 shadow-md w-full">
      <header className="flex justify-between items-center p-4 bg-white white:bg-gray-800 shadow-md w-full fixed top-0 z-10">
        <h1 className="text-2xl font-bold text-gray-800 white:text-white">EchoBridge</h1>
        <div>
          <button
            className={`mr-4 bg-gray-200 text-black dark:bg-black dark:text-white`}
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? "☀️ Светлая" : "🌙 Тёмная"}
          </button>
          {isAuthenticated ? (
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-md shadow-md ml-2 hover:bg-red-700"
            >
              Выйти
            </button>
          ) : (
            <>
              <Link to="/login" className="px-4 py-2 text-primary hover:underline">
                Войти
              </Link>
              <Link to="/register" className="px-4 py-2 bg-blue-600 text-white rounded-md shadow-md ml-2 hover:bg-blue-700 hover:text-white">
                Зарегистрироваться
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="flex-1  mx-auto flex flex-col md:flex-row items-center justify-between p-10 w-full mt-16">
        <div className="max-w-lg mb-10 md:mb-0 text-center md:text-left">
          <h2 className="text-4xl font-semibold text-gray-900 dark:text-white leading-tight">
            Видеозвонки и встречи для всех
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-4">
            EchoBridge обеспечивает видеосвязь для совместной работы и общения — где бы вы ни находились.
          </p>
          {error && <p className="text-red-500 mt-4">{error}</p>}
          <div className="mt-6 flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
            <button
              onClick={createMeeting}
              className="bg-blue-600 text-white px-6 py-3 rounded-md shadow-md hover:bg-blue-700 transition w-full md:w-auto disabled:bg-blue-400"
              disabled={loading}
            >
              {loading ? "Создание..." : "Новая встреча"}
            </button>
            <input
              type="text"
              placeholder="Введите код встречи"
              className="border p-3 rounded-md w-full md:w-[130px] dark:bg-gray-700 dark:text-white"
              value={shortCode}
              onChange={(e) => {
                setShortCode(e.target.value);
                setError("");
              }}
              className="border p-3 rounded-md w-full md:w-56 white:bg-gray-700 white:text-white"
              disabled={loading}
            />
            <button
              onClick={joinMeeting}
              className="bg-gray-500 text-white px-4 py-3 rounded-md hover:bg-gray-600 w-full md:w-auto disabled:bg-gray-300"
              disabled={loading}
            >
              {loading ? "Присоединение..." : "Присоединиться"}
            </button>
          </div>
        </div>
        <div className="hidden md:block w-full md:w-1/2">
          <img
            src="https://static.vecteezy.com/system/resources/previews/021/817/865/non_2x/business-women-meeting-in-conference-room-illustration-in-doodle-style-png.png"
            alt="Meeting"
            className="w-full max-w-md mx-auto"
          />
        </div>
      </main>

      <section className="py-12 bg-white dark:bg-gray-800 container mx-auto w-full px-4">
        <h2 className="text-3xl font-semibold text-center text-gray-900 dark:text-white">Тарифные планы</h2>
        <div className="flex flex-wrap justify-center mt-8 gap-6 w-full">
          {"Basic Pro Business Enterprise".split(" ").map((plan, index) => (
            <div key={index} className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4 bg-gray-200 dark:bg-gray-700 p-6 rounded-lg shadow-md text-center">
              <h3 className="text-xl text-gray-900 dark:text-white font-bold">{plan}</h3>
              <p className="text-2xl text-gray-800 dark:text-white font-semibold mt-2">
                {plan === "Basic" ? "Бесплатно" : plan === "Pro" ? "$19/мес" : plan === "Business" ? "$49/мес" : "По запросу"}
              </p>
              <ul className="mt-4 space-y-2 text-gray-700 white:text-gray-300">
                <li>✅ {plan === "Basic" ? "До 5 языков" : plan === "Pro" ? "До 10 языков" : plan === "Business" ? "30+ языков" : "Все языков"}</li>
                <li>✅ {plan === "Basic" ? "40 минут встречи" : "Безлимитное время"}</li>
              </ul>
              <button className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition">
                {plan === "Basic" ? "Попробовать" : "Купить"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-center p-4 bg-gray-800 text-white mt-10">
        © 2025 EchoBridge. Все права защищены.
      </footer>
    </div>
  );
}