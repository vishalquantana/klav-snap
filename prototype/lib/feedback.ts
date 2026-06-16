// Pure helpers for assembling a Plane issue body from a feedback report.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildIssueHtml(description: string, pageUrl: string, imageUrls: string[]): string {
  const parts = [
    `<p>${escapeHtml(description)}</p>`,
    `<p><strong>Page:</strong> ${escapeHtml(pageUrl)}</p>`,
  ]
  for (let i = 0; i < imageUrls.length; i++) {
    // imageUrls come from our own S3 upload, so they are safe to use as attribute values.
    parts.push(`<p><img src="${imageUrls[i]}" alt="screenshot ${i + 1}" /></p>`)
  }
  if (imageUrls.length) {
    const links = imageUrls.map((u, i) => `<a href="${u}">${i + 1}</a>`).join(' ')
    parts.push(`<p><strong>Screenshots:</strong> ${links}</p>`)
  }
  return parts.join('')
}
