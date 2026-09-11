// Vercel Serverless Function: invia al Titolare un'email di riepilogo ogni
// volta che una sede invia una chiusura di cassa. Usa l'API REST di Resend
// (nessuna libreria necessaria) con variabili d'ambiente lato server, mai
// esposte al client (a differenza delle VITE_* che finiscono nel bundle).
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Metodo non consentito" });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const ownerEmail = process.env.OWNER_EMAIL;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Incassi <onboarding@resend.dev>";

  if (!apiKey || !ownerEmail) {
    res.status(500).json({ error: "Invio email non configurato (RESEND_API_KEY / OWNER_EMAIL mancanti)" });
    return;
  }

  const {
    locationName,
    date,
    contanti = 0,
    pos = 0,
    altroIncasso = 0,
    totaleUscite = 0,
    fondoCassa = null,
    operatore = "",
  } = req.body || {};

  if (!locationName || !date) {
    res.status(400).json({ error: "Dati chiusura mancanti" });
    return;
  }

  const fmt = (n) => `€ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
  const netto = Number(contanti) + Number(pos) + Number(altroIncasso) - Number(totaleUscite);
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="margin-bottom: 4px;">Chiusura di cassa — ${locationName}</h2>
      <p style="color: #555; margin-top: 0;">${dateLabel}${operatore ? ` · inviata da ${operatore}` : ""}</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 0;">Contanti</td><td style="text-align: right;">${fmt(contanti)}</td></tr>
        <tr><td style="padding: 4px 0;">POS</td><td style="text-align: right;">${fmt(pos)}</td></tr>
        <tr><td style="padding: 4px 0;">Altro</td><td style="text-align: right;">${fmt(altroIncasso)}</td></tr>
        <tr><td style="padding: 4px 0;">Uscite</td><td style="text-align: right;">-${fmt(totaleUscite)}</td></tr>
        ${fondoCassa != null ? `<tr><td style="padding: 4px 0;">Fondo cassa</td><td style="text-align: right;">${fmt(fondoCassa)}</td></tr>` : ""}
        <tr style="border-top: 1px solid #ddd; font-weight: 600;">
          <td style="padding: 8px 0;">Netto giornata</td><td style="text-align: right;">${fmt(netto)}</td>
        </tr>
      </table>
    </div>
  `;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [ownerEmail],
        subject: `Chiusura cassa — ${locationName} — ${date}`,
        html,
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      res.status(502).json({ error: text });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
