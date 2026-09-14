/* 语言切换：页面右上角的 select（默认英文 index.html）。
   选择后直接跳到对应语言的静态页，不做自动重定向，行为可预期。 */
(function () {
  var sel = document.getElementById('lang');
  if (!sel) return;
  sel.addEventListener('change', function () {
    var current = location.pathname.split('/').pop() || 'index.html';
    if (sel.value && sel.value !== current) location.href = sel.value;
  });
})();

/* 首屏截图轮播：默认自动播放，鼠标悬停 / 键盘聚焦 / 切到后台标签页时暂停。
   支持左右箭头、圆点跳转、键盘 ← →；系统开启「减弱动态效果」时不自动播放。 */
(function () {
  var root = document.querySelector('.carousel');
  if (!root) return;

  var track = root.querySelector('.car-track');
  var slides = Array.prototype.slice.call(root.querySelectorAll('.slide'));
  var dots = Array.prototype.slice.call(root.querySelectorAll('.car-dot'));
  var prev = root.querySelector('.car-prev');
  var next = root.querySelector('.car-next');
  if (slides.length < 2 || !track) return;

  var interval = parseInt(root.getAttribute('data-interval'), 10) || 5000;
  var reduce =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var idx = Math.max(0, slides.findIndex(function (s) { return s.classList.contains('active'); }));
  var timer = null;

  function render() {
    track.style.transform = 'translateX(' + -100 * idx + '%)';
    slides.forEach(function (slide, i) {
      var on = i === idx;
      slide.classList.toggle('active', on);
      slide.setAttribute('aria-hidden', on ? 'false' : 'true');
      var link = slide.querySelector('a');
      if (link) {
        if (on) link.removeAttribute('tabindex');
        else link.setAttribute('tabindex', '-1');
      }
    });
    dots.forEach(function (dot, i) {
      var on = i === idx;
      dot.classList.toggle('active', on);
      if (on) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    // 懒加载的图在滑进来之前不会请求；切到它时立刻升级，避免出现空白帧
    var img = slides[idx].querySelector('img');
    if (img && !img.complete && img.getAttribute('loading') === 'lazy') {
      img.setAttribute('loading', 'eager');
    }
  }

  function go(i) {
    idx = (i + slides.length) % slides.length;
    render();
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    if (reduce || timer || document.hidden) return;
    timer = setInterval(function () { go(idx + 1); }, interval);
  }

  function jump(i) {
    go(i);
    stop();
    start();
  }

  if (prev) prev.addEventListener('click', function () { jump(idx - 1); });
  if (next) next.addEventListener('click', function () { jump(idx + 1); });
  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () { jump(i); });
  });

  root.addEventListener('mouseenter', stop);
  root.addEventListener('mouseleave', start);
  root.addEventListener('focusin', stop);
  root.addEventListener('focusout', start);
  root.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { jump(idx - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { jump(idx + 1); e.preventDefault(); }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else start();
  });

  render();
  start();
})();
