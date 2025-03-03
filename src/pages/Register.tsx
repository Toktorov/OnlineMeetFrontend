import { useForm } from "react-hook-form";
import { useRef, useState } from "react";
import { registerUser } from "../api/auth";
import { Link } from "react-router-dom";

export default function Register() {
  const { register, handleSubmit, setValue } = useForm();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setValue("profile_image", e.target.files[0]);
    }
  };

  const onSubmit = async (data: any) => {
    if (data.password !== data.password_confirm) {
      setError("Пароли не совпадают");
      return;
    }

    try {
      await registerUser(data);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.message || "Ошибка регистрации");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 shadow-md w-full fixed top-0 z-10">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">Регистрация</h2>
          <p className="text-gray-500">Создайте аккаунт, чтобы начать</p>
        </div>
        {error && <p className="text-red-500 text-center">{error}</p>}
        {success ? (
          <p className="text-green-500 text-center">Регистрация успешна! <Link to="/login" className="text-blue-500">Войти</Link></p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <input className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400" type="text" placeholder="Имя пользователя" {...register("username")} />
            <input className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400" type="email" placeholder="Email" {...register("email")} />
            <input className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400" type="password" placeholder="Пароль" {...register("password")} />
            <input className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400" type="password" placeholder="Повторите пароль" {...register("password_confirm")} />
            <input className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400" type="text" placeholder="Телефон (необязательно)" {...register("phone")} />
            <div className="w-full bg-gray-100 p-3 rounded-lg border border-gray-300">
              <label className="block text-gray-700">Фото профиля</label>
              <input type="file" className="w-full mt-2" ref={fileInputRef} onChange={onFileChange} />
            </div>
            <button className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition" type="submit">
              Зарегистрироваться
            </button>
          </form>
        )}
        <p className="text-center text-gray-500 mt-4">
          Уже есть аккаунт? <Link to="/login" className="text-blue-500">Войти</Link>
        </p>
      </div>
    </div>
  );
}
