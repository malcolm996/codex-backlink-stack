const DEFAULT_SPAM_PATTERN = /spam|toxic|垃圾|有毒|风险过高/i;

export function evaluateAuthority({ authorityScore = null, authorityLabel = '', spamPattern = DEFAULT_SPAM_PATTERN } = {}) {
  const label = String(authorityLabel || '').trim();
  const spamLabelDetected = spamPattern.test(label);
  return {
    decision: spamLabelDetected ? 'reject_spam' : label ? 'review' : 'manual_review_required',
    eligible: !spamLabelDetected && Boolean(label),
    spamLabelDetected,
    authorityLabelAvailable: Boolean(label),
    authorityScore: Number.isFinite(Number(authorityScore)) ? Number(authorityScore) : null,
    authorityLabel: label || null,
    reasons: [
      spamLabelDetected && 'authority_label_contains_spam_signal',
      !label && 'authority_label_unavailable'
    ].filter(Boolean)
  };
}
