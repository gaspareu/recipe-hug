import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const railSpy = vi.fn();

vi.mock('@/hooks/useHomeChat', () => ({
  useHomeChat: () => ({
    messages: [{ id: 'welcome', role: 'assistant', content: '', timestamp: new Date() }],
    isStreaming: false,
    toolActivity: null,
    isSavingRecipe: false,
    sendMessage: vi.fn(), resetChat: vi.fn(), createProposedRecipe: vi.fn(), regenerateResponse: vi.fn(), stopGeneration: vi.fn(),
    cookingRecipeId: null, cookingServings: undefined, startCooking: vi.fn(), stopCooking: vi.fn(),
  }),
}));
vi.mock('@/hooks/useViewportHeight', () => ({ useViewportHeight: vi.fn() }));
vi.mock('@/components/layout/AppBookmarkRail', () => ({
  AppBookmarkRail: (props: { viewportHeight?: string }) => { railSpy(props); return <div data-testid="bookmark-rail" data-viewport-height={props.viewportHeight} />; },
}));
vi.mock('@/components/chat/ChatInterface', () => ({
  ChatInterface: () => <div data-testid="chat-interface" />,
}));
vi.mock('@/components/InstallBanner', () => ({ InstallBanner: () => null }));
vi.mock('@/components/cooking/CookingModeContainer', () => ({ CookingModeContainer: () => null }));
vi.mock('framer-motion', () => ({ motion: { div: ({ children }: { children: React.ReactNode }) => <div>{children}</div> } }));

import Home from './Home';

describe('Home', () => {
  it('utilise le viewport visuel pour un rail à largeur fixe', () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByTestId('bookmark-rail')).toHaveAttribute('data-viewport-height', 'app');
    expect(railSpy).toHaveBeenCalled();
  });
});
