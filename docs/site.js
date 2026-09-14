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
