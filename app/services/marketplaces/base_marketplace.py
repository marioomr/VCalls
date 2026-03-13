from abc import ABC, abstractmethod


class MarketplaceService(ABC):
    @abstractmethod
    def search(self, filters: dict) -> list:
        """Search marketplace with generic filters and return normalized items."""
        raise NotImplementedError
