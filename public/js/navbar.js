document.addEventListener("DOMContentLoaded", function () {
  const navbar = document.getElementById("mainNavbar");

  if (!navbar) {
    return;
  }

  function updateNavbar() {
    if (window.scrollY > 50) {
      navbar.classList.add("scrolled");
    } else {
      navbar.classList.remove("scrolled");
    }
  }

  window.addEventListener("scroll", updateNavbar);

  // Run once when the page initially loads
  updateNavbar();
});