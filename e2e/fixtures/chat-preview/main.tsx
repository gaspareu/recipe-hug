import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import Home from '@/pages/Home';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <MemoryRouter><TooltipProvider><Home /></TooltipProvider></MemoryRouter>,
);
