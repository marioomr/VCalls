import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { useMemo, useState } from 'react'
import { Save, X } from 'lucide-react'
import CategorySelector from './CategorySelector'

function parseNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null
  const num = Number(value)
  return Number.isNaN(num) ? null : num
}

const EMPTY_FORM = {
  name: '',
  marketplace: 'wallapop',
  keywords: '',
  min_price: '',
  max_price: '',
  brand: '',
  condition: '',
  color: '',
  size: '',
  is_shippable: false,
  latitude: '',
  longitude: '',
  distance_km: '',
  enabled: true,
  category_id: null,
  subcategory_id: null,
}

const BRAND_OPTIONS = ['Nike', 'Adidas']
const CONDITION_OPTIONS = [
  { value: 'new', label: 'Nuevo' },
  { value: 'as_good_as_new', label: 'Como nuevo' },
  { value: 'good', label: 'Buen estado' },
  { value: 'fair', label: 'Aceptable' },
]

const COLOR_OPTIONS = ['black', 'white', 'blue', 'red', 'green', 'beige']
const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL']

function createFormFromInitial(initialData) {
  if (!initialData) return EMPTY_FORM

  return {
    name: initialData.name || '',
    marketplace: initialData.marketplace || 'wallapop',
    keywords: initialData.keywords || '',
    min_price:
      initialData.min_price === null || initialData.min_price === undefined
        ? ''
        : String(initialData.min_price),
    max_price:
      initialData.max_price === null || initialData.max_price === undefined
        ? ''
        : String(initialData.max_price),
    brand: initialData.brand || '',
    condition: initialData.condition || '',
    color: initialData.color || '',
    size: initialData.size || '',
    is_shippable: initialData.is_shippable ?? false,
    latitude:
      initialData.latitude === null || initialData.latitude === undefined
        ? ''
        : String(initialData.latitude),
    longitude:
      initialData.longitude === null || initialData.longitude === undefined
        ? ''
        : String(initialData.longitude),
    distance_km:
      initialData.distance_km === null || initialData.distance_km === undefined
        ? ''
        : String(initialData.distance_km),
    enabled: initialData.enabled ?? true,
    category_id:
      initialData.category_id === null || initialData.category_id === undefined
        ? null
        : Number(initialData.category_id),
    subcategory_id:
      initialData.subcategory_id === null || initialData.subcategory_id === undefined
        ? null
        : Number(initialData.subcategory_id),
  }
}

export default function FilterModal({
  open,
  mode,
  initialData,
  onClose,
  onSubmit,
  saving,
}) {
  const [form, setForm] = useState(() => createFormFromInitial(initialData))

  const title = useMemo(
    () => (mode === 'edit' ? 'Editar filtro' : 'Anadir filtro'),
    [mode],
  )

  const handleInput = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const submit = (event) => {
    event.preventDefault()
    onSubmit({
      name: form.name.trim(),
      marketplace: form.marketplace.trim().toLowerCase() || 'wallapop',
      keywords: form.keywords.trim(),
      category_id: form.category_id,
      subcategory_id: form.subcategory_id,
      min_price: parseNumberOrNull(form.min_price),
      max_price: parseNumberOrNull(form.max_price),
      brand: form.brand.trim() || null,
      condition: form.condition.trim() || null,
      color: form.color.trim() || null,
      size: form.size.trim() || null,
      is_shippable: Boolean(form.is_shippable),
      latitude: parseNumberOrNull(form.latitude),
      longitude: parseNumberOrNull(form.longitude),
      distance_km: parseNumberOrNull(form.distance_km),
      enabled: Boolean(form.enabled),
    })
  }

  const toggleCsvValue = (fieldName, value) => {
    const current = form[fieldName]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)

    const exists = current.includes(value)
    const next = exists ? current.filter((item) => item !== value) : [...current, value]

    setForm((prev) => ({
      ...prev,
      [fieldName]: next.join(','),
    }))
  }

  const hasCsvValue = (fieldName, value) => {
    return form[fieldName]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .includes(value)
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-gray-950/30" aria-hidden="true" />

      <div className="fixed inset-0 overflow-y-auto p-4">
        <div className="mx-auto flex min-h-full max-w-3xl items-center justify-center">
          <DialogPanel className="w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <DialogTitle className="text-xl font-semibold text-gray-900">
                  {title}
                </DialogTitle>
                <p className="mt-1 text-sm text-gray-500">
                  Configura tu monitor de Wallapop con reglas precisas.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={submit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Nombre</label>
                  <input
                    required
                    name="name"
                    value={form.name}
                    onChange={handleInput}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    placeholder="Ej: Nike Jordan baratas"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Keywords</label>
                  <input
                    name="keywords"
                    value={form.keywords}
                    onChange={handleInput}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    placeholder="nike jordan retro"
                  />
                </div>
              </div>

              <CategorySelector
                value={{
                  category_id: form.category_id,
                  subcategory_id: form.subcategory_id,
                }}
                onChange={({ category_id, subcategory_id }) => {
                  setForm((prev) => ({
                    ...prev,
                    category_id,
                    subcategory_id,
                  }))
                }}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-2 text-sm font-medium text-gray-700">Brand</p>
                  <div className="flex flex-wrap gap-2">
                    {BRAND_OPTIONS.map((brandValue) => (
                      <label key={brandValue} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-1 text-xs">
                        <input
                          type="checkbox"
                          checked={hasCsvValue('brand', brandValue)}
                          onChange={() => toggleCsvValue('brand', brandValue)}
                        />
                        {brandValue}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-2 text-sm font-medium text-gray-700">Condition</p>
                  <div className="flex flex-wrap gap-2">
                    {CONDITION_OPTIONS.map((option) => (
                      <label key={option.value} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-1 text-xs">
                        <input
                          type="checkbox"
                          checked={hasCsvValue('condition', option.value)}
                          onChange={() => toggleCsvValue('condition', option.value)}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-2 text-sm font-medium text-gray-700">Color</p>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_OPTIONS.map((colorValue) => (
                      <label key={colorValue} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-1 text-xs uppercase">
                        <input
                          type="checkbox"
                          checked={hasCsvValue('color', colorValue)}
                          onChange={() => toggleCsvValue('color', colorValue)}
                        />
                        {colorValue}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-2 text-sm font-medium text-gray-700">Size</p>
                  <div className="flex flex-wrap gap-2">
                    {SIZE_OPTIONS.map((sizeValue) => (
                      <label key={sizeValue} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-1 text-xs uppercase">
                        <input
                          type="checkbox"
                          checked={hasCsvValue('size', sizeValue)}
                          onChange={() => toggleCsvValue('size', sizeValue)}
                        />
                        {sizeValue}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Marketplace</label>
                  <input
                    name="marketplace"
                    value={form.marketplace}
                    onChange={handleInput}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Precio minimo</label>
                  <input
                    type="number"
                    name="min_price"
                    step="0.01"
                    min="0"
                    value={form.min_price}
                    onChange={handleInput}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Precio maximo</label>
                  <input
                    type="number"
                    name="max_price"
                    step="0.01"
                    min="0"
                    value={form.max_price}
                    onChange={handleInput}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    name="latitude"
                    value={form.latitude}
                    onChange={handleInput}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    name="longitude"
                    value={form.longitude}
                    onChange={handleInput}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Distance km</label>
                  <input
                    type="number"
                    name="distance_km"
                    value={form.distance_km}
                    onChange={handleInput}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      enabled: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-300"
                />
                Activado
              </label>

              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_shippable}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      is_shippable: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-300"
                />
                Solo envios (is_shippable)
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Guardando...' : 'Guardar filtro'}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
