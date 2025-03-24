import axios from "axios";

const REGISTER_API_URL = "http://127.0.0.1:8000/api/v1/users/user/";
const AUTH_API_URL = "http://127.0.0.1:8000/api/v1/users/login/";

export const registerUser = async (data: {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
  profile_image?: File | null;
  phone?: string;
}) => {
  const formData = new FormData();
  formData.append("username", data.username);
  formData.append("email", data.email);
  formData.append("password", data.password);
  formData.append("password_confirm", data.password_confirm);
  if (data.phone) formData.append("phone", data.phone);
  if (data.profile_image) formData.append("profile_image", data.profile_image);

  return axios.post(REGISTER_API_URL, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const loginUser = async (data: { username: string; password: string }) => {
  try {
    const response = await axios.post(AUTH_API_URL, data, {
      headers: { "Content-Type": "application/json" },
    });
    
    if (response.status === 200) {
      const { access, refresh, user_id } = response.data;
      localStorage.setItem("accessToken", access);
      localStorage.setItem("refreshToken", refresh);
      localStorage.setItem("userId", user_id);
      return response.data;
    }
  } catch (error: any) {
    throw error.response?.data || "Ошибка авторизации";
  }
};
