const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#main-nav');

if (menuButton && navigation) {
  const mobile = window.matchMedia('(max-width: 47.99rem)');

  function closeMenu(returnFocus = false) {
    menuButton.setAttribute('aria-expanded', 'false');
    navigation.classList.remove('is-open');
    if (returnFocus) menuButton.focus();
  }

  // Without JavaScript, navigation stays visible at every screen size.
  menuButton.hidden = false;
  navigation.classList.add('is-enhanced');

  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    navigation.classList.toggle('is-open', open);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      closeMenu(true);
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.header-inner')) closeMenu();
  });

  navigation.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });

  document.addEventListener('focusin', (event) => {
    if (!event.target.closest('.header-inner')) closeMenu();
  });

  mobile.addEventListener('change', () => {
    const focusWillBeHidden = mobile.matches && navigation.contains(document.activeElement);
    closeMenu(focusWillBeHidden);
  });
}
