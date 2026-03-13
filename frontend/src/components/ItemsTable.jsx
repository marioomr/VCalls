import { ExternalLink, Search } from 'lucide-react'

export default function ItemsTable({
  items,
  query,
  onQueryChange,
  onSearch,
  onReset,
  loading,
}) {
  const handleSubmit = (event) => {
    event.preventDefault()
    onSearch()
  }

  return (
    <div className="space-y-4">
      <form className="card p-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Buscar por titulo"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
            >
              Buscar
            </button>
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Reset (Borrar todos)
            </button>
          </div>
        </div>
      </form>

      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="table-header-cell">Titulo</th>
                <th className="table-header-cell">Precio</th>
                <th className="table-header-cell">Ciudad</th>
                <th className="table-header-cell">Fecha</th>
                <th className="table-header-cell">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {items.length === 0 ? (
                <tr>
                  <td className="table-body-cell" colSpan={5}>
                    {loading ? 'Cargando items...' : 'No hay items detectados.'}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id || item.item_id} className="transition hover:bg-emerald-50/40">
                    <td className="table-body-cell font-medium text-gray-900">{item.title || '-'}</td>
                    <td className="table-body-cell text-gray-600">{item.price ?? '-'}</td>
                    <td className="table-body-cell text-gray-600">{item.city || '-'}</td>
                    <td className="table-body-cell text-gray-600">{item.detected_at || '-'}</td>
                    <td className="table-body-cell">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-700"
                        >
                          Abrir
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
