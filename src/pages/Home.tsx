import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import axios from "axios";

export default function Home() {
  const [whiteMode, setWhiteMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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
    try {
      const accessToken = localStorage.getItem("accessToken");
      if (!accessToken) {
        alert("Вы не авторизованы!");
        return;
      }
      
      const response = await axios.post("http://127.0.0.1:8000/api/v1/meet/meets/", {}, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const meetingId = response.data.id;
      navigate(`/meet/${meetingId}`);
    } catch (error) {
      console.error("Ошибка при создании встречи", error);
      alert("Ошибка при создании встречи");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 white:bg-gray-900 shadow-md w-full">
      <header className="flex justify-between items-center p-4 bg-white white:bg-gray-800 shadow-md w-full fixed top-0 z-10">
        <h1 className="text-2xl font-bold text-gray-800 white:text-white">Online Meet</h1>
        <div>
          <button
            className="mr-4 text-gray-700 white:text-white"
            onClick={() => setWhiteMode(!whiteMode)}
          >
            {whiteMode ? "☀️ Светлая" : "🌙 Тёмная"}
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
              <Link to="/register" className="px-4 py-2 bg-blue-600 text-white rounded-md shadow-md ml-2 hover:bg-blue-700">
                Зарегистрироваться
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 container mx-auto flex flex-col md:flex-row items-center justify-between p-10 w-full mt-16">
        <div className="max-w-lg mb-10 md:mb-0 text-center md:text-left">
          <h2 className="text-4xl font-semibold text-gray-900 white:text-white leading-tight">
            Видеозвонки и встречи для всех
          </h2>
          <p className="text-gray-600 white:text-gray-400 mt-4">
            Online Meet обеспечивает видеосвязь для совместной работы и общения — где бы вы ни находились.
          </p>
          <div className="mt-6 flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
            <button onClick={createMeeting} className="bg-blue-600 text-white px-6 py-3 rounded-md shadow-md hover:bg-blue-700 transition w-full md:w-auto">
              Новая встреча
            </button>
            <input
              type="text"
              placeholder="Введите код встречи"
              className="border p-3 rounded-md w-full md:w-56 white:bg-gray-700 white:text-white"
            />
            <button className="bg-gray-500 text-white px-4 py-3 rounded-md hover:bg-gray-600 w-full md:w-auto">
              Присоединиться
            </button>
          </div>
        </div>
        <div className="hidden md:block w-full md:w-1/2">
          <img src="https://static.vecteezy.com/system/resources/previews/021/817/865/non_2x/business-women-meeting-in-conference-room-illustration-in-doodle-style-png.png" alt="Meeting" className="w-full max-w-md mx-auto" />
        </div>
      </main>

      <section className="py-12 bg-white white:bg-gray-800 container mx-auto w-full px-4">
        <h2 className="text-3xl font-semibold text-center text-gray-900 white:text-black">Тарифные планы</h2>
        <div className="flex flex-wrap justify-center mt-8 gap-6 w-full">
          {"Basic Pro Business Enterprise".split(" ").map((plan, index) => (
            <div key={index} className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4 bg-gray-200 black:bg-gray-700 p-6 rounded-lg shadow-md text-center">
              <h3 className="text-xl font-bold">{plan}</h3>
              <p className="text-2xl font-semibold mt-2">
                {plan === "Basic" ? "Бесплатно" : plan === "Pro" ? "$19/мес" : plan === "Business" ? "$49/мес" : "По запросу"}
              </p>
              <ul className="mt-4 space-y-2 text-gray-700 white:text-gray-300">
                <li>✅ {plan === "Basic" ? "До 5 языков" : plan === "Pro" ? "До 10 языков" : plan === "Business" ? "30+ языков" : "Все языки"}</li>
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
        © 2025 Online Meet. Все права защищены.
      </footer>
    </div>
  );
}
