const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.addEventListener("DOMContentLoaded", () => {

  // ---------- shard tabs ----------
  const tabs = document.querySelectorAll(".shard-tab");
  const panels = document.querySelectorAll(".shard-panel");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
      panels.forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      const target = document.getElementById(tab.dataset.target);
      if (target) target.classList.add("active");
    });
  });

  // ---------- boot type-in headline ----------
  const headline = document.getElementById("hero-headline");
  const caret = document.getElementById("boot-cursor");
  if (headline && !reduceMotion) {
    const full = headline.dataset.full;
    const accentLen = "DETERMINISTIC".length;
    headline.innerHTML = '<span class="accent"></span><span id="rest"></span><span id="boot-cursor"></span>';
    const accentEl = headline.querySelector(".accent");
    const restEl = headline.querySelector("#rest");
    const newCaret = headline.querySelector("#boot-cursor");
    const totalMs = 600; // within the 400-800ms boot window
    const step = totalMs / full.length;
    let i = 0;
    const tick = () => {
      if (i >= full.length) { newCaret.style.animationPlayState = "running"; return; }
      i++;
      const chunk = full.slice(0, i);
      if (i <= accentLen) {
        accentEl.textContent = chunk;
      } else {
        accentEl.textContent = full.slice(0, accentLen);
        restEl.textContent = chunk.slice(accentLen);
      }
      setTimeout(tick, step);
    };
    tick();
  } else if (headline) {
    // reduced-motion: render final state immediately, no animation
    headline.innerHTML = '<span class="accent">DETERMINISTIC</span> CHECKS FOR PROBABILISTIC SYSTEMS';
  }

  // ---------- cursor bloom ----------
  const bloom = document.getElementById("cursor-bloom");
  if (bloom && !reduceMotion && window.matchMedia("(hover: hover)").matches) {
    window.addEventListener("pointermove", (e) => {
      bloom.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    });
  } else if (bloom) {
    bloom.style.display = "none";
  }

  // ---------- card tilt toward cursor ----------
  if (!reduceMotion && window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".card").forEach(card => {
      card.addEventListener("mousemove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        const tiltX = (-py * 6).toFixed(2);
        const tiltY = (px * 6).toFixed(2);
        card.style.transform = `translateY(-4px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
      });
      card.addEventListener("mouseleave", () => {
        card.style.transform = "";
      });
    });
  }
});
