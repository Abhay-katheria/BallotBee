// frontend/js/polls.js
import { apiRequest } from "./api.js";
import { isLoggedIn } from "./auth.js";
import { showToast, openModal, closeModal, launchConfetti, createSvgElement } from "./ui.js";

let currentFilter = "all";
let searchQuery = "";
let allPollsCache = [];
let globalTickerInterval = null;
let autoRefreshInterval = null;

// =========================================================
// Unified State-Transition Detector & Celebration Queue
// =========================================================

// Session Set: Every poll ID seen with is_closed === false during this session
const knownActivePollIds = new Set();

// Persistent Set: Poll IDs that have already triggered celebration
let celebratedPollIds = new Set();

let isWinnerModalOpen = false;
const celebrationQueue = [];
let lastCelebratedPollId = null;

let resultsChartInstance = null;
let currentResultsData = null;
let currentChartType = "bar";
let activeResultsPollId = null;

export function getFilter() {
    return currentFilter;
}

export function setFilter(filter) {
    currentFilter = filter;
}

export function getSearchQuery() {
    return searchQuery;
}

export function setSearchQuery(query) {
    searchQuery = (query || "").trim();
    renderFilteredPolls();
}

/**
 * Robustly parses a datetime string into a JavaScript Date object in UTC.
 * Appends 'Z' if no timezone offset is present, ensuring browsers never misinterpret
 * server UTC timestamps as local machine time (e.g., IST).
 */
export function parseUtcDate(dateStr) {
    if (!dateStr) return null;
    let normalized = String(dateStr).trim().replace(" ", "T");
    if (!normalized.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(normalized)) {
        normalized += "Z";
    }
    const parsed = new Date(normalized);
    return isNaN(parsed.getTime()) ? null : parsed;
}

const CELEBRATED_STORAGE_KEY = "celebrated_polls_v2";

function loadCelebratedPollIds() {
    try {
        // One-time cleanup of legacy key so poisoned IDs from earlier testing are removed
        if (localStorage.getItem("celebrated_polls") !== null) {
            localStorage.removeItem("celebrated_polls");
        }
        const stored = JSON.parse(localStorage.getItem(CELEBRATED_STORAGE_KEY) || "[]");
        if (Array.isArray(stored)) {
            celebratedPollIds = new Set(stored.map(Number));
        } else {
            celebratedPollIds = new Set();
        }
    } catch {
        celebratedPollIds = new Set();
    }
}

function saveCelebratedPollIds() {
    try {
        localStorage.setItem(CELEBRATED_STORAGE_KEY, JSON.stringify([...celebratedPollIds]));
    } catch {
        // LocalStorage fallback
    }
}

/**
 * On cold start, record already-closed polls so historical polls do not trigger popup celebrations.
 * Also registers currently active polls into knownActivePollIds and un-blacklists them from celebratedPollIds.
 */
export function initCelebratedRegistry(polls) {
    loadCelebratedPollIds();
    const hasInit = localStorage.getItem("celebrated_initialized");
    if (!hasInit) {
        (polls || []).forEach(p => {
            const exp = p.expires_at ? parseUtcDate(p.expires_at) : null;
            const isClosed = p.is_closed || (exp && Date.now() >= exp.getTime());
            if (isClosed) {
                celebratedPollIds.add(Number(p.id));
            }
        });
        saveCelebratedPollIds();
        localStorage.setItem("celebrated_initialized", "true");
    }

    // Register all currently active polls in session set and un-blacklist any reused IDs
    let activeModified = false;
    (polls || []).forEach(p => {
        const exp = p.expires_at ? parseUtcDate(p.expires_at) : null;
        const isClosed = p.is_closed || (exp && Date.now() >= exp.getTime());
        if (!isClosed) {
            const numId = Number(p.id);
            knownActivePollIds.add(numId);
            if (celebratedPollIds.has(numId)) {
                celebratedPollIds.delete(numId);
                activeModified = true;
            }
        }
    });
    if (activeModified) {
        saveCelebratedPollIds();
    }
}

/**
 * Explicitly registers a newly created active poll into session tracking.
 * Also removes this ID from celebratedPollIds and updates localStorage
 * so reused SQLite IDs are never blacklisted.
 */
export function registerActivePoll(pollId) {
    const numericId = Number(pollId);
    if (numericId) {
        knownActivePollIds.add(numericId);
        loadCelebratedPollIds();
        if (celebratedPollIds.has(numericId)) {
            celebratedPollIds.delete(numericId);
            saveCelebratedPollIds();
        }
    }
}

/**
 * Checks whether a poll has already been celebrated.
 */
export function isPollCelebrated(pollId) {
    loadCelebratedPollIds();
    return celebratedPollIds.has(Number(pollId));
}

/**
 * Records a celebrated poll by numeric ID in memory and localStorage.
 */
export function markPollCelebrated(pollId) {
    const numericId = Number(pollId);
    if (!numericId) return;
    loadCelebratedPollIds();
    celebratedPollIds.add(numericId);
    saveCelebratedPollIds();
}

/**
 * Unified State-Transition Detector:
 * Checks every poll across all fetch/ticker/close events:
 * - If poll is active: adds it to knownActivePollIds.
 * - If poll is closed AND was known active in this session AND has not yet celebrated:
 *   removes it from knownActivePollIds, marks it celebrated, and pushes it to celebrationQueue.
 */
export function detectStateTransitions(polls) {
    if (!polls || !Array.isArray(polls)) return;
    loadCelebratedPollIds();

    const newlyClosed = [];
    let celebratedModified = false;

    polls.forEach(poll => {
        const pollId = Number(poll.id);
        if (!pollId) return;

        const exp = poll.expires_at ? parseUtcDate(poll.expires_at) : null;
        const isClosed = poll.is_closed || (exp && Date.now() >= exp.getTime());

        if (!isClosed) {
            knownActivePollIds.add(pollId);
            // Reused ID check: if this active poll was previously marked celebrated, un-blacklist it
            if (celebratedPollIds.has(pollId)) {
                celebratedPollIds.delete(pollId);
                celebratedModified = true;
            }
        } else {
            if (knownActivePollIds.has(pollId) && !celebratedPollIds.has(pollId)) {
                knownActivePollIds.delete(pollId);
                celebratedPollIds.add(pollId);
                celebratedModified = true;
                newlyClosed.push(pollId);
            }
        }
    });

    if (celebratedModified) {
        saveCelebratedPollIds();
    }

    // Fire celebrations asynchronously for all newly closed polls
    if (newlyClosed.length > 0) {
        (async () => {
            for (const pollId of newlyClosed) {
                try {
                    await enqueueCelebration(pollId);
                } catch (err) {
                    console.error("[Celebration] detectStateTransitions error for poll", pollId, err);
                }
            }
        })();
    }
}

function filterPolls(polls) {
    return (polls || []).filter(p => {
        // Status filter
        if (currentFilter === "active") {
            if (p.is_closed) return false;
            if (p.expires_at) {
                const exp = parseUtcDate(p.expires_at);
                if (exp && Date.now() >= exp.getTime()) return false;
            }
        } else if (currentFilter === "closed") {
            let isClosed = p.is_closed;
            if (!isClosed && p.expires_at) {
                const exp = parseUtcDate(p.expires_at);
                if (exp && Date.now() >= exp.getTime()) isClosed = true;
            }
            if (!isClosed) return false;
        }

        // Live search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const titleMatch = p.title.toLowerCase().includes(q);
            const descMatch = p.description ? p.description.toLowerCase().includes(q) : false;
            if (!titleMatch && !descMatch) return false;
        }

        return true;
    });
}

function updateStatsBar(polls) {
    const activeEl = document.getElementById("stat-active-polls");
    const votesEl = document.getElementById("stat-total-votes");
    if (!activeEl || !votesEl) return;

    const list = Array.isArray(polls) ? polls : [];
    let activeCount = 0;
    let totalVotes = 0;

    list.forEach(p => {
        totalVotes += (p.total_votes || 0);
        const exp = p.expires_at ? parseUtcDate(p.expires_at) : null;
        const isClosed = p.is_closed || (exp && Date.now() >= exp.getTime());
        if (!isClosed) {
            activeCount++;
        }
    });

    activeEl.textContent = activeCount;
    votesEl.textContent = totalVotes;
}

export function renderFilteredPolls() {
    const container = document.getElementById("polls-grid");
    const emptyState = document.getElementById("polls-empty");
    if (!container) return;

    // Update the live stats bar
    updateStatsBar(allPollsCache);

    // Preserve user-selected radio options across re-renders
    const selectedRadios = {};
    container.querySelectorAll("input.option-radio:checked").forEach(input => {
        const pollIdMatch = input.name.match(/^poll-option-(\d+)$/);
        if (pollIdMatch) {
            selectedRadios[pollIdMatch[1]] = input.value;
        }
    });

    const displayPolls = filterPolls(allPollsCache);
    container.replaceChildren();

    if (displayPolls.length === 0) {
        emptyState?.classList.remove("hidden");
        return;
    }

    emptyState?.classList.add("hidden");

    displayPolls.forEach(poll => {
        const card = createPollCard(poll, selectedRadios);
        container.appendChild(card);
    });
}

export async function loadPolls() {
    try {
        const polls = await apiRequest("/polls");
        allPollsCache = Array.isArray(polls) ? polls : [];

        initCelebratedRegistry(allPollsCache);
        detectStateTransitions(allPollsCache);
        initGlobalTicker();

        renderFilteredPolls();
    } catch (err) {
        showToast(`Failed to load polls: ${err.message}`, "error");
    }
}

function createPollCard(poll, selectedRadios = {}) {
    const card = document.createElement("div");
    card.className = "card";
    card.id = `poll-card-${poll.id}`;

    // Card Header
    const cardHeader = document.createElement("div");
    cardHeader.className = "card-header";

    const titleEl = document.createElement("h3");
    titleEl.className = "card-title";
    titleEl.textContent = poll.title;

    const badgesContainer = document.createElement("div");
    badgesContainer.className = "badges-container";

    const expiresDate = poll.expires_at ? parseUtcDate(poll.expires_at) : null;
    const isPastExpiration = expiresDate ? Date.now() >= expiresDate.getTime() : false;
    const isEffectivelyClosed = poll.is_closed || isPastExpiration;

    // Status Badge
    const statusBadge = document.createElement("span");
    statusBadge.id = `poll-status-badge-${poll.id}`;
    statusBadge.className = `badge ${isEffectivelyClosed ? "badge-closed" : "badge-active"}`;
    statusBadge.textContent = isEffectivelyClosed ? "Closed" : "Active";
    badgesContainer.appendChild(statusBadge);

    // Live Countdown Timer Badge
    if (poll.expires_at) {
        const timerBadge = document.createElement("span");
        timerBadge.id = `poll-timer-${poll.id}`;
        timerBadge.className = "badge badge-timer";
        timerBadge.setAttribute("data-expires", poll.expires_at);
        timerBadge.setAttribute("data-poll-id", poll.id);

        const clockIcon = createSvgElement("clock", "timer-badge-icon");
        const digitsSpan = document.createElement("span");
        digitsSpan.className = "timer-digits";
        digitsSpan.id = `poll-timer-digits-${poll.id}`;

        if (isEffectivelyClosed) {
            timerBadge.classList.add("expired");
            digitsSpan.textContent = "Ended";
        } else {
            const initialFormatted = formatRemainingTime(poll.expires_at);
            digitsSpan.textContent = initialFormatted.text;
            if (initialFormatted.isUrgent) {
                timerBadge.classList.add("urgent");
            }
            if (initialFormatted.isExpired) {
                timerBadge.classList.add("expired");
                statusBadge.className = "badge badge-closed";
                statusBadge.textContent = "Closed";
            }
        }
        timerBadge.appendChild(clockIcon);
        timerBadge.appendChild(digitsSpan);
        badgesContainer.appendChild(timerBadge);
    }

    if (poll.has_voted) {
        const votedBadge = document.createElement("span");
        votedBadge.className = "badge badge-voted";
        const checkIcon = createSvgElement("check", "voted-badge-icon");
        const votedText = document.createElement("span");
        votedText.textContent = "Voted";
        votedBadge.appendChild(checkIcon);
        votedBadge.appendChild(votedText);
        badgesContainer.appendChild(votedBadge);
    }

    cardHeader.appendChild(titleEl);
    cardHeader.appendChild(badgesContainer);
    card.appendChild(cardHeader);

    // Metadata
    const meta = document.createElement("div");
    meta.className = "card-meta";
    const createdDate = parseUtcDate(poll.created_at) || new Date(poll.created_at);
    const dateStr = createdDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    meta.textContent = `Created ${dateStr} • ${poll.total_votes} ${poll.total_votes === 1 ? "vote" : "votes"}`;
    card.appendChild(meta);

    // Description
    if (poll.description) {
        const desc = document.createElement("p");
        desc.className = "card-desc";
        desc.textContent = poll.description;
        card.appendChild(desc);
    }

    // Options List
    const optionsList = document.createElement("div");
    optionsList.className = "options-list";

    const userPreselectedOptionId = selectedRadios[String(poll.id)];

    poll.options.forEach(opt => {
        const optionItem = document.createElement("label");
        optionItem.className = "option-item";

        const isOptionVotedByUser = poll.has_voted && poll.user_voted_option_id === opt.id;
        const isOptionPreselected = !poll.has_voted && userPreselectedOptionId && String(userPreselectedOptionId) === String(opt.id);

        if (isOptionVotedByUser) {
            optionItem.classList.add("voted-by-user");
        }

        if (isEffectivelyClosed || poll.has_voted) {
            optionItem.classList.add("disabled");
        }

        const radioId = `poll-${poll.id}-opt-${opt.id}`;
        optionItem.setAttribute("for", radioId);

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.id = radioId;
        radio.name = `poll-option-${poll.id}`;
        radio.value = opt.id;
        radio.className = "option-radio sr-only";

        if (isEffectivelyClosed || poll.has_voted) {
            radio.disabled = true;
        }
        if (isOptionVotedByUser || isOptionPreselected) {
            radio.checked = true;
            optionItem.classList.add("selected");
        }

        const indicator = document.createElement("span");
        indicator.className = "option-indicator";
        indicator.appendChild(createSvgElement("check", "indicator-check"));

        const labelSpan = document.createElement("span");
        labelSpan.className = "option-text";
        labelSpan.textContent = opt.text;

        if (!isEffectivelyClosed && !poll.has_voted) {
            radio.addEventListener("change", () => {
                optionsList.querySelectorAll(".option-item").forEach(item => item.classList.remove("selected"));
                if (radio.checked) {
                    optionItem.classList.add("selected");
                }
            });
        }

        optionItem.appendChild(radio);
        optionItem.appendChild(indicator);
        optionItem.appendChild(labelSpan);
        optionsList.appendChild(optionItem);
    });

    card.appendChild(optionsList);

    // Card Actions
    const actions = document.createElement("div");
    actions.className = "card-actions";

    const btnVote = document.createElement("button");
    btnVote.type = "button";
    btnVote.id = `btn-vote-${poll.id}`;
    btnVote.className = "btn btn-primary";

    if (isEffectivelyClosed) {
        btnVote.textContent = "Voting Closed";
        btnVote.disabled = true;
    } else if (poll.has_voted) {
        btnVote.textContent = "Vote Cast";
        btnVote.disabled = true;
    } else {
        btnVote.textContent = "Cast Vote";
        btnVote.addEventListener("click", () => handleVoteClick(poll.id));
    }
    actions.appendChild(btnVote);

    const btnResults = document.createElement("button");
    btnResults.type = "button";
    btnResults.className = "btn btn-secondary";
    btnResults.textContent = "Live Results";
    btnResults.addEventListener("click", () => showPollResults(poll.id));
    actions.appendChild(btnResults);

    card.appendChild(actions);

    return card;
}

function formatRemainingTime(expiresAtStr) {
    const expiresDate = parseUtcDate(expiresAtStr);
    if (!expiresDate) {
        return { text: "Ended", isExpired: true, isUrgent: false };
    }

    const expiresMs = expiresDate.getTime();
    const nowMs = Date.now();
    const diffMs = expiresMs - nowMs;
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec <= 0 || nowMs >= expiresMs) {
        return { text: "00:00:00", isExpired: true, isUrgent: false };
    }

    const hours = Math.floor(diffSec / 3600);
    const minutes = Math.floor((diffSec % 3600) / 60);
    const seconds = diffSec % 60;

    const pad = (n) => String(n).padStart(2, "0");
    const formatted = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    return {
        text: formatted,
        isExpired: false,
        isUrgent: diffSec <= 300
    };
}

function updatePollCardUiTimer(pollId, expiresAtStr) {
    const timerBadge = document.getElementById(`poll-timer-${pollId}`);
    if (!timerBadge) return;

    const digitsSpan = timerBadge.querySelector(".timer-digits") || document.getElementById(`poll-timer-digits-${pollId}`);
    const res = formatRemainingTime(expiresAtStr);

    if (digitsSpan) {
        digitsSpan.textContent = res.text;
    }

    if (res.isUrgent) {
        timerBadge.classList.add("urgent");
    } else {
        timerBadge.classList.remove("urgent");
    }
}

function updatePollCardUiToClosed(pollId) {
    const timerBadge = document.getElementById(`poll-timer-${pollId}`);
    if (timerBadge) {
        timerBadge.classList.remove("urgent");
        timerBadge.classList.add("expired");
        const digitsSpan = timerBadge.querySelector(".timer-digits") || document.getElementById(`poll-timer-digits-${pollId}`);
        if (digitsSpan) {
            digitsSpan.textContent = "Ended";
        }
    }

    const statusBadge = document.getElementById(`poll-status-badge-${pollId}`);
    if (statusBadge) {
        statusBadge.className = "badge badge-closed";
        statusBadge.textContent = "Closed";
    }

    const voteBtn = document.getElementById(`btn-vote-${pollId}`);
    if (voteBtn) {
        voteBtn.textContent = "Voting Closed";
        voteBtn.disabled = true;
    }

    const card = document.getElementById(`poll-card-${pollId}`);
    if (card) {
        card.querySelectorAll("input.option-radio").forEach(r => r.disabled = true);
        card.querySelectorAll(".option-item").forEach(item => item.classList.add("disabled"));
    }
}

/**
 * Continuous 1-second global ticker.
 * Updates visible countdown timers and triggers state detection when a timer reaches 0.
 */
export function initGlobalTicker() {
    if (globalTickerInterval) return;

    globalTickerInterval = setInterval(() => {
        if (!allPollsCache || allPollsCache.length === 0) return;

        let hasNewlyExpired = false;

        allPollsCache.forEach(poll => {
            if (!poll.expires_at) return;

            const expiresDate = parseUtcDate(poll.expires_at);
            if (!expiresDate) return;

            const nowMs = Date.now();
            const isExpired = nowMs >= expiresDate.getTime();

            if (isExpired) {
                if (!poll.is_closed) {
                    poll.is_closed = true;
                    updatePollCardUiToClosed(poll.id);
                    hasNewlyExpired = true;
                }
            } else if (!poll.is_closed) {
                updatePollCardUiTimer(poll.id, poll.expires_at);
            }
        });

        if (hasNewlyExpired) {
            detectStateTransitions(allPollsCache);
        }
    }, 1000);
}

/* =========================================================
   Phase 3: Real-Time Auto-Refresh Engine (5-Second Interval)
   ========================================================= */

/**
 * Starts background auto-refreshing for polls and open live results modals.
 * Never closes, overwrites, or interrupts an open winner modal.
 */
export function startAutoRefresh() {
    if (autoRefreshInterval) return;

    autoRefreshInterval = setInterval(async () => {
        try {
            // Always fetch polls globally so state transitions are caught regardless of active tab
            const polls = await apiRequest("/polls");
            allPollsCache = Array.isArray(polls) ? polls : [];

            // Detect any closed poll transitions and enqueue celebrations
            detectStateTransitions(allPollsCache);

            // Re-render polls view if currently visible
            const pollsView = document.getElementById("view-polls");
            const isPollsViewActive = pollsView && !pollsView.classList.contains("hidden");
            if (isPollsViewActive) {
                renderFilteredPolls();
            }
        } catch {
            // Background sync fails silently
        }

        // Silently update active results modal in place if currently open
        const resultsModal = document.getElementById("results-modal");
        const isResultsOpen = resultsModal && !resultsModal.classList.contains("hidden");

        if (isResultsOpen && activeResultsPollId) {
            try {
                await refreshResultsInPlace(activeResultsPollId);
            } catch {
                // Background sync fails silently
            }
        }
    }, 5000);
}

async function refreshResultsInPlace(pollId) {
    const results = await apiRequest(`/polls/${pollId}/results`);
    currentResultsData = results;

    const modalBadge = document.getElementById("results-badge");
    const modalVotesCount = document.getElementById("results-total-votes");
    const resultsContainer = document.getElementById("results-container");

    if (modalBadge) {
        modalBadge.className = `badge ${results.is_closed ? "badge-closed" : "badge-active"}`;
        modalBadge.textContent = results.is_closed ? "Closed" : "Active";
    }
    if (modalVotesCount) {
        modalVotesCount.textContent = `${results.total_votes} total ${results.total_votes === 1 ? "vote" : "votes"}`;
    }

    if (resultsChartInstance) {
        resultsChartInstance.data.labels = results.options.map(opt => opt.text);
        resultsChartInstance.data.datasets[0].data = results.options.map(opt => opt.votes_count);
        resultsChartInstance.update();
    }

    if (resultsContainer) {
        resultsContainer.replaceChildren();
        const maxVotes = Math.max(...results.options.map(o => o.votes_count), 0);

        results.options.forEach(opt => {
            const item = document.createElement("div");
            item.className = "result-item";

            const header = document.createElement("div");
            header.className = "result-header";

            const nameSpan = document.createElement("span");
            nameSpan.textContent = opt.text;

            const countSpan = document.createElement("span");
            countSpan.className = "result-votes";
            countSpan.textContent = `${opt.votes_count} votes (${opt.percentage}%)`;

            header.appendChild(nameSpan);
            header.appendChild(countSpan);
            item.appendChild(header);

            const track = document.createElement("div");
            track.className = "progress-track";

            const fill = document.createElement("div");
            fill.className = "progress-fill";
            if (opt.votes_count > 0 && opt.votes_count === maxVotes) {
                fill.classList.add("winner");
            }
            fill.style.width = `${opt.percentage}%`;

            track.appendChild(fill);
            item.appendChild(track);
            resultsContainer.appendChild(item);
        });
    }
}

async function handleVoteClick(pollId) {
    if (!isLoggedIn()) {
        showToast("Please sign in or register to cast your vote.", "info");
        openModal("auth-modal");
        return;
    }

    const selectedRadio = document.querySelector(`input[name="poll-option-${pollId}"]:checked`);
    if (!selectedRadio) {
        showToast("Please select an option to vote.", "error");
        return;
    }

    const optionId = parseInt(selectedRadio.value, 10);
    try {
        await apiRequest(`/polls/${pollId}/vote`, {
            method: "POST",
            body: JSON.stringify({ option_id: optionId })
        });
        showToast("Your vote has been counted successfully!", "success");
        await loadPolls();
    } catch (err) {
        showToast(err.message, "error");
    }
}

/* =========================================================
   Phase 2: Live Animated Charts (Chart.js)
   ========================================================= */

export function switchChartType(chartType) {
    currentChartType = chartType;
    document.querySelectorAll(".chart-type-btn").forEach(btn => {
        if (btn.getAttribute("data-chart") === chartType) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    if (currentResultsData) {
        renderResultsChart(currentResultsData, chartType);
    }
}

function renderResultsChart(results, chartType = "bar") {
    const canvas = document.getElementById("results-chart");
    if (!canvas || typeof window.Chart !== "function") return;

    if (resultsChartInstance) {
        resultsChartInstance.destroy();
        resultsChartInstance = null;
    }

    const labels = results.options.map(opt => opt.text);
    const data = results.options.map(opt => opt.votes_count);
    const maxVotes = Math.max(...data, 0);

    const isDoughnut = chartType === "doughnut";

    let bgColors, borders;

    if (isDoughnut) {
        const doughnutGreys = [
            "#fafafa",
            "#a1a1aa",
            "#71717a",
            "#52525b",
            "#3f3f46",
            "#27272a",
            "#18181b"
        ];
        bgColors = data.map((v, i) => (v > 0 && v === maxVotes) ? "#10b981" : (doughnutGreys[i % doughnutGreys.length]));
        borders = bgColors.map(() => "#121215");
    } else {
        // Bar Chart: Leading option highlighted in crisp #fafafa, other bars in matte zinc #27272a
        bgColors = data.map(v => (v > 0 && v === maxVotes) ? "#fafafa" : "#27272a");
        borders = data.map(v => (v > 0 && v === maxVotes) ? "#ffffff" : "#3f3f46");
    }

    resultsChartInstance = new window.Chart(canvas, {
        type: chartType,
        data: {
            labels: labels,
            datasets: [{
                label: "Votes",
                data: data,
                backgroundColor: bgColors,
                borderColor: borders,
                borderWidth: isDoughnut ? 2 : 1,
                borderRadius: isDoughnut ? 0 : 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 500,
                easing: "easeOutQuart"
            },
            plugins: {
                legend: {
                    display: isDoughnut,
                    position: "bottom",
                    labels: {
                        color: "#a1a1aa",
                        padding: 14,
                        font: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: 500 }
                    }
                },
                tooltip: {
                    backgroundColor: "#18181b",
                    titleColor: "#fafafa",
                    bodyColor: "#fafafa",
                    borderColor: "#3f3f46",
                    borderWidth: 1,
                    padding: 8,
                    boxPadding: 4,
                    usePointStyle: true,
                    titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: 600 },
                    bodyFont: { family: "'JetBrains Mono', monospace", size: 12 }
                }
            },
            scales: isDoughnut ? {} : {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: "#71717a",
                        font: { family: "'JetBrains Mono', monospace", size: 11 }
                    },
                    grid: { color: "rgba(255, 255, 255, 0.04)" }
                },
                x: {
                    ticks: {
                        color: "#a1a1aa",
                        font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 }
                    },
                    grid: { display: false }
                }
            }
        }
    });
}

export async function showPollResults(pollId) {
    activeResultsPollId = pollId;

    try {
        const results = await apiRequest(`/polls/${pollId}/results`);
        currentResultsData = results;

        const modalTitle = document.getElementById("results-title");
        const modalDesc = document.getElementById("results-desc");
        const modalBadge = document.getElementById("results-badge");
        const modalVotesCount = document.getElementById("results-total-votes");
        const resultsContainer = document.getElementById("results-container");

        if (modalTitle) modalTitle.textContent = results.title;
        if (modalDesc) modalDesc.textContent = results.description || "";
        if (modalBadge) {
            modalBadge.className = `badge ${results.is_closed ? "badge-closed" : "badge-active"}`;
            modalBadge.textContent = results.is_closed ? "Closed" : "Active";
        }
        if (modalVotesCount) {
            modalVotesCount.textContent = `${results.total_votes} total ${results.total_votes === 1 ? "vote" : "votes"}`;
        }

        renderResultsChart(results, currentChartType);

        if (resultsContainer) {
            resultsContainer.replaceChildren();
            const maxVotes = Math.max(...results.options.map(o => o.votes_count), 0);

            results.options.forEach(opt => {
                const item = document.createElement("div");
                item.className = "result-item";

                const header = document.createElement("div");
                header.className = "result-header";

                const nameSpan = document.createElement("span");
                nameSpan.textContent = opt.text;

                const countSpan = document.createElement("span");
                countSpan.className = "result-votes";
                countSpan.textContent = `${opt.votes_count} votes (${opt.percentage}%)`;

                header.appendChild(nameSpan);
                header.appendChild(countSpan);
                item.appendChild(header);

                const track = document.createElement("div");
                track.className = "progress-track";

                const fill = document.createElement("div");
                fill.className = "progress-fill";
                if (opt.votes_count > 0 && opt.votes_count === maxVotes) {
                    fill.classList.add("winner");
                }
                fill.style.width = `${opt.percentage}%`;

                track.appendChild(fill);
                item.appendChild(track);
                resultsContainer.appendChild(item);
            });
        }

        openModal("results-modal");
    } catch (err) {
        showToast(`Failed to load results: ${err.message}`, "error");
    }
}

export function closeResultsModal() {
    activeResultsPollId = null;
    closeModal("results-modal");
}

/* =========================================================
   Celebration Queue & Modal Lifecycle (Unlimited Scale)
   ========================================================= */

function isModalVisuallyOpen() {
    const modal = document.getElementById("winner-modal");
    return modal && !modal.classList.contains("hidden");
}

export async function enqueueCelebration(pollId) {
    const numericId = Number(pollId);
    if (!numericId) return;

    if (!celebrationQueue.includes(numericId)) {
        celebrationQueue.push(numericId);
    }

    await processCelebrationQueue();
}

/**
 * Public trigger to celebrate a closed poll (e.g. from Admin close button).
 * Returns a promise that resolves once the winner modal has been shown.
 * Accepts a force option (default true) so manual close always shows the winner modal.
 */
export async function celebratePollWinner(pollId, force = true) {
    const numericId = Number(pollId);
    if (!numericId) return;

    loadCelebratedPollIds();
    if (!force && celebratedPollIds.has(numericId)) {
        return;
    }

    knownActivePollIds.delete(numericId);
    celebratedPollIds.add(numericId);
    saveCelebratedPollIds();

    await enqueueCelebration(numericId);
}

async function processCelebrationQueue() {
    // Self-healing: if the flag says open but the DOM disagrees, reset it —
    // but only after a short yield so the browser has had time to paint the
    // modal that openModal() just showed synchronously.
    if (isWinnerModalOpen) {
        await new Promise(r => setTimeout(r, 50));
        if (!isModalVisuallyOpen()) {
            console.error("[Celebration] Self-healing: resetting stale isWinnerModalOpen flag");
            isWinnerModalOpen = false;
        }
    }

    if (isWinnerModalOpen || celebrationQueue.length === 0) {
        return;
    }

    const nextPollId = celebrationQueue.shift();
    try {
        await showWinnerModal(nextPollId);
    } catch (err) {
        console.error("[Celebration] processCelebrationQueue error for poll", nextPollId, err);
        isWinnerModalOpen = false;
        // Continue draining the queue after a brief pause
        if (celebrationQueue.length > 0) {
            setTimeout(() => processCelebrationQueue(), 300);
        }
    }
}

async function showWinnerModal(pollId) {
    isWinnerModalOpen = true;
    lastCelebratedPollId = pollId;

    try {
        let results;
        try {
            results = await apiRequest(`/polls/${pollId}/results`);
        } catch (fetchErr) {
            console.error("[Celebration] Failed to fetch results for poll", pollId, fetchErr);
            isWinnerModalOpen = false;
            return;
        }

        const headlineEl = document.getElementById("winner-headline");
        const titleEl = document.getElementById("winner-poll-title");
        const cardEl = document.getElementById("winner-card");

        if (titleEl) titleEl.textContent = results.title;
        if (!cardEl) {
            console.error("[Celebration] #winner-card element not found in DOM");
            isWinnerModalOpen = false;
            return;
        }

        cardEl.replaceChildren();

        if (results.total_votes === 0) {
            // Edge Case: 0 votes cast
            if (headlineEl) headlineEl.textContent = "Poll Concluded";

            const zeroP = document.createElement("p");
            zeroP.className = "winner-zero-votes";
            zeroP.textContent = "Poll Closed — No votes were cast in this voting session.";
            cardEl.appendChild(zeroP);
        } else {
            const maxVotes = Math.max(...results.options.map(o => o.votes_count), 0);
            const winners = results.options.filter(o => o.votes_count === maxVotes);

            if (winners.length > 1) {
                // Edge Case: Tie
                if (headlineEl) headlineEl.textContent = "It's a Tie!";

                const label = document.createElement("div");
                label.className = "winner-label";
                label.textContent = `Tied Winners (${maxVotes} ${maxVotes === 1 ? 'vote' : 'votes'} each)`;
                cardEl.appendChild(label);

                const tieList = document.createElement("div");
                tieList.className = "winner-tie-list";

                winners.forEach(w => {
                    const tieItem = document.createElement("div");
                    tieItem.className = "winner-tie-item";
                    const trophyIcon = createSvgElement("trophy", "winner-item-icon");
                    const tieText = document.createElement("span");
                    tieText.textContent = `${w.text} (${w.percentage}%)`;
                    tieItem.appendChild(trophyIcon);
                    tieItem.appendChild(tieText);
                    tieList.appendChild(tieItem);
                });

                cardEl.appendChild(tieList);
            } else {
                // Single Winner
                if (headlineEl) headlineEl.textContent = "Poll Winner";

                const label = document.createElement("div");
                label.className = "winner-label";
                label.textContent = "Winning Choice";
                cardEl.appendChild(label);

                const nameEl = document.createElement("div");
                nameEl.className = "winner-option-name";
                nameEl.textContent = winners[0].text;
                cardEl.appendChild(nameEl);

                const statsEl = document.createElement("div");
                statsEl.className = "winner-stats";
                const starIcon = createSvgElement("star", "winner-star-icon");
                const statsText = document.createElement("span");
                statsText.textContent = `${winners[0].votes_count} ${winners[0].votes_count === 1 ? 'vote' : 'votes'} (${winners[0].percentage}%)`;
                statsEl.appendChild(starIcon);
                statsEl.appendChild(statsText);
                cardEl.appendChild(statsEl);
            }

            // Safe confetti firing in try/catch so confetti errors never block the modal
            try {
                launchConfetti();
            } catch (confettiErr) {
                console.warn("Confetti animation warning:", confettiErr);
            }
        }

        openModal("winner-modal");
    } catch (err) {
        console.error("[Celebration] showWinnerModal error for poll", pollId, err);
        isWinnerModalOpen = false;
        if (celebrationQueue.length > 0) {
            setTimeout(() => processCelebrationQueue(), 300);
        }
    }
}

/**
 * Cleanly closes the winner modal, resets the open flag, and processes any queued celebrations.
 */
export function closeWinnerModal() {
    closeModal("winner-modal");
    isWinnerModalOpen = false;

    // Small delay for smooth visual transition before presenting next queued winner
    setTimeout(() => {
        processCelebrationQueue();
    }, 350);
}

export function getLastCelebratedPollId() {
    return lastCelebratedPollId;
}
