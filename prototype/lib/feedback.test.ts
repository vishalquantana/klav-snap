import { test, expect } from 'bun:test'
import { escapeHtml, buildIssueHtml } from './feedback'

test('escapeHtml neutralizes angle brackets, ampersands, quotes', () => {
  expect(escapeHtml('<b>&"x"')).toBe('&lt;b&gt;&amp;&quot;x&quot;')
})

test('buildIssueHtml embeds images and a link fallback, escaping text', () => {
  const html = buildIssueHtml(
    'Bug <script>',
    'https://app.example.com/p?a=1&b=2',
    ['https://ewr1.vultrobjects.com/klavity/uploads/a.png'],
  )
  expect(html).toContain('<p>Bug &lt;script&gt;</p>')
  expect(html).toContain('<strong>Page:</strong> https://app.example.com/p?a=1&amp;b=2')
  expect(html).toContain('<img src="https://ewr1.vultrobjects.com/klavity/uploads/a.png" alt="screenshot 1" />')
  expect(html).toContain('<strong>Screenshots:</strong>')
})

test('buildIssueHtml omits image/link sections when there are no screenshots', () => {
  const html = buildIssueHtml('No images', 'https://x.test', [])
  expect(html).not.toContain('<img')
  expect(html).not.toContain('Screenshots:')
})

test('buildIssueHtml surfaces the source referrer when present, escaping it', () => {
  const html = buildIssueHtml('Bug', 'https://app.example.com/p', [], undefined, 'https://news.ycombinator.com/?a=1&b=2')
  expect(html).toContain('<strong>Referred from:</strong> https://news.ycombinator.com/?a=1&amp;b=2')
})

test('buildIssueHtml omits the referrer line when not provided', () => {
  const html = buildIssueHtml('Bug', 'https://app.example.com/p', [])
  expect(html).not.toContain('Referred from:')
})
