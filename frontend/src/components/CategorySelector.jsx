import { useMemo, useState } from 'react'

const WALLAPOP_TREE = [
  {
    id: 12465,
    name: 'Moda y accesorios',
    segments: [
      {
        id: 11002,
        name: 'Mujer',
        subcategories: [
          { id: 11004, name: 'Ropa' },
          { id: 11021, name: 'Calzado' },
        ],
      },
      {
        id: 11003,
        name: 'Hombre',
        subcategories: [
          { id: 11031, name: 'Ropa' },
          { id: 11044, name: 'Calzado' },
        ],
      },
      {
        id: 1,
        name: 'Accesorios',
        subcategories: [
          { id: 10152, name: 'Bolsos y mochilas' },
          { id: 9550, name: 'Cinturones' },
          { id: 9567, name: 'Gafas de sol' },
          { id: 9610, name: 'Guantes' },
          { id: 9645, name: 'Accesorios para el cabello' },
          { id: 10162, name: 'Sombreros y gorras' },
          { id: 10153, name: 'Bufandas y chales' },
          { id: 9584, name: 'Corbatas y panuelos' },
          { id: 9635, name: 'Paraguas' },
          { id: 9562, name: 'Relojes' },
          { id: 9607, name: 'Otros accesorios' },
        ],
      },
    ],
  },
]

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isNaN(number) ? null : number
}

function findSegmentBySubcategory(category, subcategoryId) {
  if (!category || !subcategoryId) return null
  return (
    category.segments.find((segment) =>
      segment.subcategories.some((subcategory) => subcategory.id === subcategoryId),
    ) || null
  )
}

export default function CategorySelector({ value, onChange }) {
  const categoryId = toNumber(value?.category_id)
  const subcategoryId = toNumber(value?.subcategory_id)
  const [segmentId, setSegmentId] = useState(null)

  const selectedCategory = useMemo(
    () => WALLAPOP_TREE.find((category) => category.id === categoryId) || null,
    [categoryId],
  )

  const segments = useMemo(() => selectedCategory?.segments || [], [selectedCategory])

  const inferredSegment = useMemo(
    () => findSegmentBySubcategory(selectedCategory, subcategoryId),
    [selectedCategory, subcategoryId],
  )

  const activeSegmentId = segmentId ?? inferredSegment?.id ?? null

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.id === activeSegmentId) || null,
    [segments, activeSegmentId],
  )

  const subcategories = selectedSegment?.subcategories || []

  const handleCategoryChange = (event) => {
    const nextCategoryId = toNumber(event.target.value)
    setSegmentId(null)
    onChange({
      category_id: nextCategoryId,
      subcategory_id: null,
    })
  }

  const handleSegmentChange = (event) => {
    const nextSegmentId = toNumber(event.target.value)
    setSegmentId(nextSegmentId)
    onChange({
      category_id: categoryId,
      subcategory_id: null,
    })
  }

  const handleSubcategoryChange = (event) => {
    onChange({
      category_id: categoryId,
      subcategory_id: toNumber(event.target.value),
    })
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Categoria</label>
        <select
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          value={categoryId || ''}
          onChange={handleCategoryChange}
        >
          <option value="">Selecciona categoria</option>
          {WALLAPOP_TREE.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Subgrupo</label>
        <select
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-gray-100"
          value={activeSegmentId || ''}
          disabled={!selectedCategory}
          onChange={handleSegmentChange}
        >
          <option value="">Selecciona mujer/hombre/accesorios</option>
          {segments.map((segment) => (
            <option key={segment.id} value={segment.id}>
              {segment.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Subcategoria</label>
        <select
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-gray-100"
          value={subcategoryId || ''}
          disabled={!selectedSegment}
          onChange={handleSubcategoryChange}
        >
          <option value="">Selecciona subcategoria</option>
          {subcategories.map((subcategory) => (
            <option key={subcategory.id} value={subcategory.id}>
              {subcategory.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
