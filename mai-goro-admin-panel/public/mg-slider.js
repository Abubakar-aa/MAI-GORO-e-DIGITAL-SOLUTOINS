/* ═══════════════════════════════════════════════════════════
   MAI GORO — Live Opportunities Slider
   Pulls slides from Supabase and renders them into the page.
   Usage on your homepage (inside the "Current Opportunities" section):
     <div id="mg-slides"></div>
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="js/slider-config.js"></script>
     <script src="js/mg-slider.js"></script>
   ═══════════════════════════════════════════════════════════ */

(async function () {
  const container = document.getElementById('mg-slides');
  if (!container) return;

  // Inject minimal styles (scoped with mg- prefix so they never clash)
  const css = `
    #mg-slides{position:relative}
    #mg-slides .mg-frame{border-radius:14px;overflow:hidden;background:#0b1440;
      box-shadow:0 8px 30px rgba(21,42,99,.18)}
    #mg-slides img{width:100%;display:block;aspect-ratio:16/9;object-fit:cover}
    #mg-slides .mg-caption{background:#152a63;color:#fff;text-align:center;
      padding:12px 16px;font-family:inherit;font-size:15px;font-weight:500}
    #mg-slides .mg-nav{display:flex;align-items:center;justify-content:center;gap:18px;margin-top:14px}
    #mg-slides .mg-arrow{width:38px;height:38px;border-radius:50%;border:1px solid #d4dcf0;
      background:#fff;color:#152a63;font-size:18px;cursor:pointer;transition:all .2s;line-height:1}
    #mg-slides .mg-arrow:hover{background:#2563eb;color:#fff;border-color:#2563eb}
    #mg-slides .mg-count{font-size:13px;color:#6b7280;font-weight:500}
    #mg-slides .mg-loading{text-align:center;color:#6b7280;padding:40px 0;font-size:14px}`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  container.innerHTML = '<p class="mg-loading">Loading current opportunities…</p>';

  try {
    const { data: slides, error } = await sb
      .from('slides').select('*').order('created_at', { ascending: false });

    if (error) throw error;
    if (!slides || !slides.length) {
      container.innerHTML = '<p class="mg-loading">New opportunities will be announced here soon.</p>';
      return;
    }

    let i = 0;
    const total = slides.length;

    function render() {
      const s = slides[i];
      const img = s.link
        ? `<a href="${s.link}" target="_blank" rel="noopener"><img src="${s.image_url}" alt="${escapeAttr(s.title)}"></a>`
        : `<img src="${s.image_url}" alt="${escapeAttr(s.title)}">`;
      container.innerHTML = `
        <div class="mg-frame">${img}<div class="mg-caption">${escapeHtml(s.title)}</div></div>
        <div class="mg-nav">
          <button class="mg-arrow" id="mgPrev" aria-label="Previous">‹</button>
          <span class="mg-count">${i + 1} / ${total}</span>
          <button class="mg-arrow" id="mgNext" aria-label="Next">›</button>
        </div>`;
      document.getElementById('mgPrev').onclick = () => { i = (i - 1 + total) % total; render(); };
      document.getElementById('mgNext').onclick = () => { i = (i + 1) % total; render(); };
    }

    render();
    // Auto-advance every 6 seconds (pauses stay simple: resets on manual click)
    setInterval(() => { i = (i + 1) % total; render(); }, 6000);
  } catch (e) {
    container.innerHTML = '<p class="mg-loading">Slides temporarily unavailable.</p>';
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str).replace(/'/g, '&#39;'); }
})();
