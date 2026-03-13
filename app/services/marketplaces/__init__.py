from typing import Dict, Optional

from app.services.marketplaces.base_marketplace import MarketplaceService
from app.services.marketplaces.wallapop_service import WallapopService

_MARKETPLACE_REGISTRY: Dict[str, MarketplaceService] = {
	"wallapop": WallapopService(),
}


def register_marketplace(name: str, service: MarketplaceService) -> None:
	key = str(name).strip().lower()
	if not key:
		raise ValueError("marketplace name is required")
	_MARKETPLACE_REGISTRY[key] = service


def get_marketplace_service(name: str) -> Optional[MarketplaceService]:
	return _MARKETPLACE_REGISTRY.get(str(name).strip().lower())


def list_marketplaces() -> list:
	return sorted(_MARKETPLACE_REGISTRY.keys())
