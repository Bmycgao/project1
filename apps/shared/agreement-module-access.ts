/** A module key is the stable permission identity across pages and workflows. */
export function isCustomAgreementModule(key: string) {
  return /^custom_[A-Za-z0-9_]+$/.test(key);
}

export function agreementModuleAuthCode(key: string, configured?: string) {
  // Old saved pages and published snapshots use one shared `custom` code.
  // Resolve by key so they obey the same per-module grants as new pages.
  return isCustomAgreementModule(key)
    ? `Agree:Module:${key}`
    : configured || `Agree:Module:${key}`;
}

export function canAccessAgreementModule(
  codes: string[] | undefined,
  key: string,
  configured?: string,
) {
  const granted = new Set(codes || []);
  if (granted.has('Agree:*') || granted.has('Agree:Module:*')) return true;
  if (granted.has(agreementModuleAuthCode(key, configured))) return true;
  return key === 'population' && granted.has('Agree:Module:rightHolders');
}
