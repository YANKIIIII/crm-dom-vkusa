import { useEffect, useState } from 'react';
import {
  Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle,
  List, ListItemButton, ListItemText, TextField, Typography,
} from '@mui/material';
import api from '../api';
import { extractApiError, unwrapList } from '../utils';
import { useFeedback } from '../hooks/useFeedback';

const EMPTY_FORM = { first_name: '', last_name: '', phone: '' };
const MATCH_LIMIT = 6;
const MIN_QUERY = 2;
const DEBOUNCE_MS = 280;

const clientLabel = (client) => (
  `${client.first_name || ''} ${client.last_name || ''}`.trim() || `Клиент #${client.id}`
);

const searchQuery = (form) => (
  [form.first_name, form.last_name, form.phone]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ')
);

const ClientPickerDialog = ({ open, onClose, onSelect }) => {
  const { notify } = useFeedback();
  const [form, setForm] = useState(EMPTY_FORM);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setForm(EMPTY_FORM);
    setMatches([]);
    setLoading(false);
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const query = searchQuery(form);
    if (query.length < MIN_QUERY) {
      setMatches([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      api.get('/clients/clients/', { params: { search: query, page_size: MATCH_LIMIT } })
        .then((response) => {
          if (!cancelled) setMatches(unwrapList(response.data).slice(0, MATCH_LIMIT));
        })
        .catch(() => {
          if (!cancelled) setMatches([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form, open]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleClose = () => {
    if (!saving) onClose();
  };

  const handleCreate = async () => {
    const firstName = form.first_name.trim();
    const phone = form.phone.trim();
    if (!firstName || !phone) {
      notify('Укажите имя и телефон клиента', 'warning');
      return;
    }
    setSaving(true);
    try {
      const created = await api.post('/clients/clients/', {
        first_name: firstName,
        last_name: form.last_name.trim(),
        phone,
      });
      onSelect(created.data);
      notify('Клиент создан', 'success');
    } catch (error) {
      notify(`Не удалось создать клиента:\n${extractApiError(error)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const query = searchQuery(form);
  const showMatches = query.length >= MIN_QUERY;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3, px: 1, py: 0.5 } } }}
    >
      <DialogTitle sx={{ pb: 1, fontWeight: 500, color: '#1A202C' }}>
        Клиент
      </DialogTitle>
      <DialogContent sx={{ pt: 1, pb: 2.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField
            autoFocus
            fullWidth
            required
            label="Имя"
            value={form.first_name}
            onChange={handleChange('first_name')}
          />
          <TextField
            fullWidth
            label="Фамилия"
            value={form.last_name}
            onChange={handleChange('last_name')}
          />
          <TextField
            fullWidth
            required
            label="Телефон"
            placeholder="+375..."
            value={form.phone}
            onChange={handleChange('phone')}
            onKeyDown={(event) => event.key === 'Enter' && handleCreate()}
          />

          {showMatches && (
            <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 2, overflow: 'hidden' }}>
              <Typography variant="caption" sx={{ color: '#718096', display: 'block', px: 1.5, pt: 1, pb: 0.5 }}>
                Совпадения
              </Typography>
              {loading && matches.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
                  <CircularProgress size={22} />
                </Box>
              ) : matches.length === 0 ? (
                <Typography variant="body2" sx={{ color: '#A0AEC0', px: 1.5, py: 1 }}>
                  Никого не нашли
                </Typography>
              ) : (
                <List dense disablePadding sx={{ maxHeight: 168, overflow: 'auto' }}>
                  {matches.map((client) => (
                    <ListItemButton
                      key={client.id}
                      disabled={saving}
                      onClick={() => onSelect(client)}
                    >
                      <ListItemText
                        primary={clientLabel(client)}
                        secondary={client.primary_phone || client.email || undefined}
                      />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Box>
          )}

          <Button
            fullWidth
            variant="contained"
            disabled={saving}
            onClick={handleCreate}
            sx={{ py: 1.25, mt: 0.5 }}
          >
            {saving ? <CircularProgress size={22} color="inherit" /> : 'Создать и выбрать'}
          </Button>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button color="primary" disabled={saving} onClick={handleClose}>
              Отмена
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default ClientPickerDialog;
