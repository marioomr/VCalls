import unittest

from app.services.marketplaces.wallapop_service import WallapopService


class WallapopParamsTest(unittest.TestCase):
    def test_brand_is_included_as_csv(self):
        service = WallapopService()
        sample_filter = {
            "name": "Nike Hombre",
            "marketplace": "wallapop",
            "keywords": "nike",
            "category": "12465",
            "subcategory": "11003",
            "brand": "Nike,Adidas",
            "min_price": 10,
            "max_price": 120,
        }

        params = service._build_query_params(sample_filter)

        self.assertEqual(params.get("brand"), "Nike,Adidas")
        self.assertEqual(params.get("category_id"), "12465")
        self.assertEqual(params.get("subcategory_ids"), "11003")


if __name__ == "__main__":
    unittest.main()
