const GH_USER = "Rick-Clinton-jpg";

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function setStat(id, value, isErr = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  el.classList.remove("loading");
  if (isErr) el.classList.add("err");
}

async function loadGithubStats() {
  try {
    const user = await fetchJSON(`https://api.github.com/users/${GH_USER}`);
    setStat("stat-repos", user.public_repos ?? "—");
  } catch (e) {
    setStat("stat-repos", "offline", true);
  }

  try {
    const repos = await fetchJSON(`https://api.github.com/users/${GH_USER}/repos?per_page=100`);
    const pushDates = repos.map(r => new Date(r.pushed_at)).filter(d => !isNaN(d));
    if (pushDates.length) {
      const latest = new Date(Math.max(...pushDates));
      const days = Math.floor((Date.now() - latest) / 86400000);
      setStat("stat-last-push", days === 0 ? "today" : `${days}d ago`);
    } else {
      setStat("stat-last-push", "—");
    }

    const languages = new Set(repos.map(r => r.language).filter(Boolean));
    setStat("stat-languages", languages.size || "—");
  } catch (e) {
    setStat("stat-last-push", "offline", true);
    setStat("stat-languages", "offline", true);
  }
}

// ---------- live evidence (per-card latest commit + CI status) ----------

const EVIDENCE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min, keeps repeat views within a session off the 60 req/hr unauthenticated quota

function evidenceCacheGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > EVIDENCE_CACHE_TTL_MS) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function evidenceCacheSet(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    // sessionStorage unavailable (private mode / quota) — fine, just skip caching
  }
}

async function fetchJSONCached(url, cacheKey) {
  const cached = evidenceCacheGet(cacheKey);
  if (cached) return cached;
  const data = await fetchJSON(url);
  evidenceCacheSet(cacheKey, data);
  return data;
}

function timeAgo(isoDate) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function buildCardMeta(card) {
  const meta = document.createElement("div");
  meta.className = "card-meta";

  const commitEl = document.createElement("a");
  commitEl.className = "card-meta-commit loading";
  commitEl.textContent = "⏱ ···";

  const ciEl = document.createElement("a");
  ciEl.className = "card-meta-ci loading";
  ciEl.textContent = "○ ···";

  meta.append(commitEl, ciEl);

  const link = card.querySelector(".card-link");
  if (link) card.insertBefore(meta, link);
  else card.appendChild(meta);

  return { commitEl, ciEl };
}

function setEvidenceLink(el, href) {
  if (href) {
    el.href = href;
    el.target = "_blank";
    el.rel = "noopener";
  } else {
    el.removeAttribute("href");
  }
}

async function loadCardCommit(repo, commitEl) {
  try {
    const commits = await fetchJSONCached(
      `https://api.github.com/repos/${repo}/commits?per_page=1`,
      `gh_evidence:${repo}:commit`
    );
    const commit = commits[0];
    if (!commit) throw new Error("no commits returned");
    const date = commit.commit?.committer?.date || commit.commit?.author?.date;
    commitEl.textContent = `⏱ ${commit.sha.slice(0, 7)} · ${timeAgo(date)}`;
    setEvidenceLink(commitEl, commit.html_url);
    commitEl.classList.remove("loading");
  } catch (e) {
    commitEl.textContent = "⏱ unavailable";
    setEvidenceLink(commitEl, null);
    commitEl.classList.remove("loading");
    commitEl.classList.add("err");
  }
}

async function loadCardCI(repo, ciEl) {
  try {
    const data = await fetchJSONCached(
      `https://api.github.com/repos/${repo}/actions/runs?per_page=1`,
      `gh_evidence:${repo}:ci`
    );
    const run = data.workflow_runs && data.workflow_runs[0];
    ciEl.classList.remove("loading");
    if (run && run.conclusion === "success") {
      ciEl.textContent = "● CI passing";
      ciEl.className = "card-meta-ci ci-pass";
      setEvidenceLink(ciEl, run.html_url);
    } else if (run && run.conclusion === "failure") {
      ciEl.textContent = "● CI failing";
      ciEl.className = "card-meta-ci ci-fail";
      setEvidenceLink(ciEl, run.html_url);
    } else {
      // A real, successful response with zero runs (or a run whose conclusion
      // is still null/in_progress) — GitHub returns 200 here, not an error, so
      // this is a genuine "no CI runs" state, not a fetch failure.
      ciEl.textContent = "○ no CI runs";
      ciEl.className = "card-meta-ci ci-neutral";
      setEvidenceLink(ciEl, null);
    }
  } catch (e) {
    // An actual fetch failure (rate limit, network, repo renamed/private) —
    // fail closed and say so rather than hiding it or guessing.
    ciEl.textContent = "○ unavailable";
    ciEl.className = "card-meta-ci err";
    setEvidenceLink(ciEl, null);
  }
}

function loadCardEvidence() {
  document.querySelectorAll("[data-repo]").forEach(card => {
    const repo = card.dataset.repo;
    const { commitEl, ciEl } = buildCardMeta(card);
    Promise.all([loadCardCommit(repo, commitEl), loadCardCI(repo, ciEl)]);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadGithubStats();
  loadCardEvidence();

  // year in footer
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  // mobile nav toggle
  const menuBtn = document.getElementById("rail-menu-btn");
  const railNav = document.getElementById("rail-nav");
  if (menuBtn && railNav) {
    menuBtn.addEventListener("click", () => {
      const isOpen = railNav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(isOpen));
    });
    railNav.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        railNav.classList.remove("open");
        menuBtn.setAttribute("aria-expanded", "false");
      });
    });
  }

  // filter buttons for systems grid
  const filterButtons = document.querySelectorAll(".filter-btn");
  const cards = document.querySelectorAll(".grid .card");
  filterButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      filterButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const filter = btn.dataset.filter;
      cards.forEach(card => {
        const show = filter === "all" || card.dataset.category === filter;
        card.style.display = show ? "" : "none";
      });
    });
  });
});
