export const SERPER_TYPES = {
  search: "Busca web",
  images: "Imagens",
  videos: "Vídeos",
  places: "Lugares",
  maps: "Mapas",
  news: "Notícias",
  shopping: "Compras",
  scholar: "Google Acadêmico",
  patents: "Patentes",
  reviews: "Avaliações de estabelecimentos",
  lens: "Pesquisa por imagem (Lens)",
  webpage: "Extração de páginas",
  resolve: "Resolução de links",
  autocomplete: "Sugestões de busca",
} as const;

export function serperRequest(input: Record<string, unknown>) {
  const type = input.serperType ?? "search";
  const page = input.page ?? 1;
  const { query, country, language, city } = input;
  if (
    typeof type !== "string" || !Object.prototype.hasOwnProperty.call(SERPER_TYPES, type) ||
    typeof query !== "string" || query.length > 100000 ||
    typeof country !== "string" || !/^[a-z]{2}$/i.test(country) ||
    typeof language !== "string" || !/^[a-z]{2,3}(?:-[a-z]{2,4})?$/i.test(language) ||
    (city !== undefined && (typeof city !== "string" || city.length > 100)) ||
    typeof page !== "number" || !Number.isSafeInteger(page) || page < 1
  ) return null;

  const geo = {
    gl: country.toLowerCase(),
    hl: language.split("-")[0].toLowerCase(),
  };
  const url = `https://google.serper.dev/${type}`;
  const value = query.trim();

  if (type === "resolve") {
    try {
      const payload = JSON.parse(value);
      if (!payload || typeof payload !== "object") return null;
      return { type, url, payload };
    } catch {
      return null;
    }
  }

  if (type === "webpage" || type === "lens") {
    try {
      const target = new URL(value);
      if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) return null;
      if (type === "webpage") {
        return { type, url: "https://scrape.serper.dev", payload: { url: target.href, includeMarkdown: true } };
      }
      return { type, url, payload: { url: target.href, ...geo, location: city || undefined } };
    } catch {
      return null;
    }
  }

  if (type === "reviews") {
    const match = /^(cid|fid|placeId):([a-z0-9_:\-]+)$/i.exec(value);
    if (!match || value.length > 200) return null;
    const field = match[1].toLowerCase() === "placeid" ? "placeId" : match[1].toLowerCase();
    return { type, url, payload: { ...geo, [field]: match[2] } };
  }

  if (!value || value.length > 500) return null;
  return {
    type,
    url,
    payload: {
      q: type === "maps" && city ? `${value}, ${city}` : value,
      ...(type === "maps" ? { hl: geo.hl } : { ...geo, location: city || undefined }),
      page,
      ...(type === "search" ? { num: 10 } : {}),
    },
  };
}

export function serperRegionalInputs(input: Record<string, unknown>, regions: unknown) {
  if (regions === undefined) return serperRequest(input) ? [input] : null;
  if (!Array.isArray(regions) || regions.length < 1 || regions.length > 100) return null;
  if (["webpage", "resolve"].includes(String(input.serperType))) return null;
  const rows = new Map<string, Record<string, unknown>>();
  for (const region of regions) {
    if (typeof region !== "string") return null;
    const [country, language, city = "", extra] = region.split("|").map(value => value.trim());
    if (!country || !language || extra !== undefined) return null;
    if (input.serperType === "reviews" && city) return null;
    if (input.serperType === "maps" && !city) return null;
    const row = { ...input, country: country.toLowerCase(), language: language.toLowerCase(), city };
    if (!serperRequest(row)) return null;
    rows.set(JSON.stringify([row.country, row.language, city.toLowerCase()]), row);
  }
  return [...rows.values()];
}
