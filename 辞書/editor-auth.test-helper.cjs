'use strict';
const OWNER = {
  id: 337917858,
  login: 'velvet-orbit-731',
  type: 'User',
};
async function mockOwner(page) {
  await page.route('https://api.github.com/**', (route) => {
    const req = route.request(),
      url = req.url();
    if (req.method() !== 'GET') throw Error('Unexpected write in UI test');
    const data =
      url === 'https://api.github.com/user'
        ? OWNER
        : url === 'https://api.github.com/repos/velvet-orbit-731/lafca-dictionary'
          ? {
              owner: OWNER,
              permissions: {
                push: true,
              },
            }
          : null;
    if (!data) throw Error('Unexpected GitHub request: ' + url);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });
}
async function login(page) {
  if (!(await page.locator('#owner-login').isVisible())) await page.click('#edit-mode');
  await page.fill('#github-token', 'test-token');
  await page.click('#owner-login-submit');
  await page.waitForFunction(() => !document.querySelector('.editor-toolbar').hidden);
}
module.exports = {
  mockOwner,
  login,
};
