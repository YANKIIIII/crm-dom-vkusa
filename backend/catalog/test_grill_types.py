import pytest
from rest_framework.test import APIClient

from catalog.models import ProductCard, ProductCategory, Supplier
from clients.models import Client
from users.models import User

GRILL_TYPES_URL = '/api/v1/catalog/grill_types/'
PRODUCT_CARDS_URL = '/api/v1/catalog/product_cards/'
CLIENTS_URL = '/api/v1/clients/clients/'


def _api(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _users():
    manager = User.objects.create_user(
        username='grill_mgr', email='grillmgr@test.com', password='pwd', role='manager',
    )
    seller = User.objects.create_user(
        username='grill_sel', email='grillsel@test.com', password='pwd', role='seller',
    )
    return manager, seller


def _product(**kwargs):
    category = ProductCategory.objects.create(name='Грили', code='A')
    supplier = Supplier.objects.create(name='Weber')
    defaults = {
        'name': 'Genesis',
        'sku': 'G-GRILL',
        'category': category,
        'supplier': supplier,
        'base_cost_price': 100,
    }
    defaults.update(kwargs)
    return ProductCard.objects.create(**defaults)


@pytest.mark.django_db
def test_manager_can_create_and_rename_grill_type():
    manager, _ = _users()
    api = _api(manager)
    created = api.post(GRILL_TYPES_URL, {'name': 'Инфракрасный'})
    assert created.status_code == 201, created.data
    assert created.data['name'] == 'Инфракрасный'
    assert created.data['code']
    assert created.data['code'] != 'Инфракрасный'

    patched = api.patch(f'{GRILL_TYPES_URL}{created.data["id"]}/', {
        'name': 'ИК-гриль',
        'code': 'hijacked',
    })
    assert patched.status_code == 200, patched.data
    assert patched.data['name'] == 'ИК-гриль'
    assert patched.data['code'] == created.data['code']


@pytest.mark.django_db
def test_seller_can_read_but_not_create_grill_type():
    _, seller = _users()
    api = _api(seller)
    listed = api.get(GRILL_TYPES_URL)
    assert listed.status_code == 200
    created = api.post(GRILL_TYPES_URL, {'name': 'Секретный'})
    assert created.status_code == 403


@pytest.mark.django_db
def test_cannot_delete_grill_type_used_by_product_or_client():
    manager, _ = _users()
    api = _api(manager)
    created = api.post(GRILL_TYPES_URL, {'name': 'Газовый'})
    assert created.status_code == 201, created.data
    code = created.data['code']
    grill_id = created.data['id']

    unused = api.post(GRILL_TYPES_URL, {'name': 'Пеллетный'})
    assert unused.status_code == 201, unused.data
    deleted_unused = api.delete(f'{GRILL_TYPES_URL}{unused.data["id"]}/')
    assert deleted_unused.status_code == 204

    product = _product(grill_type=code)
    blocked_product = api.delete(f'{GRILL_TYPES_URL}{grill_id}/')
    assert blocked_product.status_code == 400
    product.delete()

    Client.objects.create(first_name='Анна', seller=manager, grill_type=code)
    blocked_client = api.delete(f'{GRILL_TYPES_URL}{grill_id}/')
    assert blocked_client.status_code == 400


@pytest.mark.django_db
def test_product_and_client_use_editable_grill_type():
    manager, _ = _users()
    api = _api(manager)
    created = api.post(GRILL_TYPES_URL, {'name': 'Инфракрасный'})
    assert created.status_code == 201, created.data
    code = created.data['code']

    product = _product()
    patched = api.patch(f'{PRODUCT_CARDS_URL}{product.pk}/', {'grill_type': code})
    assert patched.status_code == 200, patched.data
    assert patched.data['grill_type'] == code
    assert patched.data['grill_type_name'] == 'Инфракрасный'

    renamed = api.patch(f'{GRILL_TYPES_URL}{created.data["id"]}/', {'name': 'ИК'})
    assert renamed.status_code == 200, renamed.data

    client = Client.objects.create(first_name='Анна', seller=manager, grill_type=code)
    listed = api.get(CLIENTS_URL)
    assert listed.status_code == 200
    rows = listed.data['results'] if isinstance(listed.data, dict) else listed.data
    match = next(row for row in rows if row['id'] == client.pk)
    assert match['grill_type'] == code
    assert match['grill_type_display'] == 'ИК'

    searched = api.get(PRODUCT_CARDS_URL, {'search': 'ИК'})
    assert searched.status_code == 200
    products = searched.data['results'] if isinstance(searched.data, dict) else searched.data
    assert any(row['id'] == product.pk for row in products)


@pytest.mark.django_db
def test_unknown_grill_type_rejected_on_product_card():
    manager, _ = _users()
    api = _api(manager)
    product = _product()
    response = api.patch(f'{PRODUCT_CARDS_URL}{product.pk}/', {'grill_type': 'nope'})
    assert response.status_code == 400
