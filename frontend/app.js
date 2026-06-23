const API = "";
const today = new Date().toISOString().slice(0, 10);
const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const COLORS = ["#F4B43E", "#EE5535", "#7F8B55", "#C98C2E", "#9B5B6B", "#6B5B95", "#556B2F", "#8B6C5C", "#BE5635"];

let username = localStorage.getItem("buddydejeuner_username") || "";
let teams = JSON.parse(localStorage.getItem("buddydejeuner_teams") || "[]");
let currentTeamId = localStorage.getItem("buddydejeuner_current_team") || "";
let currentTeam = null;
let restaurants = [];
let votes = {};
let currentResultView = "restaurant";
let hasSubmitted = false;

function colorFor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
    return COLORS[Math.abs(h) % COLORS.length];
}

function tagsOf(r) {
    return (r.tags || "").split(", ").filter(Boolean);
}

function saveTeams() {
    localStorage.setItem("buddydejeuner_teams", JSON.stringify(teams));
}

function setCurrentTeam(team) {
    currentTeam = team;
    currentTeamId = team.id;
    localStorage.setItem("buddydejeuner_current_team", team.id);
    if (!teams.find((t) => t.id === team.id)) {
        teams.push({ id: team.id, name: team.name, invite_code: team.invite_code });
        saveTeams();
    }
}

// --- Init ---

document.addEventListener("DOMContentLoaded", () => {
    const dayName = DAYS_FR[new Date().getDay()];
    document.getElementById("login-day-tag").textContent = dayName.toUpperCase() + " MIDI";
    document.getElementById("header-day").textContent = dayName;

    // Check for ?join=CODE in URL
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get("join");

    if (joinCode) {
        setupAppHandlers();
        // Join flow: need username first, then auto-join
        if (username) {
            autoJoin(joinCode);
        } else {
            showLoginScreen();
            document.getElementById("login-btn").addEventListener("click", () => {
                if (setUsername()) autoJoin(joinCode);
            });
            document.getElementById("username-input").addEventListener("keydown", (e) => {
                if (e.key === "Enter" && setUsername()) autoJoin(joinCode);
            });
        }
        return;
    }

    if (username && currentTeamId) {
        enterTeam(currentTeamId);
    } else if (username) {
        showTeamStep();
    } else {
        showLoginScreen();
    }

    setupLoginHandlers();
    setupAppHandlers();
});

function showLoginScreen() {
    document.getElementById("login-screen").hidden = false;
    document.getElementById("main-screen").hidden = true;
    document.getElementById("step-username").hidden = false;
    document.getElementById("step-team").hidden = true;
}

function setupLoginHandlers() {
    document.getElementById("login-btn").addEventListener("click", () => {
        if (setUsername()) showTeamStep();
    });
    document.getElementById("username-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && setUsername()) showTeamStep();
    });

    document.getElementById("create-team-btn").addEventListener("click", createTeam);
    document.getElementById("new-team-name").addEventListener("keydown", (e) => { if (e.key === "Enter") createTeam(); });
    document.getElementById("join-team-btn").addEventListener("click", joinTeamFromCode);
    document.getElementById("join-code-input").addEventListener("keydown", (e) => { if (e.key === "Enter") joinTeamFromCode(); });
}

function setupAppHandlers() {
    document.querySelectorAll(".tab-bar-btn").forEach((btn) => {
        btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    document.getElementById("vote-submit").addEventListener("click", submitVotes);
    document.getElementById("add-restaurant-btn").addEventListener("click", addRestaurant);
    document.getElementById("new-restaurant-name").addEventListener("keydown", (e) => { if (e.key === "Enter") addRestaurant(); });

    document.getElementById("toggle-resto").addEventListener("click", () => { currentResultView = "restaurant"; updateToggles(); renderResults(); });
    document.getElementById("toggle-col").addEventListener("click", () => { currentResultView = "person"; updateToggles(); renderResults(); });

    document.getElementById("reveal-browse-btn").addEventListener("click", showMatchBrowse);
    document.getElementById("reveal-podium-btn").addEventListener("click", goToPodium);
    document.getElementById("browse-podium-btn").addEventListener("click", goToPodium);
    document.getElementById("browse-close").addEventListener("click", goToPodium);
    document.getElementById("modal-close").addEventListener("click", () => { document.getElementById("edit-overlay").hidden = true; });

    document.getElementById("header-invite").addEventListener("click", copyInviteLink);
    document.getElementById("header-switch").addEventListener("click", () => {
        currentTeamId = "";
        localStorage.removeItem("buddydejeuner_current_team");
        document.getElementById("main-screen").hidden = true;
        document.getElementById("login-screen").hidden = false;
        document.getElementById("step-username").hidden = true;
        showTeamStep();
    });
}

// --- Username ---

function setUsername() {
    const input = document.getElementById("username-input");
    username = input.value.trim();
    if (!username) return false;
    localStorage.setItem("buddydejeuner_username", username);
    return true;
}

// --- Team selection ---

function showTeamStep() {
    document.getElementById("step-username").hidden = true;
    document.getElementById("step-team").hidden = false;
    document.getElementById("team-error").hidden = true;

    if (teams.length > 0) {
        document.getElementById("my-teams").hidden = false;
        document.getElementById("team-or-label").textContent = "Ou crée / rejoins une équipe";
        const list = document.getElementById("team-list");
        list.innerHTML = "";
        for (const t of teams) {
            list.innerHTML += `
                <div class="team-item" data-team-id="${t.id}">
                    <div class="team-item-name">${t.name}</div>
                    <div class="team-item-arrow">→</div>
                </div>
            `;
        }
        list.querySelectorAll(".team-item").forEach((item) => {
            item.addEventListener("click", () => enterTeam(item.dataset.teamId));
        });
    } else {
        document.getElementById("my-teams").hidden = true;
        document.getElementById("team-or-label").textContent = "Crée ou rejoins une équipe";
    }
}

function showTeamError(msg) {
    const el = document.getElementById("team-error");
    el.textContent = msg;
    el.hidden = false;
}

async function createTeam() {
    const name = document.getElementById("new-team-name").value.trim();
    if (!name) return;

    const res = await fetch(`${API}/api/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, user_name: username }),
    });
    const team = await res.json();
    setCurrentTeam(team);
    showMain();
}

async function joinTeamFromCode() {
    const code = document.getElementById("join-code-input").value.trim();
    if (!code) return;

    const res = await fetch(`${API}/api/teams/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: code, user_name: username }),
    });

    if (res.status === 404) { showTeamError("Code d'invitation invalide"); return; }
    if (res.status === 409) { showTeamError("Ce prénom est déjà pris dans cette équipe"); return; }

    const team = await res.json();
    setCurrentTeam(team);
    showMain();
}

async function autoJoin(code) {
    const res = await fetch(`${API}/api/teams/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: code, user_name: username }),
    });

    if (res.ok) {
        const team = await res.json();
        setCurrentTeam(team);
        window.history.replaceState({}, "", "/");
        showMain();
    } else if (res.status === 409) {
        // Already a member — just enter the team
        const teamRes = await fetch(`${API}/api/teams/join`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invite_code: code, user_name: username }),
        });
        // If username taken, they're already in — find the team from our list or fetch it
        window.history.replaceState({}, "", "/");
        showLoginScreen();
        showTeamError("Ce prénom est déjà pris dans cette équipe. Choisis un autre prénom.");
    } else {
        window.history.replaceState({}, "", "/");
        showLoginScreen();
        showTeamError("Code d'invitation invalide");
    }
}

async function enterTeam(teamId) {
    const res = await fetch(`${API}/api/teams/${teamId}`);
    if (!res.ok) {
        teams = teams.filter((t) => t.id !== teamId);
        saveTeams();
        showLoginScreen();
        return;
    }
    const team = await res.json();
    setCurrentTeam(team);
    showMain();
}

// --- Main app ---

function showMain() {
    document.getElementById("login-screen").hidden = true;
    document.getElementById("main-screen").hidden = false;
    document.getElementById("header-switch").textContent = username[0].toUpperCase();
    document.getElementById("header-team").textContent = currentTeam.name;
    switchTab("vote");
}

function copyInviteLink() {
    if (!currentTeam) return;
    const link = `${window.location.origin}/?join=${currentTeam.invite_code}`;
    navigator.clipboard.writeText(link).then(() => {
        const btn = document.getElementById("header-invite");
        btn.textContent = "✓";
        setTimeout(() => { btn.textContent = "📋"; }, 1500);
    });
}

// --- Tabs ---

function switchTab(tab) {
    document.querySelectorAll(".tab-bar-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".tab-content").forEach((s) => (s.hidden = true));
    document.getElementById(`tab-${tab}`).hidden = false;

    if (tab === "vote") loadVotePage();
    if (tab === "results") loadResultsPage();
    if (tab === "restaurants") loadRestaurantsPage();
}

// --- Vote ---

async function loadVotePage() {
    [restaurants, votes] = await Promise.all([
        fetch(`${API}/api/teams/${currentTeamId}/restaurants`).then((r) => r.json()),
        fetch(`${API}/api/teams/${currentTeamId}/votes/${today}`).then((r) => r.json()),
    ]);

    const myVotes = votes[username] || [];
    hasSubmitted = myVotes.length > 0;
    const voterCount = Object.keys(votes).length;
    document.getElementById("vote-subtitle").textContent =
        `Choisis tes favoris · ${voterCount} collègue${voterCount > 1 ? "s" : ""} vote${voterCount > 1 ? "nt" : ""} · ${myVotes.length} sélectionné${myVotes.length > 1 ? "s" : ""}`;

    const btn = document.getElementById("vote-submit");
    btn.textContent = hasSubmitted ? "METTRE À JOUR →" : "ENVOYER MES VOTES →";
    btn.classList.toggle("disabled", myVotes.length === 0);

    const container = document.getElementById("vote-list");
    container.innerHTML = "";

    for (const r of restaurants) {
        const sel = myVotes.includes(r.id);
        const tags = tagsOf(r);
        const meta = tags.length > 0 ? tags.join(" · ") : "";
        const color = colorFor(r.name);

        container.innerHTML += `
            <div class="resto-card ${sel ? "selected" : ""}" data-id="${r.id}">
                <div class="resto-mono" style="background:${color}">${r.name[0].toUpperCase()}</div>
                <div class="resto-info">
                    <div class="resto-name">${r.name}</div>
                    ${meta ? `<div class="resto-meta">${meta}</div>` : ""}
                </div>
                <div class="resto-badge ${sel ? "on" : "off"}">${sel ? "PICKED" : "+"}</div>
            </div>
        `;
    }

    container.querySelectorAll(".resto-card").forEach((card) => {
        card.addEventListener("click", () => {
            card.classList.toggle("selected");
            const badge = card.querySelector(".resto-badge");
            const isSel = card.classList.contains("selected");
            badge.className = `resto-badge ${isSel ? "on" : "off"}`;
            badge.textContent = isSel ? "PICKED" : "+";
            updateVoteCount();
        });
    });
}

function updateVoteCount() {
    const selected = document.querySelectorAll("#vote-list .resto-card.selected");
    const btn = document.getElementById("vote-submit");
    btn.classList.toggle("disabled", selected.length === 0);
    const voterCount = Object.keys(votes).length;
    document.getElementById("vote-subtitle").textContent =
        `Choisis tes favoris · ${voterCount} collègue${voterCount > 1 ? "s" : ""} vote${voterCount > 1 ? "nt" : ""} · ${selected.length} sélectionné${selected.length > 1 ? "s" : ""}`;
}

async function submitVotes() {
    const selected = [...document.querySelectorAll("#vote-list .resto-card.selected")];
    if (selected.length === 0) return;
    const ids = selected.map((c) => c.dataset.id);

    await fetch(`${API}/api/teams/${currentTeamId}/votes/${today}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_name: username, restaurant_ids: ids }),
    });

    votes = await fetch(`${API}/api/teams/${currentTeamId}/votes/${today}`).then((r) => r.json());
    hasSubmitted = true;

    const matches = getMatches();
    if (matches.length > 0) {
        showMatchReveal(matches);
    } else {
        switchTab("results");
    }
}

// --- Matches ---

function getMatches() {
    const myVotes = votes[username] || [];
    const matches = [];
    for (const [person, picks] of Object.entries(votes)) {
        if (person === username) continue;
        const shared = picks.filter((id) => myVotes.includes(id));
        if (shared.length > 0) matches.push({ name: person, sharedIds: shared, count: shared.length });
    }
    return matches.sort((a, b) => b.count - a.count);
}

function showMatchReveal(matches) {
    const overlay = document.getElementById("match-reveal");
    document.getElementById("reveal-match-count").textContent = matches.length;

    const avatarContainer = document.getElementById("reveal-avatars");
    avatarContainer.innerHTML = `
        <div class="match-avatar-you">TOI</div>
        <div class="match-avatar-heart">♥</div>
    `;
    for (const m of matches.slice(0, 3)) {
        avatarContainer.innerHTML += `<div class="match-avatar-other" style="background:${colorFor(m.name)}">${m.name[0].toUpperCase()}</div>`;
    }

    overlay.hidden = false;
}

function showMatchBrowse() {
    document.getElementById("match-reveal").hidden = true;
    const matches = getMatches();
    const overlay = document.getElementById("match-browse");
    document.getElementById("browse-match-count").textContent = matches.length;

    const restaurantById = Object.fromEntries(restaurants.map((r) => [r.id, r.name]));
    const list = document.getElementById("match-list");
    list.innerHTML = "";

    matches.forEach((m, i) => {
        const sharedNames = m.sharedIds.map((id) => restaurantById[id]).filter(Boolean);
        const chips = sharedNames.map((n) => `<span class="chip ${i === 0 ? "shared" : ""}">${n}</span>`).join("");
        list.innerHTML += `
            <div class="match-card ${i === 0 ? "top" : ""}">
                <div class="colleague-header">
                    <div class="colleague-avatar" style="background:${colorFor(m.name)}">${m.name[0].toUpperCase()}</div>
                    <div style="flex:1">
                        <div class="colleague-name">${m.name}</div>
                        <div class="colleague-count">${m.count} resto${m.count > 1 ? "s" : ""} en commun</div>
                    </div>
                    ${i === 0 ? '<span class="top-tag">TOP</span>' : ""}
                </div>
                <div class="chip-list">${chips}</div>
            </div>
        `;
    });

    overlay.hidden = false;
}

function goToPodium() {
    document.getElementById("match-reveal").hidden = true;
    document.getElementById("match-browse").hidden = true;
    switchTab("results");
}

// --- Results ---

function updateToggles() {
    document.getElementById("toggle-resto").classList.toggle("active", currentResultView === "restaurant");
    document.getElementById("toggle-col").classList.toggle("active", currentResultView === "person");
}

async function loadResultsPage() {
    [restaurants, votes] = await Promise.all([
        fetch(`${API}/api/teams/${currentTeamId}/restaurants`).then((r) => r.json()),
        fetch(`${API}/api/teams/${currentTeamId}/votes/${today}`).then((r) => r.json()),
    ]);

    const matches = getMatches();
    const badge = document.getElementById("match-badge");
    if (matches.length > 0 && hasSubmitted) {
        badge.textContent = `${matches.length} matchs ♥`;
        badge.hidden = false;
        badge.onclick = showMatchBrowse;
    } else {
        badge.hidden = true;
    }

    renderResults();
}

function renderResults() {
    const container = document.getElementById("results-content");
    const restaurantById = Object.fromEntries(restaurants.map((r) => [r.id, r.name]));
    const barColors = ["#F4B43E", "#EE5535", "#7F8B55", "#C98C2E", "#9B5B6B", "#6B5B95"];

    if (Object.keys(votes).length === 0) {
        container.innerHTML = '<div class="page-subtitle" style="margin-top:20px">Personne n\'a encore voté aujourd\'hui.</div>';
        return;
    }

    if (currentResultView === "restaurant") {
        const results = restaurants
            .map((r) => {
                const voters = Object.entries(votes).filter(([_, picks]) => picks.includes(r.id)).map(([name]) => name);
                return { ...r, voters, total: voters.length };
            })
            .filter((r) => r.total > 0)
            .sort((a, b) => b.total - a.total);

        const maxTotal = Math.max(...results.map((r) => r.total), 1);
        let html = "";
        results.forEach((r, i) => {
            const barWidth = Math.round((r.total / maxTotal) * 100);
            html += `
                <div class="result-card ${i === 0 ? "top" : ""}">
                    <div style="display:flex;align-items:center;justify-content:space-between">
                        <span class="result-rank">${i + 1} · ${r.name}</span>
                        <span class="result-score">${r.total}</span>
                    </div>
                    <div class="result-bar"><div class="result-bar-fill" style="width:${barWidth}%;background:${barColors[i % barColors.length]}"></div></div>
                    <div class="result-voters">${r.voters.join(", ")}</div>
                </div>
            `;
        });
        container.innerHTML = html;
    } else {
        let html = "";
        const myVotes = votes[username] || [];
        for (const [person, picks] of Object.entries(votes).sort()) {
            const restoNames = picks.map((id) => {
                const shared = hasSubmitted && person !== username && myVotes.includes(id);
                return { name: restaurantById[id], shared };
            }).filter((r) => r.name);

            const chips = restoNames.map((r) => `<span class="chip ${r.shared ? "shared" : ""}">${r.name}</span>`).join("");
            const color = colorFor(person);
            html += `
                <div class="colleague-card">
                    <div class="colleague-header">
                        <div class="colleague-avatar" style="background:${color}">${person[0].toUpperCase()}</div>
                        <div style="flex:1">
                            <div class="colleague-name">${person}</div>
                            <div class="colleague-count">${picks.length} vote${picks.length > 1 ? "s" : ""}</div>
                        </div>
                    </div>
                    <div class="chip-list">${chips}</div>
                </div>
            `;
        }
        container.innerHTML = html;
    }
}

// --- Restaurants management ---

async function addRestaurant() {
    const input = document.getElementById("new-restaurant-name");
    const name = input.value.trim();
    if (!name) return;

    await fetch(`${API}/api/teams/${currentTeamId}/restaurants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });

    input.value = "";
    loadRestaurantsPage();
}

async function loadRestaurantsPage() {
    restaurants = await fetch(`${API}/api/teams/${currentTeamId}/restaurants`).then((r) => r.json());
    const container = document.getElementById("restaurant-list");
    container.innerHTML = "";

    for (const r of restaurants) {
        const tags = tagsOf(r);
        const meta = tags.length > 0 ? tags.join(" · ") : r.address || "";
        const color = colorFor(r.name);

        container.innerHTML += `
            <div class="resto-card" style="cursor:default" data-id="${r.id}">
                <div class="resto-mono" style="background:${color}">${r.name[0].toUpperCase()}</div>
                <div class="resto-info">
                    <div class="resto-name">${r.name}</div>
                    ${meta ? `<div class="resto-meta">${meta}</div>` : ""}
                </div>
                <div class="edit-btn" data-edit-id="${r.id}">Éditer</div>
            </div>
        `;
    }

    container.querySelectorAll(".edit-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            openEditModal(btn.dataset.editId);
        });
    });
}

function openEditModal(id) {
    const r = restaurants.find((x) => x.id === id);
    if (!r) return;
    const isFoodtruck = r.id.startsWith("ft-");
    const tags = r.tags || "";

    document.getElementById("modal-title").textContent = r.name;

    let fields = "";
    if (isFoodtruck) {
        fields = `<label>Tags (séparés par des virgules)<input type="text" id="modal-tags" value="${tags}" class="bd-input"></label>`;
    } else {
        fields = `
            <label>Nom<input type="text" id="modal-name" value="${r.name}" class="bd-input"></label>
            <label>Adresse<input type="text" id="modal-address" value="${r.address}" class="bd-input"></label>
            <label>Tags (séparés par des virgules)<input type="text" id="modal-tags" value="${tags}" class="bd-input"></label>
        `;
    }
    document.getElementById("modal-fields").innerHTML = fields;

    let buttons = `<div class="modal-actions">`;
    buttons += `<div class="bd-btn bd-btn-primary" id="modal-save" style="flex:1">Enregistrer</div>`;
    if (!isFoodtruck) {
        buttons += `<div class="bd-btn bd-btn-dark" id="modal-delete" style="flex:1">Supprimer</div>`;
    }
    buttons += `</div>`;
    document.getElementById("modal-buttons").innerHTML = buttons;

    document.getElementById("edit-overlay").hidden = false;

    document.getElementById("modal-save").addEventListener("click", async () => {
        if (isFoodtruck) {
            await fetch(`${API}/api/foodtrucks/${id}/tags`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tags: document.getElementById("modal-tags").value }),
            });
        } else {
            await fetch(`${API}/api/teams/${currentTeamId}/restaurants/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: document.getElementById("modal-name").value,
                    address: document.getElementById("modal-address").value,
                    tags: document.getElementById("modal-tags").value,
                }),
            });
        }
        document.getElementById("edit-overlay").hidden = true;
        loadRestaurantsPage();
    });

    const deleteBtn = document.getElementById("modal-delete");
    if (deleteBtn) {
        deleteBtn.addEventListener("click", async () => {
            if (!confirm("Supprimer ce restaurant ?")) return;
            await fetch(`${API}/api/teams/${currentTeamId}/restaurants/${id}`, { method: "DELETE" });
            document.getElementById("edit-overlay").hidden = true;
            loadRestaurantsPage();
        });
    }
}
