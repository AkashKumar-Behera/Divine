const { chromium } = require('playwright');

(async () => {
  // Persistent browser context (session save karega)
  const context = await chromium.launchPersistentContext('./user-data', {
    headless: false, // Browser visible rahega
    viewport: null   // Full screen open hoga
  });

  const page = await context.newPage();

  // Website open karo
  await page.goto('https://deeragames.in/login');

  console.log("🌐 Login page opened");

  // Agar already logged in ho to skip kar sakte ho
  // Example: agar logout button mil jaye to login mat karo
  try {
    await page.waitForSelector('text=Logout', { timeout: 5000 });
    console.log("✅ Already logged in. Session reused.");
    return;
  } catch {
    console.log("🔐 Not logged in. Performing login...");
  }

  // Email fill karo (selector inspect karke adjust karo agar needed ho)
  await page.fill('input[type="email"]', 'mayurs1112236@gmail.com');

  // Password fill karo
  await page.fill('input[type="password"]', 'Mayur@1999');

  // Login button click karo
  await page.locator('button.register-btn.mt-0', { hasText: 'Login' }).click();

  // Login ke baad kisi element ka wait karo jo login ke baad dikhta ho
  await page.waitForLoadState('networkidle');

  console.log("🎉 Login completed. Session saved.");

})();