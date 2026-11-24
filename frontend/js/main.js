// frontend/js/main.js
import { initAuth, login, register, logout, isAdmin, isLoggedIn } from "./auth.js";
import { 
    loadPolls, 
    setFilter, 
    switchChartType, 
    showPollResults, 
    getLastCelebratedPollId, 
    closeWinnerModal, 
    initGlobalTicker,
    setSearchQuery,
    startAutoRefresh,
    closeResultsModal
} from "./polls.js";
import { initAdminPanel, addOptionRow, handleCreatePoll } from "./admin.js";
import { loadMyVotes } from "./myVotes.js";
import { openModal, closeModal, switchSection, showToast } from "./ui.js";

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Initialize Authentication state
    await initAuth();

    // 2. Start continuous global countdown ticker & background auto-refresh
    initGlobalTicker();
    startAutoRefresh();

    // 3. Initial load of polls
    await loadPolls();

    // 4. Navigation between Views
    document.getElementById("nav-polls")?.addEventListener("click", () => {
        switchSection("view-polls");
        loadPolls();
    });

    document.getElementById("nav-my-votes")?.addEventListener("click", () => {
        if (!isLoggedIn()) {
            showToast("Please sign in to view your voting history.", "info");
            openModal("auth-modal");
            return;
        }
        switchSection("view-my-votes");
        loadMyVotes();
    });

    document.getElementById("nav-admin")?.addEventListener("click", () => {
        if (!isAdmin()) {
            showToast("Admin access required.", "error");
            return;
        }
        switchSection("view-admin");
        initAdminPanel();
    });

    // 5. Live Search Controls
    const searchInput = document.getElementById("poll-search-input");
    const clearBtn = document.getElementById("btn-search-clear");

    searchInput?.addEventListener("input", (e) => {
        const val = e.target.value;
        if (val.trim()) {
            clearBtn?.classList.remove("hidden");
        } else {
            clearBtn?.classList.add("hidden");
        }
        setSearchQuery(val);
    });

    clearBtn?.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        clearBtn.classList.add("hidden");
        setSearchQuery("");
        searchInput?.focus();
    });

    // 6. Filter Buttons
    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const filter = btn.getAttribute("data-filter") || "all";
            setFilter(filter);
            loadPolls();
        });
    });

    // 7. Auth Modal Controls
    const authModal = "auth-modal";
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const tabLogin = document.getElementById("tab-login");
    const tabRegister = document.getElementById("tab-register");

    function showLoginTab() {
        tabLogin?.classList.add("active");
        tabRegister?.classList.remove("active");
        loginForm?.classList.remove("hidden");
        registerForm?.classList.add("hidden");
    }

    function showRegisterTab() {
        tabRegister?.classList.add("active");
        tabLogin?.classList.remove("active");
        registerForm?.classList.remove("hidden");
        loginForm?.classList.add("hidden");
    }

    document.getElementById("btn-login")?.addEventListener("click", () => {
        showLoginTab();
        openModal(authModal);
    });

    document.getElementById("btn-register")?.addEventListener("click", () => {
        showRegisterTab();
        openModal(authModal);
    });

    document.getElementById("link-to-register")?.addEventListener("click", showRegisterTab);
    document.getElementById("link-to-login")?.addEventListener("click", showLoginTab);
    tabLogin?.addEventListener("click", showLoginTab);
    tabRegister?.addEventListener("click", showRegisterTab);

    document.getElementById("btn-close-auth")?.addEventListener("click", () => closeModal(authModal));
    document.getElementById("auth-modal-backdrop")?.addEventListener("click", () => closeModal(authModal));

    // 8. Login Form Submission
    loginForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("login-username").value.trim();
        const password = document.getElementById("login-password").value;
        const submitBtn = loginForm.querySelector("button[type='submit']");

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Signing In...";
        }

        try {
            await login(username, password);
            loginForm.reset();
            await loadPolls();
        } catch {
            // Handled in auth.js with showToast
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Sign In";
            }
        }
    });

    // 9. Register Form Submission
    registerForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("register-username").value.trim();
        const password = document.getElementById("register-password").value;
        const confirmPassword = document.getElementById("register-confirm-password").value;

        if (password !== confirmPassword) {
            showToast("Passwords do not match.", "error");
            return;
        }

        const submitBtn = registerForm.querySelector("button[type='submit']");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Registering...";
        }

        try {
            await register(username, password);
            registerForm.reset();
            await loadPolls();
        } catch {
            // Handled in auth.js with showToast
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Register Account";
            }
        }
    });

    // 10. Logout
    document.getElementById("btn-logout")?.addEventListener("click", () => {
        logout();
        switchSection("view-polls");
        loadPolls();
    });

    // 11. Results Modal Controls & Chart Switcher
    document.getElementById("btn-close-results")?.addEventListener("click", closeResultsModal);
    document.getElementById("btn-results-dismiss")?.addEventListener("click", closeResultsModal);
    document.getElementById("results-modal-backdrop")?.addEventListener("click", closeResultsModal);

    document.getElementById("btn-chart-bar")?.addEventListener("click", () => {
        switchChartType("bar");
    });
    document.getElementById("btn-chart-doughnut")?.addEventListener("click", () => {
        switchChartType("doughnut");
    });

    // 12. Phase 2: Winner Announcement Modal Controls
    document.getElementById("btn-winner-dismiss")?.addEventListener("click", closeWinnerModal);
    document.getElementById("btn-close-winner")?.addEventListener("click", closeWinnerModal);
    document.getElementById("winner-modal-backdrop")?.addEventListener("click", closeWinnerModal);
    document.getElementById("btn-winner-view-results")?.addEventListener("click", () => {
        closeWinnerModal();
        const pollId = getLastCelebratedPollId();
        if (pollId) {
            showPollResults(pollId);
        }
    });

    // Global Escape Key Listener for all Modals
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const winnerModal = document.getElementById("winner-modal");
            if (winnerModal && !winnerModal.classList.contains("hidden")) {
                closeWinnerModal();
                return;
            }
            const resultsModal = document.getElementById("results-modal");
            if (resultsModal && !resultsModal.classList.contains("hidden")) {
                closeResultsModal();
                return;
            }
            const confirmModal = document.getElementById("confirm-modal");
            if (confirmModal && !confirmModal.classList.contains("hidden")) {
                document.getElementById("btn-confirm-cancel")?.click();
                return;
            }
            const authModal = document.getElementById("auth-modal");
            if (authModal && !authModal.classList.contains("hidden")) {
                closeModal("auth-modal");
                return;
            }
        }
    });

    // 13. Admin Poll Creation
    document.getElementById("btn-add-option")?.addEventListener("click", () => {
        addOptionRow();
    });

    document.getElementById("create-poll-form")?.addEventListener("submit", handleCreatePoll);
});
