// frontend/js/myVotes.js
import { apiRequest } from "./api.js";
import { showToast, createSvgElement } from "./ui.js";
import { showPollResults, parseUtcDate } from "./polls.js";

/**
 * Loads the authenticated user's voting history and renders glassmorphism cards.
 */
export async function loadMyVotes() {
    const container = document.getElementById("my-votes-grid");
    const emptyState = document.getElementById("my-votes-empty");
    if (!container) return;

    try {
        const votes = await apiRequest("/polls/my-votes");
        container.replaceChildren();

        if (!votes || votes.length === 0) {
            emptyState?.classList.remove("hidden");
            return;
        }

        emptyState?.classList.add("hidden");

        votes.forEach(vote => {
            const card = createMyVoteCard(vote);
            container.appendChild(card);
        });
    } catch (err) {
        showToast(`Failed to load your voting history: ${err.message}`, "error");
    }
}

function createMyVoteCard(vote) {
    const card = document.createElement("div");
    card.className = "my-vote-card";

    // Card Header: Title & Status
    const header = document.createElement("div");
    header.className = "card-header";

    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = vote.poll_title;

    const badge = document.createElement("span");
    badge.className = `badge ${vote.poll_is_closed ? "badge-closed" : "badge-active"}`;
    badge.textContent = vote.poll_is_closed ? "Closed" : "Active";

    header.appendChild(title);
    header.appendChild(badge);
    card.appendChild(header);

    // Description (if present)
    if (vote.poll_description) {
        const desc = document.createElement("p");
        desc.className = "card-desc";
        desc.textContent = vote.poll_description;
        card.appendChild(desc);
    }

    // Highlighted User Choice
    const choiceBox = document.createElement("div");
    choiceBox.className = "my-vote-choice";

    const choiceLabel = document.createElement("div");
    choiceLabel.className = "my-vote-choice-label";
    choiceLabel.textContent = "Your Selection";

    const choiceText = document.createElement("div");
    choiceText.className = "my-vote-choice-text";
    choiceText.appendChild(createSvgElement("check", "choice-check-icon"));
    const choiceSpan = document.createElement("span");
    choiceSpan.textContent = vote.voted_option_text;
    choiceText.appendChild(choiceSpan);

    choiceBox.appendChild(choiceLabel);
    choiceBox.appendChild(choiceText);
    card.appendChild(choiceBox);

    // Metadata Row
    const meta = document.createElement("div");
    meta.className = "my-vote-meta";

    const votedDate = parseUtcDate(vote.voted_at) || new Date(vote.voted_at);
    const dateStr = votedDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });

    const dateSpan = document.createElement("span");
    dateSpan.textContent = `Voted ${dateStr}`;

    const totalVotesSpan = document.createElement("span");
    totalVotesSpan.textContent = `${vote.total_votes} community ${vote.total_votes === 1 ? "vote" : "votes"}`;

    meta.appendChild(dateSpan);
    meta.appendChild(totalVotesSpan);
    card.appendChild(meta);

    // Card Actions
    const actions = document.createElement("div");
    actions.className = "card-actions";

    const btnResults = document.createElement("button");
    btnResults.type = "button";
    btnResults.className = "btn btn-secondary btn-block";
    btnResults.textContent = "View Live Results";
    btnResults.addEventListener("click", () => showPollResults(vote.poll_id));

    actions.appendChild(btnResults);
    card.appendChild(actions);

    return card;
}
