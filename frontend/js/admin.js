// frontend/js/admin.js
import { apiRequest } from "./api.js";
import { showToast, showConfirm, createSvgElement } from "./ui.js";
import { loadPolls, parseUtcDate, celebratePollWinner, registerActivePoll } from "./polls.js";
import { getToken } from "./auth.js";

export function initAdminPanel() {
    initOptionsBuilder();
    loadAdminPolls();
}

function initOptionsBuilder() {
    const builder = document.getElementById("options-builder");
    if (!builder) return;

    builder.replaceChildren();
    addOptionRow("Option 1");
    addOptionRow("Option 2");
}

export function addOptionRow(placeholder = "") {
    const builder = document.getElementById("options-builder");
    if (!builder) return;

    const row = document.createElement("div");
    row.className = "option-builder-row";

    const input = document.createElement("input");
    input.type = "text";
    input.name = "poll_option";
    input.className = "form-input";
    const labelText = placeholder || `Option ${builder.children.length + 1}`;
    input.placeholder = labelText;
    input.setAttribute("aria-label", labelText);
    input.required = true;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-remove-option";
    removeBtn.textContent = "✕";
    removeBtn.title = "Remove Option";
    removeBtn.addEventListener("click", () => {
        if (builder.children.length <= 2) {
            showToast("A poll must have at least 2 options.", "warning");
            return;
        }
        row.remove();
    });

    row.appendChild(input);
    row.appendChild(removeBtn);
    builder.appendChild(row);
}

export async function handleCreatePoll(event) {
    event.preventDefault();
    const titleInput = document.getElementById("poll-title");
    const descInput = document.getElementById("poll-desc");
    const durationInput = document.getElementById("poll-duration");
    const autoDeleteInput = document.getElementById("poll-auto-delete");
    const builder = document.getElementById("options-builder");

    const title = titleInput.value.trim();
    const description = descInput.value.trim();

    const optionInputs = builder.querySelectorAll("input.form-input");
    const options = Array.from(optionInputs)
        .map(input => input.value.trim())
        .filter(val => val.length > 0);

    if (options.length < 2) {
        showToast("Please provide at least 2 valid options.", "error");
        return;
    }

    let duration_minutes = null;
    if (durationInput && durationInput.value.trim()) {
        const parsed = parseInt(durationInput.value.trim(), 10);
        if (parsed > 0) duration_minutes = parsed;
    }

    let auto_delete_hours = 24;
    if (autoDeleteInput && autoDeleteInput.value.trim()) {
        const parsed = parseInt(autoDeleteInput.value.trim(), 10);
        if (parsed > 0) auto_delete_hours = parsed;
    }

    const submitBtn = document.getElementById("btn-submit-poll");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Publishing Poll...";
    }

    try {
        const createdPoll = await apiRequest("/polls", {
            method: "POST",
            body: JSON.stringify({
                title,
                description: description || null,
                options,
                duration_minutes,
                auto_delete_hours
            })
        });

        if (createdPoll && createdPoll.id) {
            registerActivePoll(createdPoll.id);
        }

        showToast("Poll published successfully!", "success");
        titleInput.value = "";
        descInput.value = "";
        if (durationInput) durationInput.value = "";
        if (autoDeleteInput) autoDeleteInput.value = "24";
        initOptionsBuilder();

        await loadAdminPolls();
        await loadPolls();
    } catch (err) {
        showToast(`Failed to create poll: ${err.message}`, "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Create & Publish Poll";
        }
    }
}

export async function loadAdminPolls() {
    const list = document.getElementById("admin-polls-list");
    if (!list) return;

    try {
        const polls = await apiRequest("/polls");
        list.replaceChildren();

        if (!polls || polls.length === 0) {
            const emptyP = document.createElement("p");
            emptyP.className = "card-meta";
            emptyP.textContent = "No polls created yet.";
            list.appendChild(emptyP);
            return;
        }

        polls.forEach(poll => {
            const item = document.createElement("div");
            item.className = "admin-poll-item";

            const info = document.createElement("div");
            info.className = "admin-poll-info";

            const title = document.createElement("h4");
            title.textContent = poll.title;

            const meta = document.createElement("p");
            let statusText = poll.is_closed ? "Closed" : "Active";
            if (poll.expires_at) {
                const expDate = parseUtcDate(poll.expires_at);
                if (expDate && Date.now() >= expDate.getTime()) {
                    statusText = "Expired";
                }
            }
            meta.textContent = `${poll.total_votes} votes • Status: ${statusText}`;

            info.appendChild(title);
            info.appendChild(meta);
            item.appendChild(info);

            // Actions container (Close + Delete)
            const actions = document.createElement("div");
            actions.className = "admin-poll-actions";

            if (!poll.is_closed) {
                const closeBtn = document.createElement("button");
                closeBtn.type = "button";
                closeBtn.className = "btn btn-secondary";
                closeBtn.textContent = "Close Poll";
                closeBtn.addEventListener("click", () => handleClosePoll(poll.id, poll.title));
                actions.appendChild(closeBtn);
            } else {
                const closedBadge = document.createElement("span");
                closedBadge.className = "badge badge-closed";
                closedBadge.textContent = "Closed";
                actions.appendChild(closedBadge);
            }

            // Export Buttons (CSV & JSON)
            const exportCsvBtn = document.createElement("button");
            exportCsvBtn.type = "button";
            exportCsvBtn.className = "btn btn-export btn-export-csv";
            exportCsvBtn.title = "Download results as CSV";
            exportCsvBtn.appendChild(createSvgElement("download", "btn-icon"));
            const csvText = document.createElement("span");
            csvText.textContent = "CSV";
            exportCsvBtn.appendChild(csvText);
            exportCsvBtn.addEventListener("click", () => exportPollResults(poll.id, "csv", poll.title));
            actions.appendChild(exportCsvBtn);

            const exportJsonBtn = document.createElement("button");
            exportJsonBtn.type = "button";
            exportJsonBtn.className = "btn btn-export btn-export-json";
            exportJsonBtn.title = "Download results as JSON";
            exportJsonBtn.appendChild(createSvgElement("download", "btn-icon"));
            const jsonText = document.createElement("span");
            jsonText.textContent = "JSON";
            exportJsonBtn.appendChild(jsonText);
            exportJsonBtn.addEventListener("click", () => exportPollResults(poll.id, "json", poll.title));
            actions.appendChild(exportJsonBtn);

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "btn btn-danger";
            deleteBtn.title = "Permanently delete this poll";
            deleteBtn.appendChild(createSvgElement("trash", "btn-icon"));
            const deleteText = document.createElement("span");
            deleteText.textContent = "Delete";
            deleteBtn.appendChild(deleteText);
            deleteBtn.addEventListener("click", () => handleDeletePoll(poll.id, poll.title));
            actions.appendChild(deleteBtn);

            item.appendChild(actions);
            list.appendChild(item);
        });
    } catch (err) {
        showToast(`Failed to load admin polls: ${err.message}`, "error");
    }
}

export async function exportPollResults(pollId, format = "csv", pollTitle = "poll") {
    try {
        const token = getToken();
        const res = await fetch(`/api/polls/${pollId}/export?format=${format}`, {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || `Export failed with status ${res.status}`);
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const cleanTitle = (pollTitle || "poll").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase().slice(0, 30);
        a.download = `poll_${pollId}_${cleanTitle}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        showToast(`Exported poll results (${format.toUpperCase()}) successfully!`, "success");
    } catch (err) {
        showToast(`Export failed: ${err.message}`, "error");
    }
}

async function handleClosePoll(pollId, pollTitle) {
    const title = pollTitle ? `Close "${pollTitle}"` : "Close Voting";
    const confirmed = await showConfirm(
        title,
        "Are you sure you want to close voting for this poll? Voting will end immediately and results will be finalized.",
        "Close Voting",
        false
    );

    if (!confirmed) return;

    try {
        await apiRequest(`/polls/${pollId}/close`, { method: "PATCH" });
        showToast("Poll closed successfully.", "success");

        // Phase 2: Celebrate BEFORE loadPolls so detectStateTransitions
        // doesn't mark it celebrated first (which would cause celebratePollWinner
        // to return early as a no-op). Pass force = true for manual close.
        await celebratePollWinner(pollId, true);

        await loadAdminPolls();
        await loadPolls();
    } catch (err) {
        showToast(`Failed to close poll: ${err.message}`, "error");
    }
}

async function handleDeletePoll(pollId, pollTitle) {
    const title = pollTitle ? `Delete "${pollTitle}"` : "Delete Poll";
    const confirmed = await showConfirm(
        title,
        "Are you sure you want to permanently delete this poll and all its cast votes? This action cannot be undone.",
        "Delete Permanently",
        true
    );

    if (!confirmed) return;

    try {
        await apiRequest(`/polls/${pollId}`, { method: "DELETE" });
        showToast("Poll permanently deleted.", "success");
        await loadAdminPolls();
        await loadPolls();
    } catch (err) {
        showToast(`Failed to delete poll: ${err.message}`, "error");
    }
}
