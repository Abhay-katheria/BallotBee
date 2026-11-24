// frontend/js/ui.js

/**
 * Returns raw Lucide-style monochrome SVG markup string.
 */
export function getSvgIcon(name, extraClass = "") {
    const cls = extraClass ? `icon ${extraClass}` : "icon";
    const icons = {
        clock: `<svg class="${cls}" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        check: `<svg class="${cls}" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
        trophy: `<svg class="${cls}" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
        sparkles: `<svg class="${cls}" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
        info: `<svg class="${cls}" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
        alert: `<svg class="${cls}" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        search: `<svg class="${cls}" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
        download: `<svg class="${cls}" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        trash: `<svg class="${cls}" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
        barChart: `<svg class="${cls}" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>`,
        pieChart: `<svg class="${cls}" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>`,
        vote: `<svg class="${cls}" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4"/><rect width="18" height="18" x="3" y="3" rx="2"/></svg>`,
        user: `<svg class="${cls}" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>`,
        star: `<svg class="${cls}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        handshake: `<svg class="${cls}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17 2 2a1 1 0 0 0 1.4 0l4.3-4.3a1 1 0 0 0 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0l-1.7 1.7"/><path d="m13 7-2-2a1 1 0 0 0-1.4 0L5.3 9.3a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l1.7-1.7"/></svg>`
    };
    return icons[name] || "";
}

/**
 * Returns a live SVG DOM element.
 */
export function createSvgElement(name, extraClass = "") {
    const wrapper = document.createElement("span");
    wrapper.innerHTML = getSvgIcon(name, extraClass);
    return wrapper.firstElementChild || document.createElement("span");
}

export function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let iconName = "info";
    if (type === "success") iconName = "check";
    if (type === "error" || type === "warning") iconName = "alert";

    const iconEl = createSvgElement(iconName, `toast-icon toast-icon-${type}`);

    const msgSpan = document.createElement("span");
    msgSpan.className = "toast-message";
    msgSpan.textContent = message;

    toast.appendChild(iconEl);
    toast.appendChild(msgSpan);
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("toast-fading");
        setTimeout(() => toast.remove(), 260);
    }, 3200);
}

export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove("hidden");
    }
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add("hidden");
    }
}

export function switchSection(sectionId) {
    document.querySelectorAll(".view-section").forEach(sec => {
        sec.classList.remove("active");
        sec.classList.remove("hidden");
    });
    const target = document.getElementById(sectionId);
    if (target) {
        target.classList.remove("hidden");
        target.classList.add("active");
    }

    document.querySelectorAll(".nav-link").forEach(link => link.classList.remove("active"));
    if (sectionId === "view-polls") {
        document.getElementById("nav-polls")?.classList.add("active");
    } else if (sectionId === "view-my-votes") {
        document.getElementById("nav-my-votes")?.classList.add("active");
    } else if (sectionId === "view-admin") {
        document.getElementById("nav-admin")?.classList.add("active");
    }
}

/**
 * Fires a restrained, high-contrast confetti burst using canvas-confetti.
 * Palette: monochrome + subtle emerald/amber accents.
 */
export function launchConfetti() {
    try {
        if (typeof window.confetti === "function") {
            const duration = 2.0 * 1000;
            const animationEnd = Date.now() + duration;
            const colors = ["#fafafa", "#a1a1aa", "#10b981", "#f59e0b"];

            const frame = () => {
                try {
                    window.confetti({
                        particleCount: 4,
                        angle: 60,
                        spread: 50,
                        origin: { x: 0, y: 0.7 },
                        colors: colors,
                        zIndex: 105
                    });
                    window.confetti({
                        particleCount: 4,
                        angle: 120,
                        spread: 50,
                        origin: { x: 1, y: 0.7 },
                        colors: colors,
                        zIndex: 105
                    });

                    if (Date.now() < animationEnd) {
                        requestAnimationFrame(frame);
                    }
                } catch {
                    // Frame error safe catch
                }
            };
            frame();
        }
    } catch (err) {
        console.warn("Confetti animation failed to launch:", err);
    }
}

/**
 * Modern promise-based confirmation modal dialog replacing browser native confirm().
 */
export function showConfirm(title, message, confirmText = "Confirm", isDanger = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById("confirm-modal");
        const titleEl = document.getElementById("confirm-title");
        const msgEl = document.getElementById("confirm-message");
        const okBtn = document.getElementById("btn-confirm-ok");
        const cancelBtn = document.getElementById("btn-confirm-cancel");
        const closeBtn = document.getElementById("btn-close-confirm");
        const backdrop = document.getElementById("confirm-modal-backdrop");

        if (!modal || !okBtn) {
            resolve(false);
            return;
        }

        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        okBtn.textContent = confirmText;

        if (isDanger) {
            okBtn.className = "btn btn-danger";
        } else {
            okBtn.className = "btn btn-primary";
        }

        openModal("confirm-modal");

        const cleanup = (result) => {
            closeModal("confirm-modal");
            okBtn.removeEventListener("click", onOk);
            cancelBtn?.removeEventListener("click", onCancel);
            closeBtn?.removeEventListener("click", onCancel);
            backdrop?.removeEventListener("click", onCancel);
            resolve(result);
        };

        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);

        okBtn.addEventListener("click", onOk);
        cancelBtn?.addEventListener("click", onCancel);
        closeBtn?.addEventListener("click", onCancel);
        backdrop?.addEventListener("click", onCancel);
    });
}
