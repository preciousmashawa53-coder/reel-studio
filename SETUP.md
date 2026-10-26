# Setting up Reel Studio

You'll set up three free accounts, then connect them. Allow about an hour the first time. You only pay fal.ai for the videos you make.

## 1. fal.ai: the video AI

1. Go to **fal.ai** and sign up (Google sign-in is easiest).
2. Open **Billing**, add your **Mastercard**, and buy **US$10** of credits. That's enough for about 20 Standard test videos.
3. Open **Keys** (API Keys), click **Add key**, name it `reel-studio`, and **copy the key**. Keep it private, like a password: anyone with it can spend your credits.

## 2. Cloudflare: your server (free)

1. Go to **dash.cloudflare.com** and sign up.
2. In the left menu, open **Storage & Databases → KV**, click **Create**, and name it `reel-studio`.
3. Open **Compute (Workers) → Workers & Pages → Create → Create Worker**. Name it `reel-studio` and click **Deploy**.
4. Click **Edit code**. Delete everything in the editor, paste the whole contents of `worker/worker.js` (open it with TextEdit), and click **Deploy**.
5. Go back to the worker and open **Settings → Bindings → Add → KV namespace**:
   - Variable name: `STUDIO`
   - KV namespace: `reel-studio`
6. Open **Settings → Variables and Secrets → Add**, and add three:

   | Type | Name | Value |
   | --- | --- | --- |
   | Secret | `FAL_KEY` | your fal.ai key |
   | Secret | `ADMIN_KEY` | a long password only you know (at least 12 characters) |
   | Text | `ALLOWED_ORIGIN` | `https://preciousmashawa53-coder.github.io` |

7. Click **Deploy** if asked. Copy your worker's address. It looks like `https://reel-studio.your-name.workers.dev`.
8. Check it works: open that address with `/api/models` on the end in your browser. You should see a list with "Standard" and "Premium".

## 3. GitHub: the website

1. Extract the zip, open the folder, and press **Command + Shift + .** to show hidden files.
2. Create a public repository called **reel-studio** (README off), and upload everything inside the folder.
3. If `.github/workflows/deploy.yml` didn't upload, go to **Actions → set up a workflow yourself**, name it `deploy.yml`, paste the file's contents, and commit.
4. **Settings → Pages → Source: GitHub Actions.**

## 4. Connect the website to your server

1. On GitHub, open `web/public/config.js` and click the **pencil** to edit.
2. Put your worker address in `apiUrl`:
   ```js
   apiUrl: 'https://reel-studio.your-name.workers.dev',
   ```
3. Commit. GitHub rebuilds the site in about 2 minutes.
4. Your studio is live at **https://preciousmashawa53-coder.github.io/reel-studio/**

## 5. Make your first video

1. Open the studio with `?admin` on the end:
   `https://preciousmashawa53-coder.github.io/reel-studio/?admin`
2. Enter your **ADMIN_KEY**, then create a code for yourself with **50 credits**.
3. Go back to the studio, sign in with that code, and make a **Standard, 5 sec, Silent** video (costs you about US$0.42).

## Selling credits

- A customer pays you (EcoCash, InnBucks or bank transfer).
- Open the admin page, create a code with their credits, and tap **Copy message**. It contains their code and instructions. Send it on WhatsApp.
- When they want more, find them in the **Customers** list and add credits.

Suggested packs (1 credit = US$0.10):

| Pack | Credits | Price | Standard 5-sec videos |
| --- | --- | --- | --- |
| Starter | 50 | US$5 | 5 |
| Creator | 120 | US$10 | 12 |
| Business | 300 | US$22 | 30 |

Keep an eye on your fal.ai balance and top it up before it runs out. Customers' videos use **your** fal.ai credits.

## If something goes wrong

- **"Could not reach the server":** check `apiUrl` in `config.js`, and that `ALLOWED_ORIGIN` is exactly `https://preciousmashawa53-coder.github.io` (no slash at the end).
- **"The video service did not accept the request":** check your fal.ai balance and that `FAL_KEY` is correct. In Cloudflare, open the worker's **Logs** to see the exact error.
- **A model stops working:** fal.ai sometimes renames or retires models. Find the new name on fal.ai, update `endpoint` in `worker.js`, and paste the file into Cloudflare again.
