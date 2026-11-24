// frontend/js/auth.js
import { apiRequest } from "./api.js";
import { showToast, closeModal } from "./ui.js";

const TOKEN_KEY = "voting_token";
const USER_KEY = "voting_user";

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function isAdmin() {
    const user = getCurrentUser();
    return user && user.role === "admin";
}

export function isLoggedIn() {
    return !!getToken();
}

export function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    updateAuthUI();
}

export function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    updateAuthUI();
}

export async function login(username, password) {
    try {
        const data = await apiRequest("/auth/login", {
            method: "POST",
            body: JSON.stringify({ username, password })
        });
        setSession(data.access_token, data.user);
        closeModal("auth-modal");
        showToast(`Welcome back, ${data.user.username}!`, "success");
        return data.user;
    } catch (err) {
        showToast(err.message, "error");
        throw err;
    }
}

export async function register(username, password) {
    try {
        const data = await apiRequest("/auth/register", {
            method: "POST",
            body: JSON.stringify({ username, password })
        });
        setSession(data.access_token, data.user);
        closeModal("auth-modal");
        showToast(`Account created! Welcome, ${data.user.username}!`, "success");
        return data.user;
    } catch (err) {
        showToast(err.message, "error");
        throw err;
    }
}

export function logout() {
    clearSession();
    showToast("Signed out successfully.", "info");
}

export async function initAuth() {
    const token = getToken();
    if (token) {
        try {
            const user = await apiRequest("/auth/me");
            localStorage.setItem(USER_KEY, JSON.stringify(user));
        } catch {
            // Token expired or invalid
            clearSession();
        }
    }
    updateAuthUI();
}

export function updateAuthUI() {
    const user = getCurrentUser();
    const userInfoEl = document.getElementById("user-info");
    const userDisplayNameEl = document.getElementById("user-display-name");
    const userRoleBadgeEl = document.getElementById("user-role-badge");
    const btnLogin = document.getElementById("btn-login");
    const btnRegister = document.getElementById("btn-register");
    const btnLogout = document.getElementById("btn-logout");
    const navMyVotes = document.getElementById("nav-my-votes");
    const navAdmin = document.getElementById("nav-admin");

    if (user) {
        userInfoEl?.classList.remove("hidden");
        if (userDisplayNameEl) userDisplayNameEl.textContent = user.username;
        if (userRoleBadgeEl) {
            userRoleBadgeEl.textContent = user.role;
            if (user.role === "admin") {
                userRoleBadgeEl.classList.add("admin");
            } else {
                userRoleBadgeEl.classList.remove("admin");
            }
        }
        btnLogin?.classList.add("hidden");
        btnRegister?.classList.add("hidden");
        btnLogout?.classList.remove("hidden");
        navMyVotes?.classList.remove("hidden");

        if (user.role === "admin") {
            navAdmin?.classList.remove("hidden");
        } else {
            navAdmin?.classList.add("hidden");
        }
    } else {
        userInfoEl?.classList.add("hidden");
        btnLogin?.classList.remove("hidden");
        btnRegister?.classList.remove("hidden");
        btnLogout?.classList.add("hidden");
        navMyVotes?.classList.add("hidden");
        navAdmin?.classList.add("hidden");
    }
}
