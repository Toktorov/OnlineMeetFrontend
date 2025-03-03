import { useForm } from "react-hook-form";
import { useState } from "react";
import { loginUser } from "../api/auth";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const { register, handleSubmit } = useForm();
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const onSubmit = async (data: any) => {
    try {
      await loginUser(data);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Ошибка авторизации");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 shadow-md w-full fixed top-0 z-10">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">Вход в аккаунт</h2>
          <p className="text-gray-500">Введите данные для входа</p>
        </div>
        {error && <p className="text-red-500 text-center">{error}</p>}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400" type="text" placeholder="Имя пользователя" {...register("username")} required />
          <input className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400" type="password" placeholder="Пароль" {...register("password")} required />
          <button className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition" type="submit">
            Войти
          </button>
        </form>
        <p className="text-center text-gray-500 mt-4">
          Нет аккаунта? <a href="/register" className="text-blue-500">Зарегистрироваться</a>
        </p>
      </div>
    </div>
  );
}
