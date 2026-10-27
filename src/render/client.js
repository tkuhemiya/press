// Press walkthrough and prose references. Plain script, inlined into every page.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVG = 'http://www.w3.org/2000/svg';
  const figures = new Map();

  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  for (const fig of document.querySelectorAll('.pr-figure[data-steps]')) figures.set(fig.id, walkthrough(fig));

  function walkthrough(fig) {
    const steps = JSON.parse(fig.querySelector('.pr-steps').textContent);
    const svg = fig.querySelector('.pr-svg');
    const bar = fig.querySelector('.pr-walk');
    const count = bar.querySelector('.pr-count');
    const caption = bar.querySelector('.pr-caption');
    const track = bar.querySelector('.pr-track');
    const prev = bar.querySelector('[data-act="prev"]');
    const next = bar.querySelector('[data-act="next"]');
    const ticks = steps.map(() => track.appendChild(document.createElement('i')));
    const intro = caption.querySelector('span').innerHTML;
    let at = 0;
    let motion = 0;
    bar.hidden = false;

    const nodes = (id) => svg.querySelectorAll(`.pr-node[data-node="${CSS.escape(id)}"]`);
    const edgeParts = (i) => svg.querySelectorAll(`.pr-edge[data-edge="${i}"], .pr-edge-label[data-edge="${i}"]`);
    const mark = (step, cls) => {
      if (step.edge !== undefined) {
        edgeParts(step.edge).forEach((el) => el.classList.add(cls));
        nodes(step.from).forEach((el) => el.classList.add(cls));
        nodes(step.to).forEach((el) => el.classList.add(cls));
      } else nodes(step.node).forEach((el) => el.classList.add(cls));
    };

    function setCaption(html) {
      const old = caption.querySelector('span');
      const fresh = document.createElement('span');
      fresh.innerHTML = html;
      if (reduced || !old) {
        caption.replaceChildren(fresh);
        return;
      }
      old.classList.add('is-leaving');
      setTimeout(() => {
        fresh.classList.add('is-entering');
        caption.replaceChildren(fresh);
        requestAnimationFrame(() => requestAnimationFrame(() => fresh.classList.remove('is-entering')));
      }, 160);
    }

    function go(i, { fromHash = false } = {}) {
      i = Math.max(0, Math.min(steps.length, i));
      const forward = i === at + 1;
      at = i;
      cancelAnimationFrame(motion);
      svg.querySelectorAll('.pr-pulse, .pr-pulse-halo').forEach((el) => el.remove());
      svg.querySelectorAll('.is-current, .is-visited, .is-arrived').forEach((el) => el.classList.remove('is-current', 'is-visited', 'is-arrived'));
      fig.classList.toggle('pr-walking', i > 0);
      ticks.forEach((t, k) => {
        t.classList.toggle('is-done', k < i - 1);
        t.classList.toggle('is-current', k === i - 1);
      });
      prev.disabled = i === 0;
      next.disabled = i === steps.length;
      next.classList.toggle('pr-primary', i === 0);
      next.innerHTML = i === 0 ? 'Walk through' : '<svg viewBox="0 0 16 16"><path d="M6 3.5 10.5 8 6 12.5"/></svg>';
      next.setAttribute('aria-label', i === 0 ? 'Start the walkthrough' : 'Next step');
      count.textContent = i === 0 ? '' : `${i} / ${steps.length}`;
      if (!fromHash && fig.dataset.anchor) history.replaceState(null, '', i === 0 ? location.pathname + location.search : `#${fig.dataset.anchor}/${i}`);
      if (i === 0) {
        setCaption(intro);
        return;
      }
      for (let k = 0; k < i - 1; k++) mark(steps[k], 'is-visited');
      const step = steps[i - 1];
      mark(step, 'is-current');
      setCaption(step.html);
      if (step.edge !== undefined) travel(step, forward);
      else nodes(step.node).forEach((el) => el.classList.add('is-arrived'));
    }

    // A dot runs along the current edge, so the eye follows the transition rather than finding it.
    function travel(step, forward) {
      const line = svg.querySelector(`.pr-edge[data-edge="${step.edge}"] .pr-line`);
      const arrive = () => nodes(step.to).forEach((el) => el.classList.add('is-arrived'));
      if (!line || reduced || !forward) return arrive();
      const len = line.getTotalLength();
      const halo = document.createElementNS(SVG, 'circle');
      const dot = document.createElementNS(SVG, 'circle');
      halo.setAttribute('class', 'pr-pulse-halo');
      dot.setAttribute('class', 'pr-pulse');
      halo.setAttribute('r', '9');
      dot.setAttribute('r', '4');
      line.parentNode.append(halo, dot);
      const duration = Math.min(900, 380 + len * 1.6);
      const start = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const p = line.getPointAtLength(easeInOut(t) * len);
        for (const c of [halo, dot]) {
          c.setAttribute('cx', p.x);
          c.setAttribute('cy', p.y);
        }
        const fade = t > 0.85 ? (1 - t) / 0.15 : Math.min(1, t / 0.1);
        dot.style.opacity = fade;
        halo.style.opacity = 0.18 * fade;
        if (t < 1) motion = requestAnimationFrame(frame);
        else {
          halo.remove();
          dot.remove();
          arrive();
        }
      };
      motion = requestAnimationFrame(frame);
    }

    prev.addEventListener('click', () => go(at - 1));
    next.addEventListener('click', () => {
      go(at + 1);
      fig.focus({ preventScroll: true });
    });
    fig.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' || ev.key === 'j') go(at + 1);
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' || ev.key === 'k') go(at - 1);
      else if (ev.key === 'Escape') go(0);
      else return;
      ev.preventDefault();
    });
    go(0, { fromHash: true });
    return { go };
  }

  // Prose references: hovering one points at its node.
  for (const ref of document.querySelectorAll('a.pr-ref')) {
    const fig = document.getElementById(ref.dataset.figure);
    if (!fig) continue;
    const targets = () => fig.querySelectorAll(`.pr-node[data-node="${CSS.escape(ref.dataset.node)}"]`);
    const on = () => {
      fig.classList.add('pr-pointing');
      targets().forEach((el) => el.classList.add('is-pointed'));
    };
    const off = () => {
      fig.classList.remove('pr-pointing');
      targets().forEach((el) => el.classList.remove('is-pointed'));
    };
    ref.addEventListener('mouseenter', on);
    ref.addEventListener('mouseleave', off);
    ref.addEventListener('focus', on);
    ref.addEventListener('blur', off);
    ref.addEventListener('click', (ev) => {
      ev.preventDefault();
      const rect = fig.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > innerHeight) fig.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      on();
      setTimeout(off, 1400);
    });
  }

  // Deep links: #order/3 opens step 3 of the diagram with id "order".
  function fromHash() {
    const m = /^#([\w-]+)\/(\d+)$/.exec(location.hash);
    if (!m) return;
    const fig = document.querySelector(`.pr-figure[data-anchor="${CSS.escape(m[1])}"]`);
    const w = fig && figures.get(fig.id);
    if (!w) return;
    fig.scrollIntoView({ block: 'center' });
    w.go(Number(m[2]), { fromHash: true });
  }
  addEventListener('hashchange', fromHash);
  fromHash();
})();
