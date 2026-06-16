import { test, expect } from 'bun:test'
import { s3Key } from './s3'

test('s3Key joins folder, timestamp, id and extension', () => {
  const key = s3Key('uploads', 1750000000000, 'abc123', 'png')
  expect(key).toBe('uploads/1750000000000-abc123.png')
})

test('s3Key trims a trailing slash on the folder', () => {
  expect(s3Key('uploads/', 1, 'x', 'jpg')).toBe('uploads/1-x.jpg')
})
