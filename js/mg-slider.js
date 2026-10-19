(async function () {
  const container = document.getElementById('mg-slides');
  if (!container || typeof sb === 'undefined') return;

  const isConfigured = !SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
    !SUPABASE_ANON_KEY.includes('YOUR-ANON-PUBLIC-KEY');
  if (!isConfigured) {
    container.innerHTML = '<p class="mg-loading">Opportunities will be announced here soon.</p>';
    return;
  }

  const css = `
    #mg-slides{position:relative;max-width:920px;margin:0 auto}
    #mg-slides .mg-frame{border-radius:16px;overflow:hidden;background:#0b1440;box-shadow:0 10px 32px rgba(21,42,99,.18);max-width:920px;margin:0 auto;animation:mgIn .5s ease both}
    #mg-slides img{width:100%;display:block;aspect-ratio:16/9;object-fit:cover;max-height:520px}
    #mg-slides .mg-caption{background:#152a63;color:#fff;text-align:center;padding:14px 18px;font-family:inherit;font-size:16px;font-weight:500}
    #mg-slides .mg-nav{display:flex;align-items:center;justify-content:center;gap:18px;margin-top:14px;animation:mgIn .5s ease .08s both}
    #mg-slides .mg-arrow{width:38px;height:38px;border-radius:50%;border:1px solid #d4dcf0;background:#fff;color:#152a63;font-size:18px;cursor:pointer;line-height:1;transition:background .25s ease,color .25s ease,border-color .25s ease,transform .25s ease}
    #mg-slides .mg-arrow:hover{background:#2563eb;color:#fff;border-color:#2563eb;transform:scale(1.08)}
    #mg-slides .mg-count{font-size:13px;color:#6b7280;font-weight:500}
    #mg-slides .mg-loading{text-align:center;color:#6b7280;padding:40px 0;font-size:14px}
    @keyframes mgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  container.innerHTML = '<p class="mg-loading">Loading current opportunities...</p>';

  try {
    const { data: slides, error } = await sb.from('slides').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    if (!slides || !slides.length) {
      container.innerHTML = '<p class="mg-loading">New opportunities will be announced here soon.</p>';
      return;
    }

    let index = 0;
    function render() {
      const slide = slides[index];
      const image = `<img src="${escapeAttr(slide.image_url)}" alt="${escapeAttr(slide.title)}">`;
      const content = slide.link
        ? `<a href="${escapeAttr(slide.link)}" target="_blank" rel="noopener">${image}</a>`
        : image;
      container.innerHTML = `<div class="mg-frame">${content}<div class="mg-caption">${escapeHtml(slide.title)}</div></div>
        <div class="mg-nav"><button class="mg-arrow" type="button" id="mgPrev" aria-label="Previous">&#8249;</button>
        <span class="mg-count">${index + 1} / ${slides.length}</span>
        <button class="mg-arrow" type="button" id="mgNext" aria-label="Next">&#8250;</button></div>`;
      document.getElementById('mgPrev').onclick = () => { index = (index - 1 + slides.length) % slides.length; render(); };
      document.getElementById('mgNext').onclick = () => { index = (index + 1) % slides.length; render(); };
    }
    render();
    if (slides.length > 1) setInterval(() => { if (document.hidden) return; index = (index + 1) % slides.length; render(); }, 6000);
  } catch (error) {
    container.innerHTML = '<p class="mg-loading">Slides are temporarily unavailable.</p>';
  }

  function escapeHtml(value) {
    return (value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }
  function escapeAttr(value) { return escapeHtml(value); }
})();