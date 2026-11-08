import { describe, it, expect } from 'vitest';
import { cookidooErrorMessage } from './cookidoo-messages';
describe('délai Cookidoo', () => {
  const now = Date.parse('2026-10-25T10:00:00Z');
  it('distingue les quotas journaliers des quotas courts', () => {
    expect(cookidooErrorMessage('preparation_rate_limited', '2026-10-26T09:00:00Z', now)).toContain('23 h 0 min');
    expect(cookidooErrorMessage('preparation_rate_limited', '2026-10-25T10:01:15Z', now)).toContain('1 min 15 s');
  });
  it('ne fabrique aucun délai lorsque le serveur ne le fournit pas', () => {
    expect(cookidooErrorMessage('preparation_rate_limited', 'invalide', now)).toContain('Réessayez plus tard');
  });
});
