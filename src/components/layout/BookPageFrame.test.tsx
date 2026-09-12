import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookPageFrame } from './BookPageFrame';

describe('BookPageFrame', () => {
  it('compose une surface éditoriale sans monter une seconde navigation', () => {
    render(<BookPageFrame><p>Page</p></BookPageFrame>);
    expect(screen.getByText('Page').closest('section')).toHaveClass('book-surface');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
