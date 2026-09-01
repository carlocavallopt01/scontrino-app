import { supabase } from "./supabaseClient";

function mapEntryFromDb(row) {
  return {
    id: row.id,
    locationId: row.location_id,
    date: row.date,
    contanti: Number(row.contanti) || 0,
    pos: Number(row.pos) || 0,
    altroIncasso: Number(row.altro_incasso) || 0,
    spese: (row.spese || []).map((s) => ({
      categoria: s.categoria,
      importo: Number(s.importo) || 0,
      nota: s.nota || "",
    })),
    note: row.note || "",
    cliente: row.cliente || "",
    abbonamento: row.abbonamento || "",
    operatore: row.operatore || "",
    enteredAt: row.entered_at,
  };
}

function mapEntryToDb(entry) {
  return {
    id: entry.id,
    location_id: entry.locationId,
    date: entry.date,
    contanti: entry.contanti,
    pos: entry.pos,
    altro_incasso: entry.altroIncasso,
    spese: entry.spese,
    note: entry.note,
    cliente: entry.cliente,
    abbonamento: entry.abbonamento,
    operatore: entry.operatore,
    entered_at: entry.enteredAt,
  };
}

export async function getLocationsPublic() {
  const { data, error } = await supabase
    .from("locations_public")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data.map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    logo: l.logo,
    staff: l.staff || [],
  }));
}

export async function getLocationsAdmin() {
  const { data, error } = await supabase.rpc("get_locations_admin");
  if (error) throw error;
  return data.map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    pin: l.pin,
    logo: l.logo,
    staff: l.staff || [],
  }));
}

export async function saveLocations(locations) {
  // Passa dalla RPC update_location (security definer) invece di un
  // UPDATE diretto sulla tabella: su questo progetto un UPDATE come anon
  // non risultava mai effettivo nonostante grant e policy corretti, senza
  // sollevare alcun errore. La RPC bypassa del tutto quel problema.
  for (const l of locations) {
    const { error } = await supabase.rpc("update_location", {
      p_id: l.id,
      p_name: l.name,
      p_type: l.type,
      p_pin: l.pin,
      p_logo: l.logo,
      p_staff: l.staff || [],
    });
    if (error) throw error;
  }
}

export async function verifyLocationPin(locationId, pin) {
  const { data, error } = await supabase.rpc("verify_location_pin", {
    p_location_id: locationId,
    p_pin: pin,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function verifyOwnerPin(pin) {
  const { data, error } = await supabase.rpc("verify_owner_pin", { p_pin: pin });
  if (error) throw error;
  return Boolean(data);
}

export async function setOwnerPin(pin) {
  const { error } = await supabase.rpc("set_owner_pin", { p_pin: pin });
  if (error) throw error;
}

export async function getSubscriptionTypes() {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "subscription_types")
    .maybeSingle();
  if (error) throw error;
  return data?.value || null;
}

export async function saveSubscriptionTypes(next) {
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "subscription_types", value: next }, { onConflict: "key" });
  if (error) throw error;
}

export async function getEntries() {
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .order("entered_at", { ascending: true });
  if (error) throw error;
  return data.map(mapEntryFromDb);
}

export async function addEntry(entry) {
  const { error } = await supabase.from("entries").insert(mapEntryToDb(entry));
  if (error) throw error;
}

export async function deleteEntry(id) {
  const { error } = await supabase.from("entries").delete().eq("id", id);
  if (error) throw error;
}

export async function clearAllEntries() {
  const { error } = await supabase.from("entries").delete().neq("id", "");
  if (error) throw error;
}
