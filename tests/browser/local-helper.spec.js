import { test, expect } from '@playwright/test';

test('the helper rejects calls from another origin and refuses ungranted file references', async ({ request }) => {
  const denied = await request.post('/api/local-files/status', { headers: { Origin: 'https://example.com', 'X-ScriptForge-Local': '1' }, data: {} });
  expect(denied.status()).toBe(403);
  const badGrant = await request.post('/api/local-files/read', { headers: { Origin: 'http://localhost:4173', 'X-ScriptForge-Local': '1' }, data: { handle: { token: 'ungranted', name: 'outside.fountain', kind: 'file' } } });
  expect(badGrant.status()).toBe(400); expect((await badGrant.json()).error.name).toBe('FilePermissionError');
});
