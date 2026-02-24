(function(){
  const body = document.body;

  function ensureStage(){
    let stage = document.querySelector('.parallax-stage');
    if(stage) return stage;
    stage = document.createElement('div');
    stage.className = 'parallax-stage';
    stage.innerHTML = `
      <div class="parallax-layer-bg" data-depth="0.06"></div>
      <div class="parallax-layer-grid" data-depth="0.12"></div>
      <div class="parallax-layer-glow" data-depth="0.18"></div>
      <div class="parallax-layer-stars" data-depth="0.09"></div>
      <div class="parallax-layer-orbs" data-depth="0.24"></div>
      <div class="parallax-layer-noise" data-depth="0.04"></div>
    `;
    body.appendChild(stage);
    return stage;
  }

  function initParallaxEngine(){
    const stage = ensureStage();
    const layers = stage.querySelectorAll('[data-depth]');
    const sections = document.querySelectorAll('main section');
    const state = { mx:0, my:0, sy:0 };

    const draw = () => {
      const isDark = body.classList.contains('theme-dark');
      if(!isDark){
        layers.forEach(l => l.style.transform = 'translate3d(0,0,0)');
        sections.forEach(s => {
          s.style.setProperty('--parallax-y','0px');
          s.style.setProperty('--parallax-r','0deg');
        });
        return;
      }

      layers.forEach(layer => {
        const d = parseFloat(layer.dataset.depth || '0.1');
        const tx = state.mx * d * 30;
        const ty = (state.sy * d * 0.22) + (state.my * d * 24);
        layer.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      });

      sections.forEach((sec, idx) => {
        const rect = sec.getBoundingClientRect();
        const p = (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
        const depth = ((idx % 3) + 1) * 18;
        sec.style.setProperty('--parallax-y', `${(p - 0.5) * depth}px`);
        sec.style.setProperty('--parallax-r', `${(p - 0.5) * 0.7}deg`);
      });
    };

    let raf = null;
    const tick = () => {
      if(raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };

    window.addEventListener('scroll', () => { state.sy = window.scrollY || 0; tick(); }, {passive:true});
    window.addEventListener('resize', tick);
    window.addEventListener('mousemove', (e) => {
      state.mx = (e.clientX / window.innerWidth) - 0.5;
      state.my = (e.clientY / window.innerHeight) - 0.5;
      tick();
    });

    tick();
  }

  window.addEventListener('DOMContentLoaded', initParallaxEngine);
})();
