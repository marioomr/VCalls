import axios from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
})

export async function getFilters() {
  const { data } = await client.get('/api/filters')
  return data
}

export async function createFilter(payload) {
  const { data } = await client.post('/api/filters', payload)
  return data
}

export async function updateFilter(filterId, payload) {
  const { data } = await client.put(`/api/filters/${filterId}`, payload)
  return data
}

export async function deleteFilter(filterId) {
  const { data } = await client.delete(`/api/filters/${filterId}`)
  return data
}

export async function toggleFilter(filterId) {
  const { data } = await client.post(`/api/filters/${filterId}/toggle`)
  return data
}

export async function startAll() {
  const { data } = await client.post('/api/filters/start_all')
  return data
}

export async function stopAll() {
  const { data } = await client.post('/api/filters/stop_all')
  return data
}

export async function getItems(limit = 100, offset = 0) {
  const { data } = await client.get('/api/items', {
    params: { limit, offset },
  })
  return data
}

export async function searchItems(query, limit = 100, offset = 0) {
  const { data } = await client.get('/api/items/search', {
    params: { q: query, limit, offset },
  })
  return data
}

export async function resetItems() {
  const { data } = await client.post('/api/items/reset')
  return data
}
