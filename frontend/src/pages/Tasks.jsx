import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Paper, TextField, Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import api from '../api';
import SearchableSelect from '../components/SearchableSelect';
import { useFeedback } from '../hooks/useFeedback';
import {
  CATALOG_PAGE_SIZE, extractApiError, formatDate, hasModule, unwrapList,
} from '../utils';

const ownerLabel = (owner) => {
  if (!owner) return '';
  const name = `${owner.last_name || ''} ${owner.first_name || ''}`.trim();
  return name || owner.username || '';
};

const todayIso = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

const isOverdue = (dueDate, listCode) => (
  Boolean(dueDate) && listCode !== 'done' && dueDate <= todayIso()
);

const EMPTY_FORM = {
  title: '',
  due_date: '',
  order: '',
  client: '',
};

const Tasks = () => {
  const { notify, confirm } = useFeedback();
  const isManager = localStorage.getItem('user_role') === 'manager';
  const username = localStorage.getItem('user_username') || '';
  const canOrders = hasModule('orders');
  const canClients = hasModule('clients');

  const [boards, setBoards] = useState([]);
  const [boardId, setBoardId] = useState('');
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [createListId, setCreateListId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [orderOptions, setOrderOptions] = useState([]);
  const [clientOptions, setClientOptions] = useState([]);
  const loadRequestId = useRef(0);

  const loadBoards = useCallback(() => {
    return api.get('/tasks/boards/').then((res) => {
      const rows = unwrapList(res.data);
      setBoards(rows);
      return rows;
    });
  }, []);

  const loadBoard = useCallback((id) => {
    if (!id) return Promise.resolve();
    const requestId = ++loadRequestId.current;
    setLoading(true);
    return api.get(`/tasks/boards/${id}/`)
      .then((res) => {
        if (requestId !== loadRequestId.current) return;
        setBoard(res.data);
        setLoadError(null);
      })
      .catch((err) => {
        if (requestId !== loadRequestId.current) return;
        setLoadError(extractApiError(err));
        notify(`Не удалось загрузить доску:\n${extractApiError(err)}`, 'error');
      })
      .finally(() => {
        if (requestId !== loadRequestId.current) return;
        setLoading(false);
      });
  }, [notify]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadBoards()
      .then((rows) => {
        if (cancelled) return;
        const mine = rows.find((row) => row.owner?.username === username) || rows[0];
        const nextId = mine ? String(mine.id) : '';
        setBoardId(nextId);
        if (nextId) return loadBoard(nextId);
        setLoading(false);
        return null;
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(extractApiError(err));
          notify(`Не удалось загрузить доски:\n${extractApiError(err)}`, 'error');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [loadBoards, loadBoard, notify, username]);

  useEffect(() => {
    if (!dialogOpen) return undefined;
    let cancelled = false;
    if (canOrders) {
      api.get(`/orders/orders/?page_size=${CATALOG_PAGE_SIZE}`)
        .then((res) => {
          if (cancelled) return;
          setOrderOptions(unwrapList(res.data).map((row) => ({
            value: row.id,
            label: `#${row.order_number}`,
          })));
        })
        .catch(() => { if (!cancelled) setOrderOptions([]); });
    }
    if (canClients) {
      api.get(`/clients/clients/?page_size=${CATALOG_PAGE_SIZE}`)
        .then((res) => {
          if (cancelled) return;
          setClientOptions(unwrapList(res.data).map((row) => ({
            value: row.id,
            label: `${row.last_name || ''} ${row.first_name || ''}`.trim() || `Клиент #${row.id}`,
          })));
        })
        .catch(() => { if (!cancelled) setClientOptions([]); });
    }
    return () => { cancelled = true; };
  }, [dialogOpen, canOrders, canClients]);

  const boardOptions = useMemo(
    () => boards.map((row) => ({ value: String(row.id), label: ownerLabel(row.owner) })),
    [boards],
  );

  const openCreate = (listId) => {
    setEditing(null);
    setCreateListId(listId);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (card) => {
    setEditing(card);
    setCreateListId(card.list);
    setForm({
      title: card.title || '',
      due_date: card.due_date || '',
      order: card.order?.id || '',
      client: card.client?.id || '',
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving) return;
    setDialogOpen(false);
  };

  const saveCard = async () => {
    const title = form.title.trim();
    if (!title) {
      setFormError('Укажите название.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      title,
      due_date: form.due_date || null,
      order: form.order || null,
      client: form.client || null,
    };
    try {
      if (editing) {
        await api.patch(`/tasks/cards/${editing.id}/`, payload);
      } else {
        await api.post('/tasks/cards/', { ...payload, list: createListId });
      }
      setDialogOpen(false);
      await loadBoard(boardId);
    } catch (err) {
      setFormError(extractApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteCard = async () => {
    if (!editing) return;
    const ok = await confirm(`Удалить карточку «${editing.title}»?`);
    if (!ok) return;
    setSaving(true);
    try {
      await api.delete(`/tasks/cards/${editing.id}/`);
      setDialogOpen(false);
      await loadBoard(boardId);
    } catch (err) {
      setFormError(extractApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const onSelectBoard = (nextId) => {
    setBoardId(nextId);
    setBoard(null);
    loadBoard(nextId);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5" fontWeight={700}>Задачи</Typography>
        {isManager && (
          <Box sx={{ minWidth: 240 }}>
            <SearchableSelect
              id="task-board-owner"
              label="Доска"
              value={boardId}
              onChange={onSelectBoard}
              options={boardOptions}
              disableClearable
            />
          </Box>
        )}
      </Box>
      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}
      {loading && !board ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', overflowX: 'auto' }}>
          {(board?.lists || []).map((column) => (
            <Paper key={column.id} sx={{ flex: '1 1 0', minWidth: 260, p: 1.5, bgcolor: '#EDF2F7' }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>{column.name}</Typography>
              {(column.cards || []).map((card) => (
                <Paper
                  key={card.id}
                  onClick={() => openEdit(card)}
                  sx={{ p: 1.5, mb: 1, cursor: 'pointer' }}
                >
                  <Typography variant="body2" fontWeight={600}>{card.title}</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                    {card.due_date && (
                      <Chip
                        size="small"
                        label={formatDate(card.due_date)}
                        color={isOverdue(card.due_date, column.code) ? 'error' : 'default'}
                      />
                    )}
                    {card.order && (
                      canOrders ? (
                        <Chip
                          size="small"
                          label={`#${card.order.order_number}`}
                          component={RouterLink}
                          to={`/orders/${card.order.id}`}
                          onClick={(event) => event.stopPropagation()}
                          clickable
                        />
                      ) : (
                        <Chip size="small" label={`#${card.order.order_number}`} />
                      )
                    )}
                    {card.client && (
                      canClients ? (
                        <Chip
                          size="small"
                          label={`${card.client.last_name || ''} ${card.client.first_name || ''}`.trim()}
                          component={RouterLink}
                          to={`/clients/${card.client.id}`}
                          onClick={(event) => event.stopPropagation()}
                          clickable
                        />
                      ) : (
                        <Chip
                          size="small"
                          label={`${card.client.last_name || ''} ${card.client.first_name || ''}`.trim()}
                        />
                      )
                    )}
                  </Box>
                </Paper>
              ))}
              <Button size="small" onClick={() => openCreate(column.id)}>+ Карточка</Button>
            </Paper>
          ))}
        </Box>
      )}

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'Карточка' : 'Новая карточка'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField
            autoFocus
            label="Название"
            required
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          />
          <TextField
            label="Срок"
            type="date"
            value={form.due_date}
            onChange={(event) => setForm((prev) => ({ ...prev, due_date: event.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          {canOrders && (
            <SearchableSelect
              id="task-card-order"
              label="Заказ"
              value={form.order}
              onChange={(value) => setForm((prev) => ({ ...prev, order: value }))}
              options={orderOptions}
            />
          )}
          {canClients && (
            <SearchableSelect
              id="task-card-client"
              label="Клиент"
              value={form.client}
              onChange={(value) => setForm((prev) => ({ ...prev, client: value }))}
              options={clientOptions}
            />
          )}
        </DialogContent>
        <DialogActions>
          {editing && (
            <Button color="error" onClick={deleteCard} disabled={saving}>Удалить</Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={closeDialog} disabled={saving}>Отмена</Button>
          <Button variant="contained" onClick={saveCard} disabled={saving}>
            {saving ? <CircularProgress size={18} /> : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Tasks;
