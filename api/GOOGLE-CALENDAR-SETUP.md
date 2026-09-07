# Google Calendar — one-time setup

You do these once. After that, meetings booked on a lead post automatically to
**admin@getproytech.com**'s calendar.

There are 3 parts: **A)** a Supabase table, **B)** a Google OAuth app, **C)** Vercel env vars.
Do them in order, then deploy the code.

---

## A. Supabase — add the token table (1 min)

Supabase dashboard → your project (`mqpswqiqhhitdcdugqsp`) → **SQL Editor** → run:

```sql
create table if not exists secrets (id text primary key, data jsonb);
alter table secrets enable row level security;
-- no policies on purpose: the browser key can't touch it; only the server (service role) can.
```

Then grab your **service-role key**: Supabase → **Settings → API** → copy the
`service_role` secret (NOT the publishable one). You'll paste it into Vercel in step C.

---

## B. Google Cloud — make an OAuth app (~10 min)

1. Go to **console.cloud.google.com**, signed in as **admin@getproytech.com**.
2. Top bar → **Create Project** → name it `ProyTech CRM` → Create, then select it.
3. Left menu → **APIs & Services → Library** → search **Google Calendar API** → **Enable**.
4. **APIs & Services → OAuth consent screen**:
   - User type: **Internal** ← important. This means no Google review and the connection never expires. (Internal is available because getproytech.com is a Workspace.)
   - App name: `ProyTech CRM`, support email: your address, developer email: your address → Save.
5. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `ProyTech CRM Web`
   - **Authorized redirect URIs → Add URI:**
     ```
     https://proytech-crm.vercel.app/api/google-callback
     ```
   - Create. Copy the **Client ID** and **Client secret** it shows you.

---

## C. Vercel — add env vars (2 min)

Vercel → **proytech-crm** → **Settings → Environment Variables**. Add these six:

| Key | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | *(from step B5)* |
| `GOOGLE_CLIENT_SECRET` | *(from step B5)* |
| `GOOGLE_REDIRECT_URI` | `https://proytech-crm.vercel.app/api/google-callback` |
| `APP_URL` | `https://proytech-crm.vercel.app` |
| `SUPABASE_URL` | `https://mqpswqiqhhitdcdugqsp.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | *(the service_role secret from step A)* |

> The service-role key is powerful — it only lives here on the server, never in the app.

---

## D. Deploy + connect

1. Upload the new files (see the chat message for the file list) and let Vercel build.
2. Open the CRM → **Settings → Google Calendar → Connect Google Calendar**.
3. Sign in as **admin@getproytech.com**, approve → you land back on the CRM showing
   **Connected — admin@getproytech.com**.
4. Open any lead → **Meetings** → book one. It appears on the lead and on the calendar.

### If "Connect" errors
- `no_refresh_token`: you approved before; just click Connect again (it forces a fresh grant).
- Redirect mismatch: the URI in step B5 must match `GOOGLE_REDIRECT_URI` exactly (no trailing slash).
- Stuck "not connected" when booking: re-check the six env vars, then Redeploy (env changes need a fresh build).
