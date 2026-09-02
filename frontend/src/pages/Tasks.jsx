import {
  DndContext,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

const cardDndId = (id) => `card-${id}`;
const listDndId = (id) => `list-${id}`;

const SortableTaskCard = ({ card, columnCode, onEdit, canOrders, canClients }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardDndId(card.id),
    data: { type: 'card', card, listId: card.list },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <Paper
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(card)}
      sx={{ p: 1.5, mb: 1, cursor: 'grab' }}
    >
      <Typography variant="body2" fontWeight={600}>{card.title}</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
        {card.due_date && (
          <Chip
            size="small"
            label={formatDate(card.due_date)}
            color={isOverdue(card.due_date, columnCode) ? 'error' : 'default'}
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
  );
};

const DroppableColumn = ({ column, children }) => {
  const { setNodeRef } = useDroppable({
    id: listDndId(column.id),
    data: { type: 'list', listId: column.id },
  });
  return (
    <Paper ref={setNodeRef} sx={{ flex: '1 1 0', minWidth: 260, p: 1.5, bgcolor: '#EDF2F7' }}>
      {children}
    </Paper>
  );
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

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

  const findCard = (dndId) => {
    const pk = Number(String(dndId).replace('card-', ''));
    for (const column of board?.lists || []) {
      const card = (column.cards || []).find((item) => item.id === pk);
      if (card) return { card, column };
    }
    return null;
  };

  const onDragEnd = async ({ active, over }) => {
    if (!over || !board) return;
    const source = findCard(active.id);
    if (!source) return;
    let destListId = source.column.id;
    let destIndex = source.column.cards.findIndex((item) => item.id === source.card.id);
    if (String(over.id).startsWith('list-')) {
      destListId = Number(String(over.id).replace('list-', ''));
      const destCol = board.lists.find((column) => column.id === destListId);
      destIndex = destCol ? destCol.cards.length : 0;
    } else {
      const dest = findCard(over.id);
      if (!dest) return;
      destListId = dest.column.id;
      destIndex = dest.column.cards.findIndex((item) => item.id === dest.card.id);
    }
    if (destListId === source.column.id && destIndex === source.column.cards.findIndex((item) => item.id === source.card.id)) {
      return;
    }
    const snapshot = board;
    try {
      await api.patch(`/tasks/cards/${source.card.id}/`, { list: destListId, position: destIndex });
      await loadBoard(boardId);
    } catch (err) {
      setBoard(snapshot);
      notify(`Не удалось перенести карточку:\n${extractApiError(err)}`, 'error');
      await loadBoard(boardId);
    }
  };

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
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', overflowX: 'auto' }}>
            {(board?.lists || []).map((column) => (
              <DroppableColumn key={column.id} column={column}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>{column.name}</Typography>
                <SortableContext
                  items={(column.cards || []).map((card) => cardDndId(card.id))}
                  strategy={verticalListSortingStrategy}
                >
                  {(column.cards || []).map((card) => (
                    <SortableTaskCard
                      key={card.id}
                      card={card}
                      columnCode={column.code}
                      onEdit={openEdit}
                      canOrders={canOrders}
                      canClients={canClients}
                    />
                  ))}
                </SortableContext>
                <Button size="small" onClick={() => openCreate(column.id)}>+ Карточка</Button>
              </DroppableColumn>
            ))}
          </Box>
        </DndContext>
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
