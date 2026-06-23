const API = "";
const today = new Date().toISOString().slice(0, 10);
const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const COLORS = ["#F4B43E", "#EE5535", "#7F8B55", "#C98C2E", "#9B5B6B", "#6B5B95", "#556B2F", "#8B6C5C", "#BE5635"];

let userId = localStorage.getItem("buddydejeuner_user_id") || "";
let currentTeamId = localStorage.getItem("buddydejeuner_current_team") || "";
let currentTeam = null;
let displayName = "";
let isAdmin = false;
let teams = [];
let restaurants = [];
let votes = {};
let currentResultView = "restaurant";
let hasSubmitted = false;
let pendingJoinCode = "";

function colorFor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
    return COLORS[Math.abs(h) % COLORS.length];
}

function tagsOf(r) {
    return (r.tags || "").split(", ").filter(Boolean);
}

function battletag_name() {
    return userId.split("#")[0];
}

// --- Init ---

document.addEventListener("DOMContentLoaded", async () => {
    const dayName = DAYS_FR[new Date().getDay()];
    document.getElementById("login-day-tag").textContent = dayName.toUpperCase() + " MIDI";
    document.getElementById("header-day").textContent = dayName;

    setupLoginHandlers();
    setupAppHandlers();

    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get("join");

    if (joinCode) {
        window.history.replaceState({}, "", "/");
        if (userId) {
            const ok = await loginWithUserId();
            if (ok) {
                await autoJoin(joinCode);
            } else {
                pendingJoinCode = joinCode;
                showLoginScreen();
            }
        } else {
            pendingJoinCode = joinCode;
            showLoginScreen();
        }
        return;
    }

    if (userId) {
        const ok = await loginWithUserId();
        if (ok && currentTeamId) {
            await enterTeam(currentTeamId);
        } else if (ok) {
            showTeamStep();
        } else {
            showLoginScreen();
        }
    } else {
        showLoginScreen();
    }
});

async function loginWithUserId() {
    const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) {
        userId = "";
        localStorage.removeItem("buddydejeuner_user_id");
        return false;
    }
    const data = await res.json();
    teams = data.teams;
    return true;
}

// --- Login screen ---

function showLoginScreen() {
    document.getElementById("login-screen").hidden = false;
    document.getElementById("main-screen").hidden = true;
    document.getElementById("step-login").hidden = false;
    document.getElementById("step-recover").hidden = true;
    document.getElementById("step-tag-reveal").hidden = true;
    document.getElementById("step-team").hidden = true;
    document.getElementById("login-error").hidden = true;
}

function setupLoginHandlers() {
    document.getElementById("login-btn").addEventListener("click", handleLogin);
    document.getElementById("login-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleLogin();
    });

    document.getElementById("recovery-link").addEventListener("click", showRecovery);
    document.getElementById("back-to-login").addEventListener("click", showLoginScreen);

    document.getElementById("recover-search-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") recoverSearch();
    });
    document.getElementById("recover-search-input").addEventListener("input", () => {
        document.getElementById("recover-members").hidden = true;
        document.getElementById("recover-error").hidden = true;
    });
    let recoverDebounce = null;
    document.getElementById("recover-search-input").addEventListener("input", () => {
        clearTimeout(recoverDebounce);
        recoverDebounce = setTimeout(recoverSearch, 500);
    });
    document.getElementById("recover-id-btn").addEventListener("click", recoverById);
    document.getElementById("recover-id-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") recoverById();
    });

    document.getElementById("tag-reveal-continue").addEventListener("click", () => {
        document.getElementById("step-tag-reveal").hidden = true;
        if (pendingJoinCode) {
            autoJoin(pendingJoinCode);
            pendingJoinCode = "";
        } else {
            showTeamStep();
        }
    });

    document.getElementById("create-team-btn").addEventListener("click", createTeam);
    document.getElementById("new-team-name").addEventListener("keydown", (e) => { if (e.key === "Enter") createTeam(); });
    document.getElementById("join-team-btn").addEventListener("click", joinTeamFromCode);
    document.getElementById("join-code-input").addEventListener("keydown", (e) => { if (e.key === "Enter") joinTeamFromCode(); });
}

async function handleLogin() {
    const input = document.getElementById("login-input").value.trim();
    if (!input) return;
    document.getElementById("login-error").hidden = true;

    if (input.includes("#")) {
        const res = await fetch(`${API}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: input }),
        });
        if (!res.ok) {
            showLoginError("Identifiant inconnu");
            return;
        }
        const data = await res.json();
        userId = data.id;
        teams = data.teams;
        localStorage.setItem("buddydejeuner_user_id", userId);
        if (pendingJoinCode) {
            await autoJoin(pendingJoinCode);
            pendingJoinCode = "";
        } else {
            showTeamStep();
        }
    } else {
        const res = await fetch(`${API}/api/users`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: input }),
        });
        const data = await res.json();
        userId = data.id;
        teams = [];
        localStorage.setItem("buddydejeuner_user_id", userId);
        document.getElementById("step-login").hidden = true;
        document.getElementById("tag-reveal-value").textContent = userId;
        document.getElementById("step-tag-reveal").hidden = false;
    }
}

function showLoginError(msg) {
    const el = document.getElementById("login-error");
    el.textContent = msg;
    el.hidden = false;
}

// --- Recovery ---

function showRecovery() {
    document.getElementById("step-login").hidden = true;
    document.getElementById("step-recover").hidden = false;
    document.getElementById("recover-error").hidden = true;
    document.getElementById("recover-members").hidden = true;
}

function showRecoverError(msg) {
    const el = document.getElementById("recover-error");
    el.textContent = msg;
    el.hidden = false;
}

async function recoverSearch() {
    const input = document.getElementById("recover-search-input").value.trim();
    if (!input) return;
    document.getElementById("recover-error").hidden = true;
    document.getElementById("recover-members").hidden = true;

    const isCode = /^[A-Fa-f0-9]{6}$/.test(input);
    const body = isCode ? { invite_code: input } : { team_name: input };

    const res = await fetch(`${API}/api/auth/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (res.status === 404) { showRecoverError(isCode ? "Code d'invitation invalide" : "Aucune équipe trouvée"); return; }
    if (res.status === 409) { showRecoverError("Plusieurs équipes avec ce nom. Utilise le code d'invitation."); return; }
    if (!res.ok) { showRecoverError("Erreur"); return; }

    showRecoveryMembers(await res.json());
}

async function recoverById() {
    const input = document.getElementById("recover-id-input").value.trim();
    if (!input) return;
    document.getElementById("recover-error").hidden = true;

    const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: input }),
    });

    if (!res.ok) { showRecoverError("Identifiant inconnu"); return; }

    const data = await res.json();
    userId = data.id;
    teams = data.teams;
    localStorage.setItem("buddydejeuner_user_id", userId);
    showTeamStep();
}

function showRecoveryMembers(data) {
    document.getElementById("recover-team-name").textContent = data.team_name;
    const list = document.getElementById("recover-member-list");
    list.innerHTML = "";
    for (const m of data.members) {
        list.innerHTML += `
            <div class="team-item" data-team-id="${data.team_id}" data-name="${m.display_name}" data-admin="${m.is_admin ? 1 : 0}">
                <div class="team-item-name">${m.display_name}${m.is_admin ? ' <span class="admin-member-badge">ADMIN</span>' : ""}</div>
                <div class="team-item-arrow">&rarr;</div>
            </div>
        `;
    }
    list.querySelectorAll(".team-item").forEach((item) => {
        item.addEventListener("click", () => {
            if (item.dataset.admin === "1") {
                promptAdminRecovery(item.dataset.teamId, item.dataset.name);
            } else {
                confirmRecovery(item.dataset.teamId, item.dataset.name);
            }
        });
    });
    document.getElementById("recover-members").hidden = false;
}

function promptAdminRecovery(teamId, name) {
    const list = document.getElementById("recover-member-list");
    list.innerHTML = `
        <div style="text-align:center;margin-bottom:8px">
            <div class="team-section-title">Compte admin : saisis ton identifiant</div>
        </div>
        <input type="text" id="admin-recover-input" placeholder="Ex: ${name}#1234" class="bd-input login-input">
        <div id="admin-recover-btn" class="bd-btn bd-btn-primary">CONFIRMER</div>
        <div id="admin-recover-error" class="team-error" hidden></div>
    `;
    document.getElementById("admin-recover-btn").addEventListener("click", () => submitAdminRecovery(teamId, name));
    document.getElementById("admin-recover-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") submitAdminRecovery(teamId, name);
    });
}

async function submitAdminRecovery(teamId, name) {
    const input = document.getElementById("admin-recover-input").value.trim();
    if (!input) return;

    const res = await fetch(`${API}/api/auth/recover/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, display_name: name, user_id: input }),
    });

    if (res.status === 403) {
        const err = document.getElementById("admin-recover-error");
        err.textContent = "Identifiant incorrect";
        err.hidden = false;
        return;
    }
    if (!res.ok) { showRecoverError("Erreur"); return; }

    const data = await res.json();
    userId = data.user_id;
    teams = data.teams;
    localStorage.setItem("buddydejeuner_user_id", userId);
    await enterTeam(teamId);
}

async function confirmRecovery(teamId, name) {
    const res = await fetch(`${API}/api/auth/recover/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, display_name: name }),
    });
    if (!res.ok) { showRecoverError("Erreur lors de la récupération"); return; }

    const data = await res.json();
    userId = data.user_id;
    teams = data.teams;
    localStorage.setItem("buddydejeuner_user_id", userId);
    await enterTeam(teamId);
}

// --- Team selection ---

function showTeamStep() {
    document.getElementById("login-screen").hidden = false;
    document.getElementById("main-screen").hidden = true;
    document.getElementById("step-login").hidden = true;
    document.getElementById("step-recover").hidden = true;
    document.getElementById("step-tag-reveal").hidden = true;
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
                    <div class="team-item-arrow">&rarr;</div>
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
        body: JSON.stringify({ name, user_id: userId, display_name: battletag_name() }),
    });
    const team = await res.json();
    teams.push({ id: team.id, name: team.name, invite_code: team.invite_code, display_name: battletag_name(), is_admin: 1 });
    await enterTeam(team.id);
}

async function joinTeamFromCode() {
    const code = document.getElementById("join-code-input").value.trim();
    if (!code) return;

    const dn = battletag_name();
    const res = await fetch(`${API}/api/teams/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: code, user_id: userId, display_name: dn }),
    });

    if (res.status === 404) { showTeamError("Code d'invitation invalide"); return; }
    if (res.status === 409) {
        const data = await res.json();
        if (data.error === "already_member") {
            showTeamError("Tu es déjà dans cette équipe");
        } else {
            showTeamError("Ce prénom est déjà pris dans cette équipe");
        }
        return;
    }

    const team = await res.json();
    teams.push({ id: team.id, name: team.name, invite_code: team.invite_code, display_name: dn, is_admin: 0 });
    await enterTeam(team.id);
}

async function autoJoin(code) {
    const dn = battletag_name();
    const res = await fetch(`${API}/api/teams/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: code, user_id: userId, display_name: dn }),
    });

    if (res.ok) {
        const team = await res.json();
        teams.push({ id: team.id, name: team.name, invite_code: team.invite_code, display_name: dn, is_admin: 0 });
        await enterTeam(team.id);
    } else if (res.status === 409) {
        const data = await res.json();
        if (data.error === "already_member") {
            await loginWithUserId();
            const myTeam = teams.find((t) => t.invite_code === code.trim().toUpperCase());
            if (myTeam) {
                await enterTeam(myTeam.id);
            } else {
                showTeamStep();
            }
        } else {
            showTeamStep();
            showTeamError("Ce prénom est déjà pris dans cette équipe. Rejoins via le code d'invitation avec un autre prénom.");
            document.getElementById("join-code-input").value = code;
        }
    } else {
        showLoginScreen();
        showLoginError("Code d'invitation invalide");
    }
}

async function enterTeam(teamId) {
    const res = await fetch(`${API}/api/teams/${teamId}`);
    if (!res.ok) {
        teams = teams.filter((t) => t.id !== teamId);
        showTeamStep();
        return;
    }
    const team = await res.json();
    currentTeam = team;
    currentTeamId = team.id;
    localStorage.setItem("buddydejeuner_current_team", team.id);

    const myTeam = teams.find((t) => t.id === teamId);
    if (myTeam) {
        displayName = myTeam.display_name;
        isAdmin = Boolean(myTeam.is_admin);
    }

    showMain();
}

// --- Main app ---

function showMain() {
    document.getElementById("login-screen").hidden = true;
    document.getElementById("main-screen").hidden = false;
    document.getElementById("user-menu").hidden = true;
    document.getElementById("header-switch").textContent = displayName[0].toUpperCase();
    document.getElementById("header-team").textContent = currentTeam.name;
    document.getElementById("menu-admin").hidden = !isAdmin;
    switchTab("vote");
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
    document.getElementById("header-switch").addEventListener("click", toggleUserMenu);

    // User menu
    document.getElementById("menu-copy-tag").addEventListener("click", () => {
        navigator.clipboard.writeText(userId);
        const el = document.getElementById("menu-copy-tag");
        el.textContent = "Copié !";
        setTimeout(() => { el.innerHTML = `Ton identifiant <span class="user-menu-tag">${userId}</span>`; }, 2000);
    });
    document.getElementById("menu-switch-team").addEventListener("click", () => {
        document.getElementById("user-menu").hidden = true;
        currentTeamId = "";
        localStorage.removeItem("buddydejeuner_current_team");
        document.getElementById("main-screen").hidden = true;
        showTeamStep();
    });
    document.getElementById("menu-admin").addEventListener("click", () => {
        document.getElementById("user-menu").hidden = true;
        openAdminPanel();
    });
    document.getElementById("menu-logout").addEventListener("click", () => {
        document.getElementById("user-menu").hidden = true;
        userId = "";
        currentTeamId = "";
        teams = [];
        localStorage.removeItem("buddydejeuner_user_id");
        localStorage.removeItem("buddydejeuner_current_team");
        showLoginScreen();
    });

    // Admin panel
    document.getElementById("admin-close").addEventListener("click", () => { document.getElementById("admin-overlay").hidden = true; });
    document.getElementById("admin-rename-btn").addEventListener("click", adminRename);
    document.getElementById("admin-copy-code-btn").addEventListener("click", () => {
        const code = document.getElementById("admin-invite-code").textContent;
        navigator.clipboard.writeText(`${window.location.origin}/?join=${code}`);
        const btn = document.getElementById("admin-copy-code-btn");
        btn.textContent = "COPIÉ !";
        setTimeout(() => { btn.textContent = "COPIER"; }, 2000);
    });
    document.getElementById("admin-regen-btn").addEventListener("click", adminRegenCode);
    document.getElementById("admin-delete-btn").addEventListener("click", adminDeleteTeam);

    // Close user menu when clicking outside
    document.addEventListener("click", (e) => {
        const menu = document.getElementById("user-menu");
        const avatar = document.getElementById("header-switch");
        if (!menu.hidden && !menu.contains(e.target) && !avatar.contains(e.target)) {
            menu.hidden = true;
        }
    });
}

function toggleUserMenu() {
    const menu = document.getElementById("user-menu");
    if (!menu.hidden) {
        menu.hidden = true;
        return;
    }
    document.getElementById("menu-display-name").textContent = displayName;
    document.getElementById("menu-team-name").textContent = currentTeam.name;
    document.getElementById("menu-copy-tag").innerHTML = `Ton identifiant <span class="user-menu-tag">${userId}</span>`;
    menu.hidden = false;
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

// --- Admin panel ---

async function openAdminPanel() {
    const res = await fetch(`${API}/api/teams/${currentTeamId}/admin?user_id=${encodeURIComponent(userId)}`);
    if (!res.ok) return;

    const data = await res.json();
    document.getElementById("admin-title").textContent = data.team.name;
    document.getElementById("admin-team-name-input").value = data.team.name;
    document.getElementById("admin-invite-code").textContent = data.team.invite_code;

    const list = document.getElementById("admin-member-list");
    list.innerHTML = "";
    for (const m of data.members) {
        list.innerHTML += `
            <div class="admin-member">
                <div class="admin-member-name">${m.display_name}</div>
                ${m.is_admin ? '<span class="admin-member-badge">ADMIN</span>' : `<span class="admin-member-remove" data-name="${m.display_name}">Retirer</span>`}
            </div>
        `;
    }
    list.querySelectorAll(".admin-member-remove").forEach((btn) => {
        btn.addEventListener("click", () => adminRemoveMember(btn.dataset.name));
    });

    document.getElementById("admin-overlay").hidden = false;
}

async function adminRename() {
    const name = document.getElementById("admin-team-name-input").value.trim();
    if (!name) return;

    const res = await fetch(`${API}/api/teams/${currentTeamId}/admin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, name }),
    });
    if (!res.ok) return;

    const data = await res.json();
    currentTeam.name = data.team.name;
    document.getElementById("header-team").textContent = data.team.name;
    document.getElementById("admin-title").textContent = data.team.name;
    const myTeam = teams.find((t) => t.id === currentTeamId);
    if (myTeam) myTeam.name = data.team.name;
}

async function adminRegenCode() {
    if (!confirm("Régénérer le code d'invitation ? L'ancien ne fonctionnera plus.")) return;

    const res = await fetch(`${API}/api/teams/${currentTeamId}/admin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, regenerate_code: true }),
    });
    if (!res.ok) return;

    const data = await res.json();
    currentTeam.invite_code = data.team.invite_code;
    document.getElementById("admin-invite-code").textContent = data.team.invite_code;
    const myTeam = teams.find((t) => t.id === currentTeamId);
    if (myTeam) myTeam.invite_code = data.team.invite_code;
}

async function adminRemoveMember(name) {
    if (!confirm(`Retirer ${name} de l'équipe ?`)) return;

    const res = await fetch(`${API}/api/teams/${currentTeamId}/members/${encodeURIComponent(name)}?user_id=${encodeURIComponent(userId)}`, {
        method: "DELETE",
    });
    if (!res.ok) return;

    openAdminPanel();
}

async function adminDeleteTeam() {
    if (!confirm("Supprimer l'équipe ? Cette action est irréversible.")) return;
    if (!confirm("Vraiment supprimer ? Tous les votes et restaurants seront perdus.")) return;

    const res = await fetch(`${API}/api/teams/${currentTeamId}?user_id=${encodeURIComponent(userId)}`, {
        method: "DELETE",
    });
    if (!res.ok) return;

    document.getElementById("admin-overlay").hidden = true;
    teams = teams.filter((t) => t.id !== currentTeamId);
    currentTeamId = "";
    localStorage.removeItem("buddydejeuner_current_team");
    document.getElementById("main-screen").hidden = true;
    showTeamStep();
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

    const myVotes = votes[displayName] || [];
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
        body: JSON.stringify({ user_id: userId, restaurant_ids: ids }),
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
    const myVotes = votes[displayName] || [];
    const matches = [];
    for (const [person, picks] of Object.entries(votes)) {
        if (person === displayName) continue;
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
        const myVotes = votes[displayName] || [];
        for (const [person, picks] of Object.entries(votes).sort()) {
            const restoNames = picks.map((id) => {
                const shared = hasSubmitted && person !== displayName && myVotes.includes(id);
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
