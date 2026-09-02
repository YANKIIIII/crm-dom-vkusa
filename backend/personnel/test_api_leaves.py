import pytest
from rest_framework.test import APIClient

from common.models import AuditLog
from users.models import User

LEAVES = '/api/v1/personnel/leaves/'


def _api(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_seller_cannot_list_leaves():
    seller = User.objects.create_user(
        username='lv_sel', email='lvsel@test.com', password='pwd', role='seller',
    )
    assert _api(seller).get(LEAVES).status_code == 403


@pytest.mark.django_db
def test_leave_spans_and_invalid_range():
    manager = User.objects.create_user(
        username='lv_mgr', email='lvmgr@test.com', password='pwd', role='manager',
    )
    seller = User.objects.create_user(
        username='lv_s2', email='lvs2@test.com', password='pwd', role='seller',
    )
    api = _api(manager)
    created = api.post(LEAVES, {
        'user': seller.pk,
        'kind': 'vacation',
        'date_from': '2026-08-25',
        'date_to': '2026-09-05',
        'comment': 'море',
    }, format='json')
    assert created.status_code == 201, created.data
    assert created.data['kind'] == 'vacation'
    assert created.data['user']['id'] == seller.pk
    aug = api.get(LEAVES, {'year': 2026, 'month': 8})
    sept = api.get(LEAVES, {'year': 2026, 'month': 9})
    assert any(x['id'] == created.data['id'] for x in aug.data)
    assert any(x['id'] == created.data['id'] for x in sept.data)
    bad = api.post(LEAVES, {
        'user': seller.pk,
        'kind': 'time_off',
        'date_from': '2026-09-10',
        'date_to': '2026-09-01',
    }, format='json')
    assert bad.status_code == 400
    deleted = api.delete(f'{LEAVES}{created.data["id"]}/')
    assert deleted.status_code == 204
    assert AuditLog.objects.filter(entity_type='personnel_leave', action='DELETE').exists()
