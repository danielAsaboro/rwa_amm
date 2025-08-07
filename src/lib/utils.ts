import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function ellipsify(str = '', len = 4, delimiter = '..') {
  const strLen = str.length
  const limit = len * 2 + delimiter.length

  return strLen >= limit ? str.substring(0, len) + delimiter + str.substring(strLen - len, strLen) : str
}

export function shortenAddress(address?: string, head: number = 4, tail: number = 4): string {
  if (!address) return ''
  const trimmed = address.trim()
  if (trimmed.length <= head + tail + 1) return trimmed
  return `${trimmed.slice(0, head)}…${trimmed.slice(-tail)}`
}
