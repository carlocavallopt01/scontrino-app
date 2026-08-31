# Incassi

App per la registrazione giornaliera degli incassi di più sedi (palestre e negozi), con accesso via PIN per sede e dashboard per il Titolare. React + Vite, dati su Supabase, installabile come PWA da un semplice link.

## 1. Sviluppo locale

```bash
npm install
cp .env.example .env.local   # poi inserisci URL e anon key del tuo progetto Supabase
npm run dev
```

## 2. Creare il progetto Supabase

1. Vai su [supabase.com](https://supabase.com), crea un account gratuito e un nuovo progetto (scegli una regione vicina, es. Frankfurt).
2. Nel progetto, apri **SQL Editor** → **New query**, incolla tutto il contenuto di [`supabase/schema.sql`](./supabase/schema.sql) e premi **Run**. Questo crea le tabelle (`locations`, `entries`, `settings`), le policy di sicurezza e i dati di partenza (le 5 sedi con i PIN originali, PIN Titolare `9999`).
3. Vai su **Project Settings → API**: copia **Project URL** e la chiave **anon public**.
4. Incollali in `.env.local` (in locale) e più avanti nelle variabili d'ambiente di Vercel (vedi sotto).

Puoi modificare PIN, nomi sedi, loghi e tipi di abbonamento direttamente dall'app (Titolare → Impostazioni) una volta online: non serve più toccare l'SQL dopo il primo avvio.

## 3. Pubblicare su Vercel (accesso via link, PWA)

1. Vai su [vercel.com](https://vercel.com) e accedi con GitHub.
2. **Add New → Project**, seleziona questo repository.
3. Vercel riconosce automaticamente Vite: lascia i comandi di default (`npm run build`, output `dist`).
4. In **Environment Variables** aggiungi:
   - `VITE_SUPABASE_URL` = il Project URL di Supabase
   - `VITE_SUPABASE_ANON_KEY` = la chiave anon public
5. Premi **Deploy**. Al termine ottieni un link pubblico (es. `https://tuoapp.vercel.app`).

Da quel link, ogni collaboratore può:
- su **iPhone**: aprire il link in Safari → icona Condividi → **Aggiungi a Home**.
- su **Android**: aprire il link in Chrome → menu → **Installa app** (o **Aggiungi a schermata Home**).

L'app si comporta come un'app installata (icona propria, schermo intero), senza passare da App Store/Play Store.

## 4. Note sulla sicurezza dei PIN

Come nella versione precedente, l'accesso è tramite PIN condiviso (non ci sono account personali): è pensato per un uso interno, non per dati sensibili di alto valore. Rispetto alla vecchia versione (che teneva tutto, incluso il PIN Titolare, in un archivio semplice accessibile a chiunque aprisse l'app):

- i PIN non vengono più scaricati in chiaro dal browser: la loro verifica avviene tramite funzioni del database (RPC) che restituiscono solo "corretto/sbagliato";
- il PIN Titolare non è mai leggibile, nemmeno dalle Impostazioni (si può solo sostituirlo con uno nuovo);
- ogni voce di incasso è una riga separata nel database, quindi due sedi che salvano nello stesso momento non si sovrascrivono più a vicenda (poteva succedere con il vecchio sistema).

Per una sicurezza più alta (account personali, permessi differenziati per sede) servirebbe integrare Supabase Auth: è un'estensione possibile in futuro, non necessaria per l'uso attuale.

## Struttura del progetto

- `src/App.jsx` — l'interfaccia (invariata nell'aspetto rispetto all'originale).
- `src/lib/supabaseClient.js` — connessione a Supabase.
- `src/lib/api.js` — tutte le letture/scritture verso il database.
- `supabase/schema.sql` — schema del database da eseguire una sola volta su Supabase.

## 5. Deploy

Collegato a Vercel: build automatica ad ogni push su `main`.
