import { useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  Play,
  Plus,
  ShoppingBag,
  Square,
} from 'lucide-react'
import FilterModal from './FilterModal'
import FilterTable from './FilterTable'
import ItemsTable from './ItemsTable'
import {
  createFilter,
  deleteFilter,
  getFilters,
  getItems,
  resetItems,
  searchItems,
  startAll,
  stopAll,
  toggleFilter,
  updateFilter,
} from '../services/api'

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('filters')
  const [filters, setFilters] = useState([])
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [loadingFilters, setLoadingFilters] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('create')
  const [currentFilter, setCurrentFilter] = useState(null)
  const [savingFilter, setSavingFilter] = useState(false)

  const activeFilters = useMemo(
    () => filters.filter((filter) => Boolean(filter.enabled)).length,
    [filters],
  )

  const loadFilters = async () => {
    setLoadingFilters(true)
    try {
      const rows = await getFilters()
      setFilters(safeArray(rows))
    } finally {
      setLoadingFilters(false)
    }
  }

  const loadItems = async (currentQuery = '') => {
    setLoadingItems(true)
    try {
      const rows = currentQuery.trim()
        ? await searchItems(currentQuery.trim())
        : await getItems()
      setItems(safeArray(rows))
    } finally {
      setLoadingItems(false)
    }
  }

  useEffect(() => {
    loadFilters()
    loadItems('')
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadFilters()
      loadItems(query)
    }, 12000)

    return () => window.clearInterval(intervalId)
  }, [query])

  const openCreateModal = () => {
    setModalMode('create')
    setCurrentFilter(null)
    setModalOpen(true)
  }

  const openEditModal = (filter) => {
    setModalMode('edit')
    setCurrentFilter(filter)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setCurrentFilter(null)
  }

  const handleModalSubmit = async (payload) => {
    setSavingFilter(true)
    try {
      if (modalMode === 'edit' && currentFilter?.id) {
        await updateFilter(currentFilter.id, payload)
      } else {
        await createFilter(payload)
      }
      closeModal()
      await loadFilters()
    } finally {
      setSavingFilter(false)
    }
  }

  const handleDelete = async (filterId) => {
    await deleteFilter(filterId)
    await loadFilters()
  }

  const handleToggle = async (filterId) => {
    await toggleFilter(filterId)
    await loadFilters()
  }

  const handleStartAll = async () => {
    await startAll()
    await loadFilters()
  }

  const handleStopAll = async () => {
    await stopAll()
    await loadFilters()
  }

  const handleResetItems = async () => {
    const confirmed = window.confirm('Esto eliminara todos los productos detectados. Quieres continuar?')
    if (!confirmed) return
    await resetItems()
    await loadItems('')
  }

  const isFiltersTab = activeTab === 'filters'

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-[260px_1fr]">
        <aside className="card relative overflow-hidden bg-gradient-to-b from-white to-emerald-50/40 p-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-emerald-100 blur-2xl" />
          <div className="relative">
            <div className="mb-8 flex items-center gap-3">
              <div className="rounded-xl bg-emerald-500 p-2 text-white shadow">
                <LayoutDashboard className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">VCalls</h1>
                <p className="text-xs text-gray-500">Wallapop Control Center</p>
              </div>
            </div>

            <nav className="space-y-2">
              <button
                type="button"
                onClick={() => setActiveTab('filters')}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isFiltersTab
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <ListFilter className="h-4 w-4" />
                Filtros
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('items')}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  !isFiltersTab
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <ShoppingBag className="h-4 w-4" />
                Items detectados
              </button>
            </nav>

            <div className="mt-8 space-y-3 text-sm">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-gray-500">Filtros totales</p>
                <p className="text-2xl font-bold text-gray-900">{filters.length}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-gray-500">Filtros activos</p>
                <p className="text-2xl font-bold text-emerald-600">{activeFilters}</p>
              </div>
            </div>
          </div>
        </aside>

        <main className="space-y-4">
          <header className="card p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Panel de gestion</h2>
                <p className="text-sm text-gray-500">
                  Administra filtros, estado de ejecucion e items detectados.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600"
                >
                  <Plus className="h-4 w-4" />
                  Anadir filtro
                </button>
                <button
                  type="button"
                  onClick={handleStartAll}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700"
                >
                  <Play className="h-4 w-4" />
                  Start all
                </button>
                <button
                  type="button"
                  onClick={handleStopAll}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
                >
                  <Square className="h-4 w-4" />
                  Stop all
                </button>
              </div>
            </div>
          </header>

          {isFiltersTab ? (
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                {loadingFilters ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Actualizando filtros...
                  </>
                ) : (
                  <span>Vista de filtros Wallapop</span>
                )}
              </div>
              <FilterTable
                filters={filters}
                onEdit={openEditModal}
                onDelete={handleDelete}
                onToggle={handleToggle}
              />
            </section>
          ) : (
            <section>
              <ItemsTable
                items={items}
                query={query}
                onQueryChange={setQuery}
                onSearch={() => loadItems(query)}
                onReset={() => {
                  setQuery('')
                  handleResetItems()
                }}
                loading={loadingItems}
              />
            </section>
          )}
        </main>
      </div>

      <FilterModal
        key={`${modalMode}-${currentFilter?.id || 'new'}-${modalOpen ? 'open' : 'closed'}`}
        open={modalOpen}
        mode={modalMode}
        initialData={currentFilter}
        onClose={closeModal}
        onSubmit={handleModalSubmit}
        saving={savingFilter}
      />
    </div>
  )
}
