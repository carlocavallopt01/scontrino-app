import React, { useState, useEffect, useMemo, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Store,
  Dumbbell,
  ArrowLeft,
  Plus,
  Trash2,
  Settings,
  Check,
  Wallet,
  CreditCard,
  Coins,
  ChevronRight,
  Loader2,
  RefreshCw,
  Download,
} from "lucide-react";
import {
  getLocationsPublic,
  getLocationsAdmin,
  saveLocations as apiSaveLocations,
  verifyLocationPin,
  verifyOwnerPin,
  setOwnerPin as apiSetOwnerPin,
  getSubscriptionTypes,
  saveSubscriptionTypes as apiSaveSubscriptionTypes,
  getEntries,
  addEntry as apiAddEntry,
  deleteEntry as apiDeleteEntry,
  clearAllEntries as apiClearAllEntries,
} from "./lib/api";

const DEFAULT_SUBSCRIPTION_TYPES = ["Mensile", "Trimestrale", "Semestrale", "Annuale", "Ingresso singolo", "Altro"];

const DEFAULT_LOCATIONS = [
  { id: "palestra-1", name: "FITPOINT ACTIVE", type: "palestra", logo: null, staff: [] },
  { id: "palestra-2", name: "GIRL POWER", type: "palestra", logo: null, staff: [] },
  { id: "negozio-1", name: "SPEED SAVA", type: "negozio", logo: null, staff: [] },
  { id: "negozio-2", name: "SPEED MANDURIA", type: "negozio", logo: null, staff: [] },
  { id: "negozio-3", name: "SPEED FRANCAVILLA F.", type: "negozio", logo: null, staff: [] },
];

function randomPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSize = 160;
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const EXPENSE_CATEGORIES = ["Fornitori", "Affitto", "Utenze", "Personale", "Manutenzione", "Altro"];

const fmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

// Riprova un'operazione Supabase fino a 4 volte con attese crescenti, utile
// per problemi di rete momentanei (es. wifi della sede che cade un attimo).
async function withRetry(fn, attempts = 4) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts - 1) await new Promise((res) => setTimeout(res, Math.min(1000 * 2 ** i, 8000)));
  }
  throw lastErr || new Error("operazione non riuscita");
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// Converte un importo scritto con la virgola (es. "28,90") in numero valido; accetta anche il punto.
const toNum = (v) => {
  if (typeof v !== "string") return Number(v) || 0;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

function fmtDateLabel(d) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" });
}

const Fonts = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
    .f-display { font-family: 'Space Grotesk', sans-serif; }
    .f-body { font-family: 'Inter', sans-serif; }
    .f-mono { font-family: 'IBM Plex Mono', monospace; }
    .dashed { background-image: repeating-linear-gradient(to right, #14182B 0, #14182B 6px, transparent 6px, transparent 12px); height: 2px; }

    .bg-ink { background-color: #14182B; }
    .text-ink { color: #14182B; }
    .border-ink { border-color: #14182B; }
    .bg-paper { background-color: #EFEDE4; }
    .border-paper { border-color: #EFEDE4; }
    .bg-card { background-color: #F5F3EE; }
    .border-card { border-color: #D9D6C9; }
    .text-muted { color: #6E7280; }
    .text-faint { color: #9A9788; }
    .text-faint2 { color: #B7B3A2; }
    .text-slate2 { color: #4B4F63; }
    .text-emerald { color: #1F7A5C; }
    .bg-emerald { background-color: #1F7A5C; }
    .text-brick { color: #A63A2F; }
    .bg-brick { background-color: #A63A2F; }
    .text-amber { color: #D8A23B; }
    .text-mint { color: #BFE3D4; }
    .text-lilac { color: #B7BAC7; }

    .staff-card:hover { background-color: #14182B; color: #FFFFFF; }
    .staff-card:hover .staff-eyebrow { color: #B7BAC7; }
    .owner-card:hover { background-color: #195F48; }
    .loc-card:hover { border-color: #14182B; }
    .trash-hover:hover { color: #A63A2F; }

    .tracking-wide2 { letter-spacing: 0.4em; }
    .tracking-wide3 { letter-spacing: 0.3em; }
    .leading-tight2 { line-height: 0.95; }
    .text-tiny { font-size: 11px; }
    .text-tiny2 { font-size: 10px; }
  `}</style>
);

export default function App() {
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState(DEFAULT_LOCATIONS);
  const [entries, setEntries] = useState([]);
  const [mode, setMode] = useState(null); // 'owner' | 'staff'
  const [error, setError] = useState("");
  const [ownerUnlocked, setOwnerUnlocked] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [subscriptionTypes, setSubscriptionTypes] = useState(DEFAULT_SUBSCRIPTION_TYPES);

  const [lastUpdated, setLastUpdated] = useState(null);

  const loadEntries = useCallback(async (silent) => {
    try {
      const ents = await getEntries();
      setEntries(ents);
      setLastUpdated(new Date());
      if (!silent) setError("");
    } catch {
      if (!silent) setError("Non riesco ad aggiornare i dati. Controlla la connessione.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [locs, subs] = await Promise.all([getLocationsPublic(), getSubscriptionTypes()]);
        setLocations(locs);
        setSubscriptionTypes(subs && subs.length ? subs : DEFAULT_SUBSCRIPTION_TYPES);
      } catch {
        setError("Non riesco a caricare i dati da Supabase. Controlla la connessione e la configurazione.");
      }
      await loadEntries(true);
      setLoading(false);
    })();
  }, [loadEntries]);

  const saveOwnerPin = useCallback(async (newPin) => {
    try {
      await withRetry(() => apiSetOwnerPin(newPin));
      setError("");
      return true;
    } catch (err) {
      setError(`Non sono riuscito a salvare il PIN Titolare: ${err?.message || "errore sconosciuto"}.`);
      return false;
    }
  }, []);

  const saveSubscriptionTypes = useCallback(async (next) => {
    setSubscriptionTypes(next);
    try {
      await withRetry(() => apiSaveSubscriptionTypes(next));
      setError("");
      return true;
    } catch (err) {
      setError(`Non sono riuscito a salvare gli abbonamenti: ${err?.message || "errore sconosciuto"}.`);
      return false;
    }
  }, []);

  useEffect(() => {
    if (mode !== "owner" || settingsOpen) return;
    const interval = setInterval(() => loadEntries(true), 60000);
    return () => clearInterval(interval);
  }, [mode, settingsOpen, loadEntries]);

  const onAddEntry = useCallback(async (entry) => {
    try {
      await withRetry(() => apiAddEntry(entry));
      setEntries((prev) => [...prev, entry]);
      setError("");
      return true;
    } catch (err) {
      setError(`Salvataggio non riuscito: ${err?.message || "errore sconosciuto"}. Riprova tra poco.`);
      return false;
    }
  }, []);

  const onDeleteEntry = useCallback(async (id) => {
    try {
      await withRetry(() => apiDeleteEntry(id));
      setEntries((prev) => prev.filter((e) => e.id !== id));
      return true;
    } catch (err) {
      setError(`Impossibile eliminare la voce: ${err?.message || "errore sconosciuto"}.`);
      return false;
    }
  }, []);

  const onClearEntries = useCallback(async () => {
    try {
      await withRetry(() => apiClearAllEntries());
      setEntries([]);
      return true;
    } catch (err) {
      setError(`Impossibile cancellare i dati: ${err?.message || "errore sconosciuto"}.`);
      return false;
    }
  }, []);

  const persistLocations = useCallback(async (next) => {
    try {
      await withRetry(() => apiSaveLocations(next));
      setLocations(next.map(({ pin, ...rest }) => rest));
      setError("");
      return true;
    } catch (err) {
      setError(`Non sono riuscito a salvare le sedi: ${err?.message || "errore sconosciuto"}.`);
      return false;
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <Fonts />
        <Loader2 className="w-6 h-6 animate-spin text-ink" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper f-body text-ink">
      <Fonts />
      {error && (
        <div
          style={{ backgroundColor: "#A63A2F", color: "#FFFFFF" }}
          className="sticky top-0 z-50 text-sm px-4 py-2 flex items-center justify-between gap-3 f-body"
        >
          <span>{error}</span>
          <button onClick={() => setError("")} className="shrink-0 opacity-80 hover:opacity-100" aria-label="Chiudi">
            ✕
          </button>
        </div>
      )}
      {mode === null && <Landing onPick={setMode} />}
      {mode === "owner" && !ownerUnlocked && (
        <OwnerPinGate
          onVerify={verifyOwnerPin}
          onBack={() => setMode(null)}
          onUnlock={() => setOwnerUnlocked(true)}
        />
      )}
      {mode === "owner" && ownerUnlocked && (
        <OwnerDashboard
          locations={locations}
          entries={entries}
          onBack={() => {
            setMode(null);
            setOwnerUnlocked(false);
            setSettingsOpen(false);
          }}
          onSaveLocations={persistLocations}
          onClearEntries={onClearEntries}
          lastUpdated={lastUpdated}
          onRefresh={() => loadEntries(false)}
          onSaveOwnerPin={saveOwnerPin}
          subscriptionTypes={subscriptionTypes}
          onSaveSubscriptionTypes={saveSubscriptionTypes}
          settingsOpen={settingsOpen}
          onSettingsOpenChange={setSettingsOpen}
          error={error}
          onDismissError={() => setError("")}
        />
      )}
      {mode === "staff" && (
        <StaffFlow
          locations={locations}
          entries={entries}
          onBack={() => setMode(null)}
          onAddEntry={onAddEntry}
          onDeleteEntry={onDeleteEntry}
          subscriptionTypes={subscriptionTypes}
        />
      )}
    </div>
  );
}

function OwnerPinGate({ onVerify, onBack, onUnlock }) {
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);
  const [netError, setNetError] = useState(false);

  const submit = async () => {
    setWrong(false);
    setNetError(false);
    setChecking(true);
    try {
      const ok = await onVerify(pin);
      if (ok) {
        onUnlock();
        return;
      }
      setWrong(true);
    } catch {
      setNetError(true);
    } finally {
      setChecking(false);
      setPin("");
    }
  };

  return (
    <div className="max-w-xl mx-auto px-6 pt-10 pb-16">
      <TopBar title="Accesso Titolare" onBack={onBack} />
      <div className="bg-white rounded-2xl p-6 mt-6 border border-card">
        <div className="f-mono text-xs uppercase tracking-widest text-muted mb-3">
          Inserisci il PIN Titolare
        </div>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => {
            setWrong(false);
            setPin(e.target.value);
          }}
          onKeyDown={(e) => e.key === "Enter" && pin && !checking && submit()}
          className="w-full f-mono text-2xl tracking-wide2 text-center bg-card rounded-lg px-3 py-3 border border-card mb-3"
          placeholder="••••"
        />
        {wrong && <div className="text-sm text-brick mb-3">PIN errato, riprova.</div>}
        {netError && (
          <div className="text-sm text-brick mb-3">Impossibile verificare il PIN. Controlla la connessione.</div>
        )}
        <button
          onClick={submit}
          disabled={!pin || checking}
          className="w-full bg-ink text-white rounded-xl py-3 f-display font-600 disabled:opacity-30 flex items-center justify-center gap-2"
        >
          {checking ? <Loader2 className="w-5 h-5 animate-spin" /> : "Entra"}
        </button>
      </div>
    </div>
  );
}

function Landing({ onPick }) {
  return (
    <div className="max-w-xl mx-auto px-6 pt-20 pb-16">
      <div className="mb-14">
        <div className="text-xs tracking-wide3 uppercase text-muted mb-3 f-mono">
          Registro incassi &middot; multi-sede
        </div>
        <h1 className="f-display text-6xl font-700 leading-tight2 mb-4">Incassi</h1>
        <p className="text-slate2 text-lg leading-snug">
          Ogni sede registra l&apos;incasso della giornata. Tu vedi il totale, in tempo reale.
        </p>
      </div>

      <div className="grid gap-4">
        <button
          onClick={() => onPick("staff")}
          className="group text-left bg-white border-2 border-ink rounded-2xl p-6 staff-card transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="f-mono text-xs uppercase tracking-widest text-muted staff-eyebrow mb-1">
                Staff
              </div>
              <div className="f-display text-2xl font-600">Lavoro qui</div>
              <div className="text-sm mt-1 text-muted staff-eyebrow">
                Registra incassi e uscite della tua sede
              </div>
            </div>
            <ChevronRight className="w-6 h-6 shrink-0" />
          </div>
        </button>

        <button
          onClick={() => onPick("owner")}
          className="group text-left bg-emerald text-white rounded-2xl p-6 owner-card transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="f-mono text-xs uppercase tracking-widest text-mint mb-1">Titolare</div>
              <div className="f-display text-2xl font-600">Vedi tutte le sedi</div>
              <div className="text-sm mt-1 text-mint">Dashboard incassi, uscite e netto</div>
            </div>
            <ChevronRight className="w-6 h-6 shrink-0" />
          </div>
        </button>
      </div>
    </div>
  );
}

/* ---------------- STAFF FLOW ---------------- */

function StaffFlow({ locations, entries, onBack, onAddEntry, onDeleteEntry, subscriptionTypes }) {
  const [pendingId, setPendingId] = useState(null);
  const [unlockedId, setUnlockedId] = useState(null);

  if (unlockedId) {
    const loc = locations.find((l) => l.id === unlockedId);
    return (
      <StaffForm
        location={loc}
        entries={entries}
        onBack={() => setUnlockedId(null)}
        onAddEntry={onAddEntry}
        onDeleteEntry={onDeleteEntry}
        subscriptionTypes={subscriptionTypes}
      />
    );
  }

  if (pendingId) {
    const loc = locations.find((l) => l.id === pendingId);
    return (
      <PinGate
        location={loc}
        onVerify={(pin) => verifyLocationPin(loc.id, pin)}
        onBack={() => setPendingId(null)}
        onUnlock={() => setUnlockedId(pendingId)}
      />
    );
  }

  return (
    <div className="max-w-xl mx-auto px-6 pt-10 pb-16">
      <TopBar title="Scegli la tua sede" onBack={onBack} />
      <div className="grid grid-cols-2 gap-3 mt-6">
        {locations.map((loc) => (
          <button
            key={loc.id}
            onClick={() => setPendingId(loc.id)}
            className="bg-white rounded-xl p-5 text-left border border-card loc-card transition-colors"
          >
            {loc.logo ? (
              <img src={loc.logo} alt="" className="w-9 h-9 mb-3 rounded-lg object-cover" />
            ) : loc.type === "palestra" ? (
              <Dumbbell className="w-5 h-5 mb-3 text-emerald" />
            ) : (
              <Store className="w-5 h-5 mb-3 text-amber" />
            )}
            <div className="f-display font-600 leading-tight">{loc.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PinGate({ location, onVerify, onBack, onUnlock }) {
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);
  const [netError, setNetError] = useState(false);

  const submit = async () => {
    setWrong(false);
    setNetError(false);
    setChecking(true);
    try {
      const ok = await onVerify(pin);
      if (ok) {
        onUnlock();
        return;
      }
      setWrong(true);
    } catch {
      setNetError(true);
    } finally {
      setChecking(false);
      setPin("");
    }
  };

  return (
    <div className="max-w-xl mx-auto px-6 pt-10 pb-16">
      <TopBar title={location.name} onBack={onBack} />
      <div className="bg-white rounded-2xl p-6 mt-6 border border-card">
        <div className="f-mono text-xs uppercase tracking-widest text-muted mb-3">
          Inserisci il PIN della sede
        </div>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => {
            setWrong(false);
            setPin(e.target.value);
          }}
          onKeyDown={(e) => e.key === "Enter" && pin && !checking && submit()}
          className="w-full f-mono text-2xl tracking-wide2 text-center bg-card rounded-lg px-3 py-3 border border-card mb-3"
          placeholder="••••"
        />
        {wrong && <div className="text-sm text-brick mb-3">PIN errato, riprova.</div>}
        {netError && (
          <div className="text-sm text-brick mb-3">Impossibile verificare il PIN. Controlla la connessione.</div>
        )}
        <button
          onClick={submit}
          disabled={!pin || checking}
          className="w-full bg-ink text-white rounded-xl py-3 f-display font-600 disabled:opacity-30 flex items-center justify-center gap-2"
        >
          {checking ? <Loader2 className="w-5 h-5 animate-spin" /> : "Entra"}
        </button>
      </div>
    </div>
  );
}

function TopBar({ title, onBack }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-black/5" aria-label="Indietro">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <h2 className="f-display text-lg font-600">{title}</h2>
    </div>
  );
}

function StaffForm({ location, entries, onBack, onAddEntry, onDeleteEntry, subscriptionTypes }) {
  const isPalestra = location.type === "palestra";
  const types = subscriptionTypes && subscriptionTypes.length ? subscriptionTypes : DEFAULT_SUBSCRIPTION_TYPES;
  const names = location.staff || [];
  const [operatore, setOperatore] = useState(names[0] || "");
  const [date, setDate] = useState(todayStr());
  const [contanti, setContanti] = useState("");
  const [pos, setPos] = useState("");
  const [altro, setAltro] = useState("");
  const [spese, setSpese] = useState([]);
  const [note, setNote] = useState("");
  const [cliente, setCliente] = useState("");
  const [abbonamento, setAbbonamento] = useState(types[0]);
  const [abbonamentoAltro, setAbbonamentoAltro] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);

  const totIncasso = toNum(contanti) + toNum(pos) + toNum(altro);
  const totSpese = spese.reduce((s, r) => s + toNum(r.importo), 0);
  const netto = totIncasso - totSpese;

  const addSpesa = () => setSpese((s) => [...s, { id: uid(), categoria: EXPENSE_CATEGORIES[0], importo: "", nota: "" }]);
  const updateSpesa = (id, patch) => setSpese((s) => s.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeSpesa = (id) => setSpese((s) => s.filter((r) => r.id !== id));

  const canSave = (totIncasso > 0 || totSpese > 0) && (names.length === 0 || operatore);

  const handleSave = async () => {
    const abbonamentoFinale =
      isPalestra && abbonamento === "Altro" && abbonamentoAltro.trim()
        ? abbonamentoAltro.trim()
        : abbonamento;
    const entry = {
      id: uid(),
      locationId: location.id,
      date,
      contanti: toNum(contanti),
      pos: toNum(pos),
      altroIncasso: toNum(altro),
      spese: spese.map((s) => ({ categoria: s.categoria, importo: toNum(s.importo), nota: s.nota })),
      note,
      cliente: isPalestra ? cliente : "",
      abbonamento: isPalestra ? abbonamentoFinale : "",
      operatore: operatore || "",
      enteredAt: new Date().toISOString(),
    };
    setSaveError(false);
    setSaving(true);
    const ok = await onAddEntry(entry);
    setSaving(false);
    if (!ok) {
      setSaveError(true);
      return;
    }
    setContanti("");
    setPos("");
    setAltro("");
    setSpese([]);
    setNote("");
    setCliente("");
    setAbbonamento(types[0]);
    setAbbonamentoAltro("");
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const handleDelete = async (id) => {
    await onDeleteEntry(id);
  };

  const todaysForLocation = entries
    .filter((e) => e.locationId === location.id && e.date === date)
    .sort((a, b) => b.enteredAt.localeCompare(a.enteredAt));

  return (
    <div className="max-w-xl mx-auto px-6 pt-10 pb-24">
      <TopBar title={location.name} onBack={onBack} />

      <div className="relative bg-white rounded-2xl mt-6 p-6 shadow-sm">
        {names.length > 0 ? (
          <>
            <div className="f-mono text-xs uppercase tracking-widest text-muted mb-1">Chi sta compilando</div>
            <select
              value={operatore}
              onChange={(e) => setOperatore(e.target.value)}
              className="w-full text-sm bg-card rounded-lg px-3 py-2 border border-card mb-4"
            >
              <option value="" disabled>
                Seleziona il tuo nome
              </option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </>
        ) : (
          <div className="text-xs text-faint italic mb-4">
            Nessun collaboratore configurato per questa sede.
            Aggiungilo dal Titolare → Impostazioni → sezione di questa sede.
          </div>
        )}
        <div className="flex items-center justify-between mb-4">
          <span className="f-mono text-xs uppercase tracking-widest text-muted">Data</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="f-mono text-sm bg-card rounded-lg px-3 py-1.5 border border-card"
          />
        </div>

        <div className="dashed mb-4" />

        <div className="mb-1 f-mono text-xs uppercase tracking-widest text-emerald">Incassi</div>
        <MoneyRow icon={<Coins className="w-4 h-4" />} label="Contanti" value={contanti} onChange={setContanti} />
        <MoneyRow icon={<CreditCard className="w-4 h-4" />} label="POS / Carta" value={pos} onChange={setPos} />
        <MoneyRow icon={<Wallet className="w-4 h-4" />} label="Altro" value={altro} onChange={setAltro} />

        <div className="dashed my-4" />

        <div className="flex items-center justify-between mb-2">
          <span className="f-mono text-xs uppercase tracking-widest text-brick">Uscite</span>
          <button onClick={addSpesa} className="flex items-center gap-1 text-xs f-mono text-brick">
            <Plus className="w-3.5 h-3.5" /> aggiungi
          </button>
        </div>
        {spese.length === 0 && (
          <div className="text-sm text-faint italic mb-2">Nessuna uscita registrata oggi</div>
        )}
        {spese.map((r) => (
          <div key={r.id} className="flex items-center gap-2 mb-2">
            <select
              value={r.categoria}
              onChange={(e) => updateSpesa(r.id, { categoria: e.target.value })}
              className="f-body text-sm bg-card rounded-lg px-2 py-2 border border-card flex-shrink-0"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 f-mono text-sm text-faint">€</span>
              <input
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                placeholder="0"
                value={r.importo}
                onChange={(e) => updateSpesa(r.id, { importo: e.target.value })}
                style={{ WebkitTextFillColor: "#14182B", color: "#14182B" }}
                className="f-mono w-full text-sm bg-card rounded-lg pl-7 pr-3 py-2 border border-card text-right"
              />
            </div>
            <button onClick={() => removeSpesa(r.id)} className="p-2 text-faint trash-hover">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        <div className="dashed my-4" />

        {isPalestra ? (
          <>
            <div className="mb-1 f-mono text-xs uppercase tracking-widest text-muted">Cliente</div>
            <input
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Nome e cognome"
              className="w-full text-sm bg-card rounded-lg px-3 py-2 border border-card mb-3"
            />
            <div className="mb-1 f-mono text-xs uppercase tracking-widest text-muted">Abbonamento</div>
            <select
              value={abbonamento}
              onChange={(e) => setAbbonamento(e.target.value)}
              className="w-full text-sm bg-card rounded-lg px-3 py-2 border border-card mb-3"
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {abbonamento === "Altro" && (
              <input
                value={abbonamentoAltro}
                onChange={(e) => setAbbonamentoAltro(e.target.value)}
                placeholder="Specifica cos'è (es. pacchetto personal)"
                className="w-full text-sm bg-card rounded-lg px-3 py-2 border border-card mb-3"
              />
            )}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Altra nota (facoltativa)"
              rows={2}
              className="w-full text-sm bg-card rounded-lg px-3 py-2 border border-card mb-4 resize-none"
            />
          </>
        ) : (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota (facoltativa)"
            rows={2}
            className="w-full text-sm bg-card rounded-lg px-3 py-2 border border-card mb-4 resize-none"
          />
        )}
        <div className="dashed my-4" />

        <div className="space-y-1 mb-5">
          <TotRow label="Totale incassi" value={totIncasso} color="#1F7A5C" />
          <TotRow label="Totale uscite" value={totSpese} color="#A63A2F" />
          <div className="flex items-center justify-between pt-2 border-t border-ink">
            <span className="f-display font-600">Netto</span>
            <span className="f-mono text-lg font-600">{fmt.format(netto)}</span>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className={
            "w-full rounded-xl py-4 f-display font-600 text-lg flex items-center justify-center gap-2 transition-colors " +
            (canSave
              ? "bg-ink text-white"
              : "bg-white text-faint border-2 border-dashed border-card")
          }
        >
          {saved ? (
            <>
              <Check className="w-5 h-5" /> Salvato
            </>
          ) : saving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> Salvataggio in corso, non chiudere…
            </>
          ) : (
            "Invia incasso"
          )}
        </button>
        {!canSave && !saved && (
          <div className="text-center text-xs text-faint mt-2">
            Inserisci almeno un incasso o un'uscita per confermare
          </div>
        )}
        {saveError && (
          <div className="text-center text-xs text-brick mt-2 font-600">
            Salvataggio non riuscito. Controlla la connessione e tocca di nuovo &quot;Invia incasso&quot;
            (i dati inseriti non sono andati persi).
          </div>
        )}
      </div>

      {todaysForLocation.length > 0 && (
        <div className="mt-8">
          <div className="f-mono text-xs uppercase tracking-widest text-muted mb-3">
            Voci del {fmtDateLabel(date)}
          </div>
          <div className="space-y-2">
            {todaysForLocation.map((e) => {
              const inc = e.contanti + e.pos + e.altroIncasso;
              const sp = e.spese.reduce((s, r) => s + r.importo, 0);
              return (
                <div key={e.id} className="bg-white rounded-xl px-4 py-3 flex items-center justify-between border border-card">
                  <div>
                    {(e.cliente || e.abbonamento || e.operatore) && (
                      <div className="text-sm text-slate2 mb-0.5">
                        {e.cliente || "—"}
                        {e.abbonamento && <span className="text-faint"> · {e.abbonamento}</span>}
                        {e.operatore && <span className="text-faint"> · {e.operatore}</span>}
                      </div>
                    )}
                    <div className="f-mono text-sm">
                      <span className="text-emerald">+{fmt.format(inc)}</span>{" "}
                      <span className="text-brick">-{fmt.format(sp)}</span>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(e.id)} className="text-faint trash-hover">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MoneyRow({ icon, label, value, onChange }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="text-muted">{icon}</div>
      <span className="text-sm flex-1">{label}</span>
      <div className="relative w-32">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 f-mono text-sm text-faint">€</span>
        <input
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ WebkitTextFillColor: "#14182B", color: "#14182B" }}
          className="f-mono w-full text-sm bg-card rounded-lg pl-7 pr-3 py-2 border border-card text-right"
        />
      </div>
    </div>
  );
}

function TotRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className="f-mono" style={{ color }}>
        {fmt.format(value)}
      </span>
    </div>
  );
}

/* ---------------- OWNER DASHBOARD ---------------- */

function periodRange(period, custom) {
  const end = new Date();
  const start = new Date();
  if (period === "today") {
    // same day
  } else if (period === "week") {
    start.setDate(end.getDate() - 6);
  } else if (period === "month") {
    start.setDate(end.getDate() - 29);
  } else if (period === "custom" && custom.start && custom.end) {
    return { start: custom.start, end: custom.end };
  }
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function OwnerDashboard({
  locations,
  entries,
  onBack,
  onSaveLocations,
  lastUpdated,
  onRefresh,
  onSaveOwnerPin,
  subscriptionTypes,
  onSaveSubscriptionTypes,
  settingsOpen,
  onSettingsOpenChange,
  onClearEntries,
  error,
  onDismissError,
}) {
  const [period, setPeriod] = useState("today");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setTimeout(() => setRefreshing(false), 400);
  };

  const [exportState, setExportState] = useState("idle"); // idle | done | manual | error
  const [exportText, setExportText] = useState("");

  const handleExport = async () => {
    const headers = [
      "Data",
      "Sede",
      "Contanti",
      "POS",
      "Altro incasso",
      "Totale incassi",
      "Totale uscite",
      "Netto",
      "Cliente",
      "Abbonamento",
      "Operatore",
      "Note",
      "Dettaglio uscite",
      "Inserito il",
    ];
    const rows = [...entries]
      .sort((a, b) => (a.date + a.enteredAt).localeCompare(b.date + b.enteredAt))
      .map((e) => {
        const loc = locations.find((l) => l.id === e.locationId);
        const totIncasso = e.contanti + e.pos + e.altroIncasso;
        const totSpese = (e.spese || []).reduce((s, r) => s + r.importo, 0);
        const dettaglioUscite = (e.spese || [])
          .map((s) => `${s.categoria}: ${fmt.format(s.importo)}${s.nota ? " (" + s.nota + ")" : ""}`)
          .join(" · ");
        return [
          e.date,
          loc?.name || "—",
          e.contanti,
          e.pos,
          e.altroIncasso,
          totIncasso,
          totSpese,
          totIncasso - totSpese,
          e.cliente || "",
          e.abbonamento || "",
          e.operatore || "",
          e.note || "",
          dettaglioUscite,
          e.enteredAt ? new Date(e.enteredAt).toLocaleString("it-IT") : "",
        ];
      });

    const clean = (v) => String(v ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
    const tsv = [headers, ...rows].map((r) => r.map(clean).join("\t")).join("\n");

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(tsv);
        setExportState("done");
        setTimeout(() => setExportState("idle"), 3000);
        return;
      }
      throw new Error("clipboard API non disponibile");
    } catch {
      setExportText(tsv);
      setExportState("manual");
    }
  };
  const [custom, setCustom] = useState({ start: todayStr(), end: todayStr() });
  const [selectedLoc, setSelectedLoc] = useState(new Set(locations.map((l) => l.id)));
  const showSettings = settingsOpen;
  const setShowSettings = onSettingsOpenChange;

  useEffect(() => {
    setSelectedLoc(new Set(locations.map((l) => l.id)));
  }, [locations]);

  const { start, end } = periodRange(period, custom);

  const filtered = useMemo(
    () => entries.filter((e) => e.date >= start && e.date <= end && selectedLoc.has(e.locationId)),
    [entries, start, end, selectedLoc]
  );

  const perLocation = useMemo(() => {
    return locations.map((loc) => {
      const locEntries = filtered.filter((e) => e.locationId === loc.id);
      const incassi = locEntries.reduce((s, e) => s + e.contanti + e.pos + e.altroIncasso, 0);
      const uscite = locEntries.reduce((s, e) => s + e.spese.reduce((a, r) => a + r.importo, 0), 0);
      return { ...loc, incassi, uscite, netto: incassi - uscite };
    });
  }, [locations, filtered]);

  const totIncassi = perLocation.reduce((s, l) => s + l.incassi, 0);
  const totUscite = perLocation.reduce((s, l) => s + l.uscite, 0);

  const chartData = perLocation.map((l) => ({ name: l.name, Incassi: l.incassi, Uscite: l.uscite }));

  const byDay = useMemo(() => {
    const map = {};
    filtered.forEach((e) => {
      map[e.date] = map[e.date] || [];
      map[e.date].push(e);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const toggleLoc = (id) =>
    setSelectedLoc((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="max-w-3xl mx-auto px-6 pt-10 pb-24">
      <div className="flex items-center justify-between mb-2">
        <TopBar title="Le tue sedi" onBack={onBack} />
        <div className="flex items-center gap-1">
          <button onClick={handleExport} className="p-2 rounded-lg hover:bg-black/5" aria-label="Esporta Excel" title="Scarica backup Excel">
            <Download className="w-5 h-5" />
          </button>
          <button onClick={handleRefresh} className="p-2 rounded-lg hover:bg-black/5" aria-label="Aggiorna">
            <RefreshCw className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setShowSettings(true)} className="p-2 rounded-lg hover:bg-black/5" aria-label="Impostazioni">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
      {exportState === "done" && (
        <div className="bg-card border border-card rounded-xl p-3 mb-3 text-sm text-emerald flex items-center gap-2">
          <Check className="w-4 h-4" /> Dati copiati! Incollali in Excel, Google Sheets o Note.
        </div>
      )}
      {exportState === "manual" && (
        <div className="bg-card border border-card rounded-xl p-3 mb-3">
          <p className="text-sm text-slate2 mb-2">
            Non riesco a copiarli automaticamente qui. Tieni premuto sul testo qui sotto, tocca
            &quot;Seleziona tutto&quot; poi &quot;Copia&quot;, e incollalo dove preferisci.
          </p>
          <textarea
            readOnly
            value={exportText}
            onFocus={(e) => e.target.select()}
            className="w-full h-32 text-xs f-mono bg-white rounded-lg p-2 border border-card"
          />
          <button
            onClick={() => setExportState("idle")}
            className="w-full mt-2 text-sm text-slate2 border border-card rounded-lg py-1.5 f-display font-600"
          >
            Ho copiato, chiudi
          </button>
        </div>
      )}
      {exportState === "error" && (
        <div className="bg-card border border-card rounded-xl p-3 mb-3 text-sm text-brick">
          Non sono riuscito a preparare i dati. Riprova tra poco.
        </div>
      )}
      {lastUpdated && (
        <div className="f-mono text-tiny text-faint mb-3">
          Aggiornato alle {lastUpdated.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} ·
          si aggiorna da solo ogni 60s
        </div>
      )}

      <div className="flex gap-2 mt-4 mb-3 flex-wrap">
        {[
          ["today", "Oggi"],
          ["week", "7 giorni"],
          ["month", "30 giorni"],
          ["custom", "Intervallo"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`px-3 py-1.5 rounded-full text-sm f-body border ${
              period === key ? "bg-ink text-white border-ink" : "border-card text-slate2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <div className="flex items-center gap-2 mb-4">
          <input
            type="date"
            value={custom.start}
            onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))}
            className="f-mono text-sm bg-white rounded-lg px-3 py-1.5 border border-card"
          />
          <span className="text-faint">→</span>
          <input
            type="date"
            value={custom.end}
            onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))}
            className="f-mono text-sm bg-white rounded-lg px-3 py-1.5 border border-card"
          />
        </div>
      )}

      <div className="flex gap-2 mb-6 flex-wrap">
        {locations.map((l) => (
          <button
            key={l.id}
            onClick={() => toggleLoc(l.id)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs f-mono border ${
              selectedLoc.has(l.id) ? "border-ink text-ink" : "border-card text-faint2"
            }`}
          >
            {l.type === "palestra" ? <Dumbbell className="w-3 h-3" /> : <Store className="w-3 h-3" />}
            {l.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <BigStat label="Incassi" value={totIncassi} color="#1F7A5C" />
        <BigStat label="Uscite" value={totUscite} color="#A63A2F" />
        <BigStat label="Netto" value={totIncassi - totUscite} color="#14182B" />
      </div>

      {chartData.some((c) => c.Incassi || c.Uscite) && (
        <div className="bg-white rounded-2xl p-4 mb-8 border border-card">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFEDE4" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Inter" }} />
              <YAxis tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
              <Tooltip formatter={(v) => fmt.format(v)} contentStyle={{ fontFamily: "Inter", fontSize: 13 }} />
              <Bar dataKey="Incassi" fill="#1F7A5C" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Uscite" fill="#A63A2F" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3 mb-10">
        {perLocation
          .filter((l) => selectedLoc.has(l.id))
          .map((l) => (
            <div key={l.id} className="bg-white rounded-xl p-4 border border-card">
              <div className="flex items-center gap-2 mb-2">
                {l.logo ? (
                  <img src={l.logo} alt="" className="w-5 h-5 rounded object-cover" />
                ) : l.type === "palestra" ? (
                  <Dumbbell className="w-4 h-4 text-emerald" />
                ) : (
                  <Store className="w-4 h-4 text-amber" />
                )}
                <span className="f-display font-600 text-sm">{l.name}</span>
              </div>
              <TotRow label="Incassi" value={l.incassi} color="#1F7A5C" />
              <TotRow label="Uscite" value={l.uscite} color="#A63A2F" />
              <div className="flex items-center justify-between pt-1 mt-1 border-t border-paper text-sm">
                <span className="text-muted">Netto</span>
                <span className="f-mono font-600">{fmt.format(l.netto)}</span>
              </div>
            </div>
          ))}
      </div>

      <div className="f-mono text-xs uppercase tracking-widest text-muted mb-3">Dettaglio giorni</div>
      {byDay.length === 0 && <div className="text-sm text-faint italic">Nessuna voce nel periodo selezionato</div>}
      <div className="space-y-4">
        {byDay.map(([date, dayEntries]) => (
          <div key={date}>
            <div className="text-sm font-600 mb-2 capitalize">{fmtDateLabel(date)}</div>
            <div className="space-y-1.5">
              {dayEntries.map((e) => {
                const loc = locations.find((l) => l.id === e.locationId);
                const inc = e.contanti + e.pos + e.altroIncasso;
                const sp = e.spese.reduce((s, r) => s + r.importo, 0);
                return (
                  <div key={e.id} className="bg-white rounded-lg px-3 py-2 flex items-center justify-between text-sm border border-paper">
                    <span className="text-slate2">
                      {loc?.name || "—"}
                      {(e.cliente || e.abbonamento) && (
                        <span className="text-faint">
                          {" "}
                          · {e.cliente || "—"}
                          {e.abbonamento ? ` (${e.abbonamento})` : ""}
                        </span>
                      )}
                      {e.operatore && <span className="text-faint"> · {e.operatore}</span>}
                    </span>
                    <span className="f-mono">
                      <span className="text-emerald">+{fmt.format(inc)}</span>{" "}
                      <span className="text-brick">-{fmt.format(sp)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {showSettings && (
        <SettingsModal
          locations={locations}
          onClose={() => setShowSettings(false)}
          onSave={onSaveLocations}
          onSaveOwnerPin={onSaveOwnerPin}
          subscriptionTypes={subscriptionTypes}
          onSaveSubscriptionTypes={onSaveSubscriptionTypes}
          onClearEntries={onClearEntries}
          error={error}
          onDismissError={onDismissError}
        />
      )}
    </div>
  );
}

function BigStat({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-card">
      <div className="f-mono text-tiny2 uppercase tracking-widest text-faint mb-1">{label}</div>
      <div className="f-mono text-lg font-600" style={{ color }}>
        {fmt.format(value)}
      </div>
    </div>
  );
}

function SettingsModal({
  locations,
  onClose,
  onSave,
  onSaveOwnerPin,
  subscriptionTypes,
  onSaveSubscriptionTypes,
  onClearEntries,
  error,
  onDismissError,
}) {
  const [names, setNames] = useState(locations.map((l) => l.name));
  const [pins, setPins] = useState(locations.map(() => ""));
  const [pinsLoaded, setPinsLoaded] = useState(false);
  const [staffLists, setStaffLists] = useState(locations.map((l) => l.staff || []));
  const [newStaffInputs, setNewStaffInputs] = useState(locations.map(() => ""));
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLocationsAdmin()
      .then((admin) => {
        if (cancelled) return;
        const byId = Object.fromEntries(admin.map((a) => [a.id, a.pin]));
        setPins(locations.map((l) => byId[l.id] || ""));
        setPinsLoaded(true);
      })
      .catch(() => setPinsLoaded(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addStaffTo = (i) => {
    const v = (newStaffInputs[i] || "").trim();
    if (!v) return;
    setStaffLists((lists) => {
      const next = [...lists];
      if (next[i].includes(v)) return lists;
      next[i] = [...next[i], v];
      return next;
    });
    setNewStaffInputs((inputs) => {
      const next = [...inputs];
      next[i] = "";
      return next;
    });
  };

  const removeStaffFrom = (i, name) => {
    setStaffLists((lists) => {
      const next = [...lists];
      next[i] = next[i].filter((n) => n !== name);
      return next;
    });
  };

  const handleClearEntries = async () => {
    setClearing(true);
    await onClearEntries();
    setClearing(false);
    setConfirmClear(false);
    setCleared(true);
    setTimeout(() => setCleared(false), 2000);
  };
  const [logos, setLogos] = useState(locations.map((l) => l.logo || null));
  const [newOwnerPin, setNewOwnerPin] = useState("");
  const [ownerPinSaved, setOwnerPinSaved] = useState(false);
  const [locSaved, setLocSaved] = useState(false);

  const handleSave = async () => {
    const ok = await onSave(
      locations.map((l, i) => ({
        ...l,
        name: names[i] || l.name,
        pin: pins[i],
        logo: logos[i],
        staff: staffLists[i] || [],
      }))
    );
    if (ok) {
      setLocSaved(true);
      setTimeout(() => setLocSaved(false), 1500);
    }
  };

  const handleLogoChange = async (i, file) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setLogos((ls) => {
        const next = [...ls];
        next[i] = dataUrl;
        return next;
      });
    } catch {
      // caricamento immagine non riuscito, ignoriamo
    }
  };

  const regenerateStorePin = (i) => {
    setPins((p) => {
      const next = [...p];
      next[i] = randomPin();
      return next;
    });
  };

  const handleSaveOwnerPin = async () => {
    if (!newOwnerPin || newOwnerPin.length < 4) return;
    const ok = await onSaveOwnerPin(newOwnerPin);
    if (ok) {
      setOwnerPinSaved(true);
      setNewOwnerPin("");
      setTimeout(() => setOwnerPinSaved(false), 1500);
    }
  };

  const regenerateOwnerPin = () => setNewOwnerPin(randomPin());

  const [subTypes, setSubTypes] = useState(subscriptionTypes && subscriptionTypes.length ? subscriptionTypes : DEFAULT_SUBSCRIPTION_TYPES);
  const [newSubType, setNewSubType] = useState("");
  const [subTypesSaved, setSubTypesSaved] = useState(false);

  const addSubType = () => {
    const v = newSubType.trim();
    if (!v || subTypes.includes(v)) return;
    const withoutAltro = subTypes.filter((t) => t !== "Altro");
    const hasAltro = subTypes.includes("Altro");
    setSubTypes(hasAltro ? [...withoutAltro, v, "Altro"] : [...withoutAltro, v]);
    setNewSubType("");
  };

  const removeSubType = (t) => setSubTypes((s) => s.filter((x) => x !== t));

  const handleSaveSubTypes = async () => {
    const ok = await onSaveSubscriptionTypes(subTypes.length ? subTypes : DEFAULT_SUBSCRIPTION_TYPES);
    if (ok) {
      setSubTypesSaved(true);
      setTimeout(() => setSubTypesSaved(false), 1500);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-sm overflow-y-auto"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="f-display font-600 mb-1">Impostazioni</h3>
        <p className="text-xs text-muted mb-5">
          Gestisci sedi, PIN, loghi e il tuo accesso da Titolare.
        </p>

        {error && (
          <div
            style={{ backgroundColor: "#A63A2F", color: "#FFFFFF" }}
            className="rounded-lg text-xs px-3 py-2 mb-4 flex items-start justify-between gap-3 f-body"
          >
            <span>{error}</span>
            <button
              onClick={onDismissError}
              className="shrink-0 opacity-80 hover:opacity-100"
              aria-label="Chiudi"
            >
              ✕
            </button>
          </div>
        )}

        <div className="f-mono text-xs uppercase tracking-widest text-muted mb-2">Il tuo PIN Titolare</div>
        <div className="bg-card rounded-xl p-3 mb-2 border border-card">
          <p className="text-xs text-muted mb-2">
            Per motivi di sicurezza il PIN attuale non viene mai mostrato. Scrivi un nuovo PIN (o generane
            uno) per sostituirlo.
          </p>
          <div className="flex gap-2">
            <input
              value={newOwnerPin}
              inputMode="numeric"
              placeholder="Nuovo PIN"
              onChange={(e) => setNewOwnerPin(e.target.value)}
              className="flex-1 f-mono text-sm text-center bg-white rounded-lg px-2 py-2 border border-card"
            />
            <button
              onClick={regenerateOwnerPin}
              className="px-3 f-mono text-xs bg-white rounded-lg border border-card text-slate2"
              title="Genera un PIN casuale"
            >
              Genera
            </button>
          </div>
          <button
            onClick={handleSaveOwnerPin}
            disabled={!newOwnerPin || newOwnerPin.length < 4}
            className="w-full mt-2 bg-ink text-white rounded-lg py-2 f-display font-600 text-sm flex items-center justify-center gap-2 disabled:opacity-30"
          >
            {ownerPinSaved ? (
              <>
                <Check className="w-4 h-4" /> Salvato
              </>
            ) : (
              "Salva PIN Titolare"
            )}
          </button>
        </div>

        <div className="dashed my-4" />

        <div className="f-mono text-xs uppercase tracking-widest text-muted mb-2">Tipi di abbonamento</div>
        <p className="text-xs text-muted mb-2">
          Personalizza le opzioni che il tuo staff vede nel menu Abbonamento delle palestre.
        </p>
        <div className="bg-card rounded-xl p-3 mb-2 border border-card">
          <div className="flex flex-wrap gap-2 mb-3">
            {subTypes.map((t) => (
              <span key={t} className="flex items-center gap-1 bg-white rounded-full px-3 py-1 text-sm border border-card">
                {t}
                <button onClick={() => removeSubType(t)} className="text-faint trash-hover">
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newSubType}
              onChange={(e) => setNewSubType(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSubType()}
              placeholder="Nuovo tipo, es. Pacchetto 10 lezioni"
              className="flex-1 text-sm bg-white rounded-lg px-3 py-2 border border-card"
            />
            <button onClick={addSubType} className="px-3 f-mono text-xs bg-white rounded-lg border border-card text-slate2">
              Aggiungi
            </button>
          </div>
          <button
            onClick={handleSaveSubTypes}
            className="w-full mt-2 bg-ink text-white rounded-lg py-2 f-display font-600 text-sm flex items-center justify-center gap-2"
          >
            {subTypesSaved ? (
              <>
                <Check className="w-4 h-4" /> Salvato
              </>
            ) : (
              "Salva abbonamenti"
            )}
          </button>
        </div>

        <div className="dashed my-4" />

        <div className="f-mono text-xs uppercase tracking-widest text-muted mb-2">Sedi, PIN, loghi e collaboratori</div>
        <p className="text-xs text-muted mb-3">
          Ogni sede vede e scrive solo i propri dati, e ha il proprio elenco di collaboratori: chi registra
          un incasso in quella sede sceglie il proprio nome solo tra quelli assegnati lì. Comunica il PIN
          solo a chi lavora lì; rigeneralo se qualcuno lascia il lavoro.
        </p>
        {!pinsLoaded && (
          <div className="text-xs text-faint italic mb-3">Caricamento PIN in corso…</div>
        )}
        <div className="space-y-4 mb-5">
          {locations.map((l, i) => (
            <div key={l.id} className="border border-card rounded-xl p-3">
              <div className="flex gap-2 mb-2">
                <label className="shrink-0 w-12 h-12 rounded-lg border border-dashed border-card bg-card flex items-center justify-center overflow-hidden cursor-pointer">
                  {logos[i] ? (
                    <img src={logos[i]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-tiny2 text-faint text-center leading-tight">logo</span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleLogoChange(i, e.target.files?.[0])}
                  />
                </label>
                <input
                  value={names[i]}
                  onChange={(e) =>
                    setNames((n) => {
                      const next = [...n];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                  className="flex-1 text-sm bg-card rounded-lg px-3 py-2 border border-card"
                />
              </div>
              <div className="flex gap-2">
                <input
                  value={pins[i]}
                  inputMode="numeric"
                  placeholder="PIN"
                  disabled={!pinsLoaded}
                  onChange={(e) =>
                    setPins((p) => {
                      const next = [...p];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                  className="w-20 f-mono text-sm text-center bg-card rounded-lg px-2 py-2 border border-card disabled:opacity-50"
                />
                <button
                  onClick={() => regenerateStorePin(i)}
                  disabled={!pinsLoaded}
                  className="flex-1 f-mono text-xs bg-card rounded-lg border border-card text-slate2 disabled:opacity-50"
                  title="Genera un PIN casuale per questa sede"
                >
                  Genera nuovo PIN
                </button>
              </div>

              <div className="dashed my-3" />

              <div className="f-mono text-tiny2 uppercase tracking-widest text-muted mb-2">
                Collaboratori di questa sede
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                {(staffLists[i] || []).length === 0 && (
                  <span className="text-xs text-faint italic">Nessun collaboratore ancora</span>
                )}
                {(staffLists[i] || []).map((n) => (
                  <span key={n} className="flex items-center gap-1 bg-card rounded-full px-3 py-1 text-sm border border-card">
                    {n}
                    <button onClick={() => removeStaffFrom(i, n)} className="text-faint trash-hover">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newStaffInputs[i] || ""}
                  onChange={(e) =>
                    setNewStaffInputs((inputs) => {
                      const next = [...inputs];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                  onKeyDown={(e) => e.key === "Enter" && addStaffTo(i)}
                  placeholder="Nome collaboratore, es. Francesca"
                  className="flex-1 text-sm bg-card rounded-lg px-3 py-2 border border-card"
                />
                <button
                  onClick={() => addStaffTo(i)}
                  className="px-3 f-mono text-xs bg-card rounded-lg border border-card text-slate2"
                >
                  Aggiungi
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={handleSave}
          disabled={!pinsLoaded}
          className="w-full bg-ink text-white rounded-xl py-2.5 f-display font-600 flex items-center justify-center gap-2 disabled:opacity-30"
        >
          {locSaved ? (
            <>
              <Check className="w-4 h-4" /> Salvato
            </>
          ) : (
            "Salva sedi"
          )}
        </button>

        <div className="dashed my-4" />

        <div className="f-mono text-xs uppercase tracking-widest text-brick mb-2">Zona pericolosa</div>
        <div className="bg-card rounded-xl p-3 border border-card">
          <p className="text-xs text-muted mb-3">
            Cancella tutti gli incassi registrati finora (utile per ripulire le prove prima di far partire
            davvero lo staff). Sedi, PIN, loghi e abbonamenti restano invariati. L&apos;azione non si può
            annullare.
          </p>
          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              className="w-full text-sm text-brick border border-brick rounded-lg py-2 f-display font-600"
            >
              Cancella tutti i dati di prova
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-brick font-600">Sei sicuro? Tutti gli incassi verranno eliminati per sempre.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmClear(false)}
                  className="flex-1 text-sm text-slate2 border border-card rounded-lg py-2 f-display font-600"
                >
                  Annulla
                </button>
                <button
                  onClick={handleClearEntries}
                  disabled={clearing}
                  className="flex-1 text-sm bg-brick text-white rounded-lg py-2 f-display font-600 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {cleared ? (
                    <>
                      <Check className="w-4 h-4" /> Fatto
                    </>
                  ) : clearing ? (
                    "Cancellazione…"
                  ) : (
                    "Sì, cancella tutto"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
