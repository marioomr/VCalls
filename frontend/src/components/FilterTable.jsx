import { Pause, Pencil, Play, Trash2 } from 'lucide-react'

const SUBCATEGORY_NAMES = {
  11004: 'Mujer / Ropa',
  11021: 'Mujer / Calzado',
  11031: 'Hombre / Ropa',
  11044: 'Hombre / Calzado',
  10152: 'Accesorios / Bolsos y mochilas',
  9550: 'Accesorios / Cinturones',
  9567: 'Accesorios / Gafas de sol',
  9610: 'Accesorios / Guantes',
  9645: 'Accesorios / Accesorios para el cabello',
  10162: 'Accesorios / Sombreros y gorras',
  10153: 'Accesorios / Bufandas y chales',
  9584: 'Accesorios / Corbatas y panuelos',
  9635: 'Accesorios / Paraguas',
  9562: 'Accesorios / Relojes',
  9607: 'Accesorios / Otros accesorios',
}

function categoryLabel(filter) {
  if (!filter?.category_id) return '-'
  if (String(filter.category_id) !== '12465') return String(filter.category_id)
  if (!filter.subcategory_id) return 'Moda y accesorios'
  return SUBCATEGORY_NAMES[filter.subcategory_id] || `Subcategoria ${filter.subcategory_id}`
}

export default function FilterTable({ filters, onEdit, onDelete, onToggle }) {
  return (
    <div className="table-shell">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              <th className="table-header-cell">Nombre</th>
              <th className="table-header-cell">Marketplace</th>
              <th className="table-header-cell">Keywords</th>
              <th className="table-header-cell">Categoria</th>
              <th className="table-header-cell">Precio min</th>
              <th className="table-header-cell">Precio max</th>
              <th className="table-header-cell">Brand</th>
              <th className="table-header-cell">Condicion</th>
              <th className="table-header-cell">Color</th>
              <th className="table-header-cell">Talla</th>
              <th className="table-header-cell">Envio</th>
              <th className="table-header-cell">Geo</th>
              <th className="table-header-cell">Estado</th>
              <th className="table-header-cell">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filters.length === 0 ? (
              <tr>
                <td className="table-body-cell" colSpan={14}>
                  No hay filtros creados.
                </td>
              </tr>
            ) : (
              filters.map((filter) => (
                <tr key={filter.id} className="transition hover:bg-emerald-50/40">
                  <td className="table-body-cell font-medium text-gray-900">{filter.name}</td>
                  <td className="table-body-cell uppercase text-gray-600">{filter.marketplace}</td>
                  <td className="table-body-cell text-gray-600">{filter.keywords || '-'}</td>
                  <td className="table-body-cell text-gray-600">{categoryLabel(filter)}</td>
                  <td className="table-body-cell text-gray-600">{filter.min_price ?? '-'}</td>
                  <td className="table-body-cell text-gray-600">{filter.max_price ?? '-'}</td>
                  <td className="table-body-cell text-gray-600">{filter.brand || '-'}</td>
                  <td className="table-body-cell text-gray-600">{filter.condition || '-'}</td>
                  <td className="table-body-cell text-gray-600">{filter.color || '-'}</td>
                  <td className="table-body-cell text-gray-600">{filter.size || '-'}</td>
                  <td className="table-body-cell text-gray-600">{filter.is_shippable ? 'Si' : 'No'}</td>
                  <td className="table-body-cell text-gray-600">
                    {filter.latitude !== null && filter.latitude !== undefined && filter.longitude !== null && filter.longitude !== undefined
                      ? `${filter.latitude}, ${filter.longitude} (${filter.distance_km || 0}km)`
                      : '-'}
                  </td>
                  <td className="table-body-cell">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        filter.enabled
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {filter.enabled ? 'Activo' : 'Pausado'}
                    </span>
                  </td>
                  <td className="table-body-cell">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(filter)}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggle(filter.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        {filter.enabled ? (
                          <>
                            <Pause className="h-3.5 w-3.5" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5" />
                            Play
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(filter.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
