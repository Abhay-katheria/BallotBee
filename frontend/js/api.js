// frontend/js/api.js

const API_BASE = "/api";

function formatApiError(data, status) {
    if (!data) {
        return `Request failed with status ${status}`;
    }

    if (typeof data.detail === "string") {
        return data.detail;
    }

    if (Array.isArray(data.detail)) {
        const messages = data.detail.map(item => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object") {
                let field = "";
                if (Array.isArray(item.loc)) {
                    const relevantLoc = item.loc.filter(p => p !== "body" && p !== "query" && p !== "path");
                    field = relevantLoc.join(".") || item.loc.join(".");
                }
                const msg = item.msg || JSON.stringify(item);
                return field ? `${field}: ${msg}` : msg;
            }
            return String(item);
        });
        return messages.join("; ") || `Request failed with status ${status}`;
    }

    if (data.detail && typeof data.detail === "object") {
        return data.detail.msg || JSON.stringify(data.detail);
    }

    if (data.message && typeof data.message === "string") {
        return data.message;
    }

    return `Request failed with status ${status}`;
}

export async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem("voting_token");
    const headers = {
        ...(options.headers || {})
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    if (options.body && !(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    let data = null;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        data = await response.json();
    }

    if (!response.ok) {
        const errorMsg = formatApiError(data, response.status);
        const error = new Error(errorMsg);
        error.status = response.status;
        error.data = data;
        throw error;
    }

    return data;
}
