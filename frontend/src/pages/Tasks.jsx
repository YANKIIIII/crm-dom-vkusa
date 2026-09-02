import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
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

const COLUMN_TONE = {
  todo: { bar: '#A0AEC0', wash: '#F7FAFC' },
  doing: { bar: '#CC5E33', wash: '#FBF6F3' },
  done: { bar: '#2F855A', wash: '#F3FAF6' },
};

const Icon = ({ name, size = 15 }) => (
  <span className="material-icons" style={{ fontSize: size, lineHeight: 1 }} aria-hidden="true">{name}</span>
);

const findCardIn = (board, dndId) => {
  const pk = Number(String(dndId).replace('card-', ''));
  for (const column of board?.lists || []) {
    const card = (column.cards || []).find((item) => item.id === pk);
    if (card) return { card, column };
  }
  return null;
};

const resolveDrop = (board, activeId, overId) => {
  const source = findCardIn(board, activeId);
  if (!source || overId == null) return null;
  if (String(overId).startsWith('list-')) {
    const destListId = Number(String(overId).replace('list-', ''));
    const destCol = board.lists.find((column) => column.id === destListId);
    if (!destCol) return null;
    if (source.column.id === destListId) return null;
    return { destListId, destIndex: destCol.cards.length };
  }
  const dest = findCardIn(board, overId);
  if (!dest) return null;
  return {
    destListId: dest.column.id,
    destIndex: dest.column.cards.findIndex((item) => item.id === dest.card.id),
  };
};

const moveCardInBoard = (board, cardId, destListId, destIndex) => {
  const lists = board.lists.map((column) => ({
    ...column,
    cards: [...(column.cards || [])],
  }));
  const sourceCol = lists.find((column) => column.cards.some((item) => item.id === cardId));
  const destCol = lists.find((column) => column.id === destListId);
  if (!sourceCol || !destCol) return board;
  const fromIndex = sourceCol.cards.findIndex((item) => item.id === cardId);
  if (fromIndex < 0) return board;
  if (sourceCol.id === destCol.id) {
    if (fromIndex === destIndex) return board;
    sourceCol.cards = arrayMove(sourceCol.cards, fromIndex, destIndex);
    return { ...board, lists };
  }
  const [card] = sourceCol.cards.splice(fromIndex, 1);
  const index = Math.max(0, Math.min(destIndex, destCol.cards.length));
  destCol.cards.splice(index, 0, { ...card, list: destListId });
  return { ...board, lists };
};

const ChipLabel = ({ icon, text }) => (
  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
    <Icon name={icon} size={14} />
    {text}
  </Box>
);

const chipSx = {
  height: 24,
  borderRadius: '6px',
  fontWeight: 500,
  '& .MuiChip-label': { px: 0.75 },
};

const TaskCardFace = ({ card, columnCode, canOrders, canClients, onEdit }) => {
  const overdue = isOverdue(card.due_date, columnCode);
  const clientName = `${card.client?.last_name || ''} ${card.client?.first_name || ''}`.trim();
  return (
    <>
      <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.35, color: '#1A202C' }}>
        {card.title}
      </Typography>
      {(card.due_date || card.order || card.client) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1.25 }}>
          {card.due_date && (
            <Chip
              size="small"
              label={<ChipLabel icon="event" text={formatDate(card.due_date)} />}
              color={overdue ? 'error' : 'default'}
              variant={overdue ? 'filled' : 'outlined'}
              sx={chipSx}
            />
          )}
          {card.order && (
            canOrders && onEdit ? (
              <Chip
                size="small"
                label={<ChipLabel icon="shopping_bag" text={`#${card.order.order_number}`} />}
                component={RouterLink}
                to={`/orders/${card.order.id}`}
                onClick={(event) => event.stopPropagation()}
                clickable
                variant="outlined"
                sx={chipSx}
              />
            ) : (
              <Chip size="small" label={<ChipLabel icon="shopping_bag" text={`#${card.order.order_number}`} />} variant="outlined" sx={chipSx} />
            )
          )}
          {card.client && (
            canClients && onEdit ? (
              <Chip
                size="small"
                label={<ChipLabel icon="person" text={clientName} />}
                component={RouterLink}
                to={`/clients/${card.client.id}`}
                onClick={(event) => event.stopPropagation()}
                clickable
                variant="outlined"
                sx={chipSx}
              />
            ) : (
              <Chip size="small" label={<ChipLabel icon="person" text={clientName} />} variant="outlined" sx={chipSx} />
            )
          )}
        </Box>
      )}
    </>
  );
};

const SortableTaskCard = ({ card, columnCode, onEdit, canOrders, canClients }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardDndId(card.id),
    data: { type: 'card', card, listId: card.list },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <Paper
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(card)}
      sx={{
        p: 1.5,
        mb: 1,
        cursor: 'grab',
        borderRadius: '12px',
        border: '1px solid #EDF2F7',
        boxShadow: '0 1px 2px rgba(26, 32, 44, 0.04)',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        '&:hover': {
          borderColor: '#E2E8F0',
          boxShadow: '0 8px 18px rgba(26, 32, 44, 0.08)',
        },
      }}
    >
      <TaskCardFace
        card={card}
        columnCode={columnCode}
        canOrders={canOrders}
        canClients={canClients}
        onEdit={onEdit}
      />
    </Paper>
  );
};

const DroppableColumn = ({ column, children, onAdd }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: listDndId(column.id),
    data: { type: 'list', listId: column.id },
  });
  const tone = COLUMN_TONE[column.code] || COLUMN_TONE.todo;
  const count = (column.cards || []).length;
  return (
    <Paper
      ref={setNodeRef}
      sx={{
        flex: '1 1 0',
        minWidth: 280,
        maxWidth: 360,
        display: 'flex',
        flexDirection: 'column',
        height: { xs: 420, md: 'calc(100vh - 220px)' },
        minHeight: 360,
        p: 0,
        overflow: 'hidden',
        bgcolor: isOver ? tone.wash : '#EEF2F6',
        borderRadius: '16px',
        boxShadow: 'none',
        border: isOver ? `1px solid ${tone.bar}` : '1px solid transparent',
        transition: 'background-color 150ms ease, border-color 150ms ease',
      }}
    >
      <Box sx={{ height: 4, bgcolor: tone.bar, flexShrink: 0 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.75, pt: 1.5, pb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1A202C', letterSpacing: 0.2 }}>
          {column.name}
        </Typography>
        <Box
          sx={{
            minWidth: 22,
            height: 22,
            px: 0.75,
            borderRadius: '999px',
            bgcolor: '#FFFFFF',
            color: '#4A5568',
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {count}
        </Box>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1.25, pb: 0.5 }}>
        {children}
        {count === 0 && (
          <Box
            sx={{
              border: '1px dashed #CBD5E0',
              borderRadius: '12px',
              py: 3,
              px: 1.5,
              textAlign: 'center',
              color: '#A0AEC0',
              fontSize: '0.8rem',
              mb: 1,
            }}
          >
            Пока пусто
          </Box>
        )}
      </Box>
      <Button
        onClick={() => onAdd(column.id)}
        startIcon={<Icon name="add" size={18} />}
        sx={{
          mx: 1.25,
          mb: 1.25,
          mt: 0.5,
          minHeight: 40,
          justifyContent: 'flex-start',
          textTransform: 'none',
          fontWeight: 600,
          color: '#4A5568',
          borderRadius: '10px',
          '&:hover': { bgcolor: 'rgba(204, 94, 51, 0.08)', color: '#CC5E33' },
        }}
      >
        Карточка
      </Button>
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
  const [activeDrag, setActiveDrag] = useState(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [createListId, setCreateListId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [orderOptions, setOrderOptions] = useState([]);
  const [clientOptions, setClientOptions] = useState([]);
  const loadRequestId = useRef(0);
  const boardRef = useRef(board);
  const dragSnapshotRef = useRef(null);
  const dragCardIdRef = useRef(null);
  const skipClickRef = useRef(false);
  boardRef.current = board;

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

  const onDragStart = ({ active }) => {
    skipClickRef.current = true;
    const found = findCardIn(boardRef.current, active.id);
    dragSnapshotRef.current = boardRef.current;
    dragCardIdRef.current = found?.card.id ?? null;
    setActiveDrag(found ? { card: found.card, columnCode: found.column.code } : null);
  };

  const onDragOver = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setBoard((current) => {
      if (!current) return current;
      const drop = resolveDrop(current, active.id, over.id);
      if (!drop) return current;
      const source = findCardIn(current, active.id);
      if (!source) return current;
      const fromIndex = source.column.cards.findIndex((item) => item.id === source.card.id);
      if (source.column.id === drop.destListId && fromIndex === drop.destIndex) return current;
      return moveCardInBoard(current, source.card.id, drop.destListId, drop.destIndex);
    });
  };

  const onDragEnd = async ({ over }) => {
    setActiveDrag(null);
    window.setTimeout(() => { skipClickRef.current = false; }, 0);
    const current = boardRef.current;
    const snapshot = dragSnapshotRef.current;
    const cardId = dragCardIdRef.current;
    dragSnapshotRef.current = null;
    dragCardIdRef.current = null;
    if (!current || !snapshot || !cardId) return;
    if (!over) {
      setBoard(snapshot);
      return;
    }
    const placed = findCardIn(current, cardDndId(cardId));
    if (!placed) return;
    const destIndex = placed.column.cards.findIndex((item) => item.id === placed.card.id);
    const origin = findCardIn(snapshot, cardDndId(cardId));
    if (
      origin
      && origin.column.id === placed.column.id
      && origin.column.cards.findIndex((item) => item.id === origin.card.id) === destIndex
    ) {
      return;
    }
    try {
      await api.patch(`/tasks/cards/${placed.card.id}/`, {
        list: placed.column.id,
        position: destIndex,
      });
    } catch (err) {
      setBoard(snapshot);
      notify(`Не удалось перенести карточку:\n${extractApiError(err)}`, 'error');
      await loadBoard(boardId);
    }
  };

  const onDragCancel = () => {
    setActiveDrag(null);
    if (dragSnapshotRef.current) setBoard(dragSnapshotRef.current);
    dragSnapshotRef.current = null;
    dragCardIdRef.current = null;
    window.setTimeout(() => { skipClickRef.current = false; }, 0);
  };

  const openCreate = (listId) => {
    setEditing(null);
    setCreateListId(listId);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (card) => {
    if (skipClickRef.current) return;
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
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', mb: 2.5, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" fontWeight={700} sx={{ letterSpacing: -0.3 }}>Задачи</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
            {isManager ? 'Личные доски сотрудников' : 'Ваша доска'}
          </Typography>
        </Box>
        {isManager && (
          <Box sx={{ minWidth: 260 }}>
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'stretch', overflowX: 'auto', pb: 1 }}>
            {(board?.lists || []).map((column) => (
              <DroppableColumn key={column.id} column={column} onAdd={openCreate}>
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
              </DroppableColumn>
            ))}
          </Box>
          <DragOverlay dropAnimation={null}>
            {activeDrag ? (
              <Paper
                sx={{
                  p: 1.5,
                  width: 268,
                  cursor: 'grabbing',
                  borderRadius: '12px',
                  transform: 'rotate(2deg)',
                  boxShadow: '0 16px 32px rgba(26, 32, 44, 0.16)',
                  border: '1px solid #E2E8F0',
                }}
              >
                <TaskCardFace
                  card={activeDrag.card}
                  columnCode={activeDrag.columnCode}
                  canOrders={canOrders}
                  canClients={canClients}
                />
              </Paper>
            ) : null}
          </DragOverlay>
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
