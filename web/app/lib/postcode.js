// UK postcode -> coordinates, via postcodes.io (free, open data, no key).
// The postcode is checked locally first so junk never leaves the device.

// Outward code + inward code, the shape every UK postcode has.
const UK_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/;
const ENDPOINT = "https://api.postcodes.io/postcodes/";

/** "rm139aa" -> "RM13 9AA", or null if it is not a UK postcode. */
export function normalizePostcode(value) {
  const match = String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ").match(UK_POSTCODE);
  return match ? `${match[1]} ${match[2]}` : null;
}

/**
 * @returns {Promise<{ postcode: string, latitude: number, longitude: number }>}
 */
export async function lookupPostcode(value, fetcher = fetch) {
  const postcode = normalizePostcode(value);
  if (!postcode) throw new Error("Please enter a valid UK postcode, like RM13 9AA.");

  let response;
  try {
    response = await fetcher(`${ENDPOINT}${encodeURIComponent(postcode)}`);
  } catch {
    throw new Error("We could not check that postcode. Please check your connection and try again.");
  }
  if (!response.ok) throw new Error(`We could not find ${postcode}. Please check it and try again.`);

  const data = await response.json();
  const result = data?.result;
  if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
    throw new Error(`We could not find ${postcode}. Please check it and try again.`);
  }
  return { postcode: result.postcode, latitude: result.latitude, longitude: result.longitude };
}

/**
 * Coordinates -> nearest postcode, for "use my location". Delivery zones are
 * by postcode, so a GPS fix has to become one.
 * @returns {Promise<string>}
 */
export async function postcodeAt({ latitude, longitude }, fetcher = fetch) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("We could not read your location.");
  let response;
  try {
    response = await fetcher(`${ENDPOINT}?lon=${longitude}&lat=${latitude}&limit=1`);
  } catch {
    throw new Error("We could not check your location. Please enter your postcode instead.");
  }
  const data = response.ok ? await response.json() : null;
  const postcode = normalizePostcode(data?.result?.[0]?.postcode);
  if (!postcode) throw new Error("We could not find a postcode where you are. Please enter it instead.");
  return postcode;
}
