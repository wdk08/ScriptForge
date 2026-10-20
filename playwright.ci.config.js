import config from './playwright.config.js';
// GitHub-hosted Linux uses Playwright's installed Chromium, not a system Chrome channel.
export default {...config,use:{...config.use,channel:undefined,browserName:'chromium'}};
