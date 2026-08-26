// Pure composition validation, shared by the browser UI and node-based self tests.
// Inputs are plugin short names (e.g. "dsh-tool-fs"), the machine facts from
// data/catalog.json, and the abstract-seam map from data/curated.json.

export function normalizeName(name) {
  return name.replace(/^@deepseek-ai\//, '')
}

function push(map, key, value) {
  if (!map.has(key)) map.set(key, [])
  map.get(key).push(value)
}

/**
 * Validate a free-assembled composition.
 *
 * Rules:
 *  - dangling: a plugin injects a service no other mounted plugin provides.
 *    A Consumer without a Provider never activates.
 *  - conflict: a service has more than one "owner". A provider that also
 *    injects the service it provides (e.g. dsh-llm-pi-ai on ctx.llm) registers
 *    onto the owner's hub and does not conflict; owners replace each other,
 *    and one context holds one implementation.
 *  - bare abstract seam: an abstract seam is mounted without a concrete
 *    provider of the same service — it either crashes at boot or does nothing.
 */
export function validateComposition(names, catalog, abstractSeams = {}) {
  const active = [...new Set(names)].filter((n) => catalog[n])
  const providesOf = (n) => catalog[n]?.provides ?? []
  const injectOf = (n) => catalog[n]?.inject ?? []

  const providersByService = new Map()
  const ownersByService = new Map()
  for (const n of active) {
    for (const s of providesOf(n)) {
      push(providersByService, s, n)
      if (!injectOf(n).includes(s)) push(ownersByService, s, n)
    }
  }

  const dangling = []
  for (const n of active) {
    for (const s of injectOf(n)) {
      const others = (providersByService.get(s) ?? []).filter((p) => p !== n)
      if (others.length === 0) dangling.push({ plugin: n, service: s })
    }
  }

  const conflicts = []
  for (const [service, owners] of ownersByService) {
    if (owners.length > 1) conflicts.push({ service, plugins: owners })
  }

  const bareAbstract = []
  for (const n of active) {
    if (!abstractSeams[n]) continue
    for (const s of providesOf(n)) {
      const concrete = (ownersByService.get(s) ?? []).filter((p) => p !== n)
      if (concrete.length === 0) bareAbstract.push({ plugin: n, service: s, reason: abstractSeams[n] })
    }
  }

  const services = [...providersByService.keys()].sort()
  return {
    active,
    dangling,
    conflicts,
    bareAbstract,
    services,
    providersByService: Object.fromEntries(providersByService),
    ok: dangling.length === 0 && conflicts.length === 0 && bareAbstract.length === 0,
  }
}
