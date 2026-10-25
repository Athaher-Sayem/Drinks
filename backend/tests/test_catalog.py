def test_health_and_openapi(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["payments_enabled"] is False
    assert client.get("/docs").status_code == 200
    assert "/api/v1/products" in client.get("/openapi.json").json()["paths"]


def test_public_catalog_is_generic_searchable_and_paginated(client, product):
    result = client.get("/api/v1/products").json()
    assert result["total"] == 1
    item = result["items"][0]
    assert item["attributes"] == {"material": "cotton"}
    assert item["variants"][0]["options"] == {"color": "natural"}
    assert item["variants"][0]["price"] == "12.50"
    assert "stock" not in item["variants"][0]
    assert client.get("/api/v1/products?search=tote").json()["total"] == 1
    assert client.get("/api/v1/products?search=missing").json()["total"] == 0
    assert client.get("/api/v1/products?category=everyday").json()["total"] == 1
    assert client.get("/api/v1/products?min_price=20").json()["total"] == 0
    assert client.get("/api/v1/products?limit=1000").status_code == 422
    assert client.get("/api/v1/categories").json()["total"] == 1


def test_inactive_products_hidden(client, product, db):
    product.active = False
    db.commit()
    assert client.get("/api/v1/products").json()["total"] == 0
    assert client.get(f"/api/v1/products/{product.slug}").status_code == 404


def test_customer_cannot_manage_products(customer):
    assert (
        customer.post("/api/v1/admin/categories", json={"name": "Tea", "slug": "tea"}).status_code
        == 403
    )


def test_admin_creates_different_product_types(admin):
    category = admin.post("/api/v1/admin/categories", json={"name": "Goods", "slug": "goods"})
    assert category.status_code == 201
    for name, slug, attributes, options in [
        ("Iced Tea", "iced-tea", {"ingredients": "Tea, water"}, {"volume": "12 oz"}),
        ("Cotton Shirt", "cotton-shirt", {"material": "cotton"}, {"size": "M", "color": "navy"}),
    ]:
        product = admin.post(
            "/api/v1/admin/products",
            json={
                "name": name,
                "slug": slug,
                "category_id": category.json()["id"],
                "attributes": attributes,
            },
        )
        assert product.status_code == 201, product.text
        variant = admin.post(
            "/api/v1/admin/variants",
            json={
                "product_id": product.json()["id"],
                "name": "Default",
                "sku": slug,
                "price": "9.00",
                "initial_stock": 5,
                "options": options,
            },
        )
        assert variant.status_code == 201, variant.text
    assert admin.get("/api/v1/products").json()["total"] == 2


def test_store_settings_are_per_deployment(admin):
    initial = admin.get("/api/v1/store").json()
    assert initial["currency"] == "USD"
    result = admin.patch("/api/v1/admin/store", json={"name": "Another Store", "currency": "GBP"})
    assert result.status_code == 200
    assert admin.get("/api/v1/store").json()["name"] == "Another Store"
