export interface LocalMaterial {
  hash: string
  fileName: string
  mimeType: string
  dataUrl: string
}

export type LocalMaterialKind = 'approval' | 'evidence'

const STORAGE_PREFIX = 'goodfund:material:'

function storageKey(hash: string) {
  return `${STORAGE_PREFIX}${hash.toLowerCase()}`
}

export function localMaterialUri(kind: LocalMaterialKind, hash: string) {
  return `local-demo://${kind}/${hash.toLowerCase().replace(/^0x/, '')}`
}

export function saveLocalMaterial(kind: LocalMaterialKind, material: LocalMaterial) {
  window.localStorage.setItem(storageKey(material.hash), JSON.stringify(material))
  return localMaterialUri(kind, material.hash)
}

export function getLocalMaterial(uri: string) {
  if (!uri.startsWith('local-demo://approval/') && !uri.startsWith('local-demo://evidence/')) return null
  const hash = `0x${uri.split('/').at(-1) ?? ''}`.toLowerCase()
  const stored = window.localStorage.getItem(storageKey(hash))
  if (!stored) return null
  try {
    const material = JSON.parse(stored) as LocalMaterial
    return material.hash.toLowerCase() === hash ? material : null
  } catch {
    return null
  }
}

export function materialHref(uri: string) {
  if (!uri) return ''
  if (uri.startsWith('local-demo://')) return getLocalMaterial(uri)?.dataUrl ?? ''
  return uri
}

export async function materialBlob(uri: string) {
  const href = materialHref(uri)
  if (!href) throw new Error('The material is not available in this browser.')
  const response = await fetch(href, { cache: 'no-store' })
  if (!response.ok) throw new Error('Unable to load the material.')
  return response.blob()
}
