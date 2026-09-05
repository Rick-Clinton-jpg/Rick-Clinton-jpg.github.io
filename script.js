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

document.addEventListener("DOMContentLoaded", () => {
  loadGithubStats();

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
