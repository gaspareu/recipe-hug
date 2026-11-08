import { fireEvent, render, screen } from '@testing-library/react';
import { useSwipeNavigation } from './useSwipeNavigation';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

function Surface() {
  const { handlers, style } = useSwipeNavigation({ targetRoute: '/dashboard' });
  return <div {...handlers} style={style}>
    <textarea aria-label="Brouillon" />
    <div contentEditable suppressContentEditableWarning><span>Texte éditable</span></div>
    <div data-no-swipe-nav><button>Action du composeur</button></div>
    <p>Historique</p>
  </div>;
}

function swipe(target: HTMLElement) {
  fireEvent.touchStart(target, { touches: [{ clientX: 250, clientY: 100 }] });
  fireEvent.touchMove(target, { touches: [{ clientX: 50, clientY: 105 }] });
  fireEvent.touchEnd(target);
}

beforeEach(() => navigate.mockClear());

it('laisse le déplacement du curseur dans le champ sans changer de page', () => {
  render(<Surface />);
  swipe(screen.getByRole('textbox', { name: 'Brouillon' }));
  expect(navigate).not.toHaveBeenCalled();
});

it('protège aussi les descendants éditables et les actions du composeur', () => {
  render(<Surface />);
  swipe(screen.getByText('Texte éditable'));
  swipe(screen.getByRole('button', { name: 'Action du composeur' }));
  expect(navigate).not.toHaveBeenCalled();
});

it('conserve le geste de navigation en dehors des zones de saisie', () => {
  render(<Surface />);
  swipe(screen.getByText('Historique'));
  expect(navigate).toHaveBeenCalledWith('/dashboard');
});
