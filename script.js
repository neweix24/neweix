const menuToggle = document.getElementById('menuToggle');
const nav = document.querySelector('nav');
if (menuToggle && nav) {
  menuToggle.addEventListener('click', () => nav.classList.toggle('open'));
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => nav.classList.remove('open')));
}
const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();
