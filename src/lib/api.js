import { supabase } from "./supabaseClient";

function mapEntryFromDb(row) {
  return {
    id: row.id,
    locationId: row.location_id,
    date: row.date,
    contanti: Number(row.contanti) || 0,
    contantiInviato: Boolean(row.contanti_inviato),
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

export async function getLocationsAdmin(ownerPin) {
  const { data, error } = await supabase.rpc("get_locations_admin", { p_owner_pin: ownerPin });
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

export async function saveLocations(locations, ownerPin) {
  for (const l of locations) {
    const { error } = await supabase.rpc("update_location", {
      p_owner_pin: ownerPin,
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

export async function setOwnerPin(oldPin, newPin) {
  const { error } = await supabase.rpc("set_owner_pin", { p_old_pin: oldPin, p_new_pin: newPin });
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

export async function saveSubscriptionTypes(next, ownerPin) {
  const { error } = await supabase.rpc("save_subscription_types", {
    p_owner_pin: ownerPin,
    p_value: next,
  });
  if (error) throw error;
}

export async function getEntriesForLocation(locationId, pin, date) {
  const { data, error } = await supabase.rpc("get_entries_for_location", {
    p_location_id: locationId,
    p_pin: pin,
    p_date: date,
  });
  if (error) throw error;
  return data.map(mapEntryFromDb);
}

export async function getEntriesAdmin(ownerPin) {
  const { data, error } = await supabase.rpc("get_entries_admin", { p_owner_pin: ownerPin });
  if (error) throw error;
  return data.map(mapEntryFromDb);
}

export async function addEntry(entry, pin) {
  const { error } = await supabase.rpc("add_entry", {
    p_location_id: entry.locationId,
    p_pin: pin,
    p_id: entry.id,
    p_date: entry.date,
    p_contanti: entry.contanti,
    p_contanti_inviato: entry.contantiInviato,
    p_pos: entry.pos,
    p_altro_incasso: entry.altroIncasso,
    p_spese: entry.spese,
    p_note: entry.note,
    p_cliente: entry.cliente,
    p_abbonamento: entry.abbonamento,
    p_operatore: entry.operatore,
    p_entered_at: entry.enteredAt,
  });
  if (error) throw error;
}

export async function deleteEntry(id, locationId, pin) {
  const { error } = await supabase.rpc("delete_entry", {
    p_id: id,
    p_location_id: locationId,
    p_pin: pin,
  });
  if (error) throw error;
}

export async function clearAllEntries(ownerPin) {
  const { error } = await supabase.rpc("clear_all_entries", { p_owner_pin: ownerPin });
  if (error) throw error;
}

export async function getCashFloat(locationId, pin, date) {
  const { data, error } = await supabase.rpc("get_cash_float", {
    p_location_id: locationId,
    p_pin: pin,
    p_date: date,
  });
  if (error) throw error;
  return data != null ? Number(data) : null;
}

export async function getCashFloatsAdmin(ownerPin) {
  const { data, error } = await supabase.rpc("get_cash_floats_admin", { p_owner_pin: ownerPin });
  if (error) throw error;
  return data.map((row) => ({
    locationId: row.location_id,
    date: row.date,
    amount: Number(row.amount),
  }));
}

export async function setCashFloat(locationId, pin, date, amount) {
  const { error } = await supabase.rpc("set_cash_float", {
    p_location_id: locationId,
    p_pin: pin,
    p_date: date,
    p_amount: amount,
  });
  if (error) throw error;
}

function mapClosureFromDb(row) {
  return {
    id: row.id,
    locationId: row.location_id,
    date: row.date,
    contanti: Number(row.contanti) || 0,
    pos: Number(row.pos) || 0,
    altroIncasso: Number(row.altro_incasso) || 0,
    totaleUscite: Number(row.totale_uscite) || 0,
    fondoCassa: row.fondo_cassa != null ? Number(row.fondo_cassa) : null,
    operatore: row.operatore || "",
    submittedAt: row.submitted_at,
    reopenRequested: Boolean(row.reopen_requested),
  };
}

export async function getClosure(locationId, pin, date) {
  const { data, error } = await supabase.rpc("get_closure", {
    p_location_id: locationId,
    p_pin: pin,
    p_date: date,
  });
  if (error) throw error;
  return data && data[0] ? mapClosureFromDb(data[0]) : null;
}

export async function getClosuresAdmin(ownerPin) {
  const { data, error } = await supabase.rpc("get_closures_admin", { p_owner_pin: ownerPin });
  if (error) throw error;
  return data.map(mapClosureFromDb);
}

export async function submitClosure(closure, pin) {
  const { error } = await supabase.rpc("submit_closure", {
    p_location_id: closure.locationId,
    p_pin: pin,
    p_id: closure.id,
    p_date: closure.date,
    p_contanti: closure.contanti,
    p_pos: closure.pos,
    p_altro_incasso: closure.altroIncasso,
    p_totale_uscite: closure.totaleUscite,
    p_fondo_cassa: closure.fondoCassa,
    p_operatore: closure.operatore,
    p_submitted_at: closure.submittedAt,
  });
  if (error) throw error;
}

export async function editClosure(closure, ownerPin) {
  const { error } = await supabase.rpc("edit_closure", {
    p_owner_pin: ownerPin,
    p_id: closure.id,
    p_contanti: closure.contanti,
    p_pos: closure.pos,
    p_altro_incasso: closure.altroIncasso,
    p_totale_uscite: closure.totaleUscite,
    p_fondo_cassa: closure.fondoCassa,
  });
  if (error) throw error;
}

export async function reopenClosure(id, ownerPin) {
  const { error } = await supabase.rpc("reopen_closure", { p_owner_pin: ownerPin, p_id: id });
  if (error) throw error;
}

export async function requestClosureReopen(id, locationId, pin) {
  const { error } = await supabase.rpc("request_closure_reopen", {
    p_location_id: locationId,
    p_pin: pin,
    p_id: id,
  });
  if (error) throw error;
}

export async function dismissClosureReopenRequest(id, ownerPin) {
  const { error } = await supabase.rpc("dismiss_closure_reopen_request", {
    p_owner_pin: ownerPin,
    p_id: id,
  });
  if (error) throw error;
}
