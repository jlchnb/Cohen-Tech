import './style.css';
import { initHero, initPressFeel, initReveals } from './animations';
import { initBooking } from './booking';

// Si algo falla en las animaciones, el contenido nunca debe quedar oculto.
try {
  initHero();
  initReveals();
  initPressFeel();
} catch (error) {
  console.error(error);
  document.documentElement.classList.remove('motion-ok');
}

initBooking();
