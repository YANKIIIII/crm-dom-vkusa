from common.models import AuditLog


def write_audit(user, action, entity_type, entity_id, details=None):
    resolved = user if user is not None and getattr(user, 'pk', None) else None
    AuditLog.objects.create(
        user=resolved,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id if entity_id is not None else 0,
        details=details,
    )
