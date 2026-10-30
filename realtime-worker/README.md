# Arcade realtime server

The arcade's online server: a Cloudflare Worker with one Durable Object per channel topic.
It does what the games used from Supabase Realtime (broadcast messages and presence) and
stores nothing. The browser side is `../rt.js`.

Deploy (from this folder, logged in to the owner's Cloudflare account):

    npm install -D wrangler
    npx wrangler deploy

Live at `wss://arcade-realtime.arcade-realtime.workers.dev/ws?topic=<channel>&key=<presence key>`.
